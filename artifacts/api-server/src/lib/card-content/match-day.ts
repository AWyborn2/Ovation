/**
 * The Match Day content builder (ADR-010 P2): the only place a fixture becomes
 * the content its card prints. The 48-hour sweep (`engines/match-day.ts`) and
 * the Weekend Carousel (`routes/weekend-carousel.ts`) both call it, so the
 * auto-queued card and the carousel slide for a fixture say the same thing
 * (the parity test, `match-day.db.test.ts`, holds them to it).
 *
 * Core fields only. Optional data (ladder, last meeting, milestone watch)
 * joins in P5, loaded only when its field is visible; a failed read hides the
 * field, never "TBC".
 *
 * Juniors: a junior fixture is built only from junior sources (the junior
 * fixtures table via `juniorCarouselContent`) and flagged junior; senior and
 * junior content never share a slide.
 */

import type { FixtureRow } from "@workspace/db";
import type { CardNames } from "@workspace/scorecard/card-names";
import {
  matchDayFixtureContent,
  type MatchDayFixtureContent,
} from "@workspace/scorecard/card-content";
import { loadCardNames } from "./names";

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
  onNamesError?: (err: unknown) => void;
}

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
  const names = opts.names ?? (await contentNames(tenantId, opts.onNamesError));
  for (const fixture of fixtures) {
    const junior = opts.junior?.get(fixture.id);
    out.set(
      fixture.id,
      matchDayFixtureContent(fixture, {
        // Club names only, never player data: junior slides shorten the
        // opposing club the same way the Studio always has.
        names,
        ...(junior
          ? { junior: true, juniorTeamName: junior.juniorTeamName, gradeLabel: junior.gradeLabel }
          : {}),
      }),
    );
  }
  return out;
}
