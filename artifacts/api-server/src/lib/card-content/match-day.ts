/**
 * The Match Day content builder (ADR-010 P2): the only place a fixture becomes
 * the content its card prints. The 48-hour sweep (`engines/match-day.ts`) and
 * the Weekend Carousel (`routes/weekend-carousel.ts`) both call it, so the
 * auto-queued card and the carousel slide for a fixture say the same thing
 * (the parity test, `match-day.db.test.ts`, holds them to it).
 *
 * Optional data (P5: ladder positions, last meeting, milestone watch) is
 * loaded only for the fields the caller asks for (`fields`, the visible ones);
 * missing data or a failed read leaves the field off the content, so it hides
 * itself (never "TBC"), and a failure is reported through `onOptionalError`.
 * The 48-hour sweep asks for none: its draft input is frozen (see
 * `matchDayDraftInput`), so its cards are unchanged.
 *
 * Juniors: a junior fixture is built only from junior sources (the junior
 * fixtures table via `juniorCarouselContent`) and flagged junior; senior and
 * junior content never share a slide.
 */

import type { FixtureRow } from "@workspace/db";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import type { CardNames } from "@workspace/scorecard/card-names";
import {
  ladderContent,
  lastMeetingContent,
  matchDayFixtureContent,
  milestoneWatchContent,
  type MatchDayDataField,
  type MatchDayFixtureContent,
} from "@workspace/scorecard/card-content";
import { loadCardNames } from "./names";
import { contentJuniorNames } from "./junior-names";
import {
  loadFixtureLadder,
  loadLastMeeting,
  milestoneWatchLoader,
  publishedSides,
  type OptionalDataTenant,
} from "./optional-data";
import { getTenantPlayhqOrgId, tenantCentralClubIdOrNull } from "../tenant";

/** How a junior fixture's slide names its side (from the junior fixtures table). */
export interface JuniorFixtureMeta {
  /** "Under 13 — Blue". */
  gradeLabel: string;
  juniorTeamName: string | null;
}

export interface BuildMatchDayOptions {
  /** Junior fixtures among `fixtures`, by fixture id. Absent → senior. */
  junior?: ReadonlyMap<number, JuniorFixtureMeta>;
  /** The club's names, when the caller already has them. */
  names?: CardNames;
  /**
   * The club's junior names (junior override tables only), when the caller
   * already has them. A junior side never takes the senior names.
   */
  juniorNames?: CardNames;
  onNamesError?: (err: unknown) => void;
  /** The optional data fields to load: the visible ones. Absent → none (core only). */
  fields?: ReadonlySet<MatchDayDataField>;
  /** A data field's read failed: the field is left off; the caller warns. */
  onOptionalError?: (field: MatchDayDataField, err: unknown) => void;
  now?: Date;
}

/** The warning a carousel shows when a data field's read failed. */
export const OPTIONAL_FIELD_WARNING: Record<MatchDayDataField, string> = {
  "fixture.ladder": "Ladder positions could not be loaded, so they are hidden.",
  "fixture.lastMeeting": "Last meeting results could not be loaded, so they are hidden.",
  "fixture.milestoneWatch": "Milestone watch could not be loaded, so it is hidden.",
};

/**
 * The club's short names and crests for content, best effort: any failure
 * (tenant DB or central) leaves the automatic names, so content always builds.
 */
export async function contentNames(
  tenantId: number,
  onError?: (err: unknown) => void,
): Promise<CardNames> {
  try {
    return await loadCardNames(tenantId, { onCentralError: onError });
  } catch (err) {
    onError?.(err);
    return {};
  }
}

/**
 * Each fixture's Match Day content, keyed by fixture id. The caller chooses
 * the fixtures (the sweep its 48-hour window and grade gates, the carousel its
 * date range minus byes and cancellations); the content is the same either way.
 */
export async function buildMatchDayContent(
  tenantId: number,
  fixtures: readonly FixtureRow[],
  opts: BuildMatchDayOptions = {},
): Promise<Map<number, MatchDayFixtureContent>> {
  const out = new Map<number, MatchDayFixtureContent>();
  if (!fixtures.length) return out;
  const isJunior = (f: FixtureRow) =>
    opts.junior?.has(f.id) === true || isJuniorGradeLabel(f.grade);
  const names = fixtures.some((f) => !isJunior(f))
    ? (opts.names ?? (await contentNames(tenantId, opts.onNamesError)))
    : {};
  const juniorNames = fixtures.some(isJunior)
    ? (opts.juniorNames ?? (await contentJuniorNames(tenantId, opts.onNamesError)))
    : {};
  for (const fixture of fixtures) {
    const junior = opts.junior?.get(fixture.id);
    out.set(
      fixture.id,
      matchDayFixtureContent(fixture, {
        // Club names only, never player data. A junior slide takes the
        // club's junior names, never the senior ones (juniors isolation).
        names: isJunior(fixture) ? juniorNames : names,
        ...(junior
          ? { junior: true, juniorTeamName: junior.juniorTeamName, gradeLabel: junior.gradeLabel }
          : {}),
      }),
    );
  }
  if (opts.fields?.size) await addOptionalData(tenantId, fixtures, out, opts);
  return out;
}

/**
 * Add the requested optional data to each senior fixture's content. Each
 * (field, fixture) read is independent: one failing hides that field on that
 * slide only, and is reported once per field.
 */
async function addOptionalData(
  tenantId: number,
  fixtures: readonly FixtureRow[],
  out: Map<number, MatchDayFixtureContent>,
  opts: BuildMatchDayOptions,
): Promise<void> {
  const fields = opts.fields!;
  const now = opts.now ?? new Date();
  const failed = new Set<MatchDayDataField>();
  const fail = (field: MatchDayDataField, err: unknown) => {
    if (failed.has(field)) return;
    failed.add(field);
    opts.onOptionalError?.(field, err);
  };
  const attempt = async <T>(field: MatchDayDataField, read: () => Promise<T>) => {
    try {
      return await read();
    } catch (err) {
      fail(field, err);
      return null;
    }
  };

  // Juniors isolation: no optional data on a junior slide, ever.
  const senior = fixtures.filter((f) => out.get(f.id)?.junior === false);
  if (!senior.length) return;
  let t: OptionalDataTenant;
  try {
    t = {
      tenantId,
      orgId: await getTenantPlayhqOrgId(tenantId),
      centralClubId: await tenantCentralClubIdOrNull(tenantId),
    };
  } catch (err) {
    for (const f of fields) fail(f, err);
    return;
  }

  const watch = fields.has("fixture.milestoneWatch")
    ? await attempt("fixture.milestoneWatch", async () => ({
        of: await milestoneWatchLoader(t),
        sides: await publishedSides(
          tenantId,
          senior.map((f) => f.id),
        ),
      }))
    : null;

  await Promise.all(
    senior.map(async (fixture) => {
      const content = out.get(fixture.id)!;
      const [ladder, lastMeeting] = await Promise.all([
        fields.has("fixture.ladder")
          ? attempt("fixture.ladder", () => loadFixtureLadder(t, fixture, now))
          : null,
        fields.has("fixture.lastMeeting")
          ? attempt("fixture.lastMeeting", () => loadLastMeeting(t, fixture, content.day))
          : null,
      ]);
      const ladderOut = ladderContent(ladder);
      if (ladderOut) content.ladder = ladderOut;
      const meetingOut = lastMeetingContent(lastMeeting);
      if (meetingOut) content.lastMeeting = meetingOut;
      const side = watch?.sides.get(fixture.id);
      const milestone = watch && side?.length ? milestoneWatchContent(watch.of(side)) : null;
      if (milestone) content.milestoneWatch = milestone;
    }),
  );
}
