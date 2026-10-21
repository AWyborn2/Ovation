/**
 * The team list content builders (ADR-010 P7): the only place a published
 * side becomes the content its team list card prints. The team list sweeps
 * (`engines/team-list.ts`, `engines/junior-team-list.ts`), the team list
 * carousel (`carousel-content.ts`, `junior-carousel-content.ts`) and Create a
 * Card's prefill (`routes/social-prefill.ts`) all call them, so an
 * auto-queued card, a carousel slide and a card made by hand say the same
 * thing (`team-list.db.test.ts` holds them to it).
 *
 * What a side prints is unchanged from the sweep: fill-ins (player id 90000+)
 * left out, a side of up to 14 with its overseas marks (ADR-009), season
 * shirt numbers and debut badges for seniors. The caller picks the fixtures
 * and lists (published, in its window).
 *
 * Juniors: a junior side is built only from junior sources. A junior fixture
 * (`junior_fixtures`) uses the junior register and the club's public junior
 * naming; a junior-looking grade among the club's fixtures is treated as
 * junior too (fail closed): no senior identities, shirt numbers or debuts, and
 * any player without a public identity is withheld.
 */

import type {
  FixtureRow,
  JuniorFixtureRow,
  JuniorTeamListPlayer,
  TeamListPlayer,
  TeamListRow,
} from "@workspace/db";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import type { CardNames } from "@workspace/scorecard/card-names";
import { contentJuniorNames } from "./junior-names";
import {
  teamListContent,
  type TeamListContent,
  type TeamListSource,
} from "@workspace/scorecard/card-content";
import { logger } from "../logger";
import { getPrivateIds, loadJuniorNaming, resolveUnlinkedJuniorOpponent } from "../junior-helpers";
import { overlayNativeOpponents } from "../club-brand";
import { JUNIOR_WITHHELD_NAME, type JuniorNaming } from "../junior-names";
import { loadJuniorSeasonShirtNumbers } from "../junior-shirt-numbers";
import { recoverPublishedSelectionIdentities } from "../selection-published-players";
import {
  loadAutoDebuts,
  teamListCategoryOf,
  teamListSeasonOf,
  teamListShirtNumberLoader,
  teamListToCardInput,
  type TeamListShirtNumbers,
} from "../engines/team-list";
import { juniorCardNamer, juniorTeamListToCardInput } from "../engines/junior-team-list";
import { contentNames } from "./match-day";

/** A fixture and its saved list. */
export interface TeamListSide {
  fixture: FixtureRow;
  list: Pick<TeamListRow, "tenantId" | "fixtureId" | "source" | "isPublished" | "players">;
}

export interface BuildTeamListOptions {
  names?: CardNames;
  /**
   * The club's junior names (junior override tables only), when the caller
   * already has them. A junior side never takes the senior names.
   */
  juniorNames?: CardNames;
  onNamesError?: (err: unknown) => void;
  /** A side the builder could only partly verify (the carousel shows it). */
  onWarning?: (fixture: FixtureRow, warning: string) => void;
}

/**
 * Each side's team list content, in `sides` order: the card the sweep drafts
 * (`teamListDraftInput`), the carousel slide and Create a Card's prefill.
 */
export async function buildTeamListContent(
  tenantId: number,
  sides: readonly TeamListSide[],
  opts: BuildTeamListOptions = {},
): Promise<TeamListContent[]> {
  if (!sides.length) return [];
  const anyJunior = sides.some((s) => isJuniorGradeLabel(s.fixture.grade));
  const names = sides.some((s) => !isJuniorGradeLabel(s.fixture.grade))
    ? (opts.names ?? (await contentNames(tenantId, opts.onNamesError)))
    : {};
  const juniorNames = anyJunior
    ? (opts.juniorNames ?? (await contentJuniorNames(tenantId, opts.onNamesError)))
    : {};
  const numbers = teamListShirtNumberLoader(tenantId);
  let privateIds: Set<string> | null = null;
  const out: TeamListContent[] = [];
  for (const { fixture, list } of sides) {
    const junior = isJuniorGradeLabel(fixture.grade);
    const shirtNumbers = junior
      ? null
      : await numbers(teamListSeasonOf(fixture), teamListCategoryOf(fixture));
    // Old Selection Hub publications get their identities back only when the
    // whole finalised side agrees (read time; the saved list is never changed).
    const resolved = shirtNumbers
      ? await recoverPublishedSelectionIdentities(tenantId, list, fixture.startAt)
      : { players: list.players };
    if (resolved.warning) opts.onWarning?.(fixture, resolved.warning);
    privateIds ??= junior ? await getPrivateIds(tenantId) : null;
    // A junior side never looks up senior identities, shirt numbers or debut records.
    const players: TeamListPlayer[] = resolved.players.map((p) =>
      junior && (!p.participantId || privateIds!.has(p.participantId))
        ? {
            ...p,
            displayName: JUNIOR_WITHHELD_NAME,
            playerId: undefined,
            participantId: undefined,
            debut: false,
          }
        : p,
    );
    const source = {
      ...teamListToCardInput(
        fixture,
        players,
        junior ? new Set() : await loadAutoDebuts(tenantId, players, fixture.startAt),
        shirtNumbers,
      ),
      ...(junior ? { junior: true } : {}),
    } as TeamListSource;
    out.push(teamListContent(fixture, source, { names: junior ? juniorNames : names, junior }));
  }
  return out;
}

/** A junior fixture and its published list. */
export interface JuniorTeamListSide {
  fixture: JuniorFixtureRow;
  players: readonly JuniorTeamListPlayer[];
}

export interface BuildJuniorTeamListOptions {
  /** The club's junior names (junior override tables), when the caller already has them. */
  juniorNames?: CardNames;
  onNamesError?: (err: unknown) => void;
  /** The club's junior naming, when the caller loaded it for these players. */
  naming?: JuniorNaming;
  /** The juniors register for a season, when the caller already reads it. */
  numbersFor?: (season: number) => Promise<TeamListShirtNumbers | null>;
}

/** A junior fixture's grade as its cards print it: "Under 13 — Blue". */
export function juniorTeamGrade(f: Pick<JuniorFixtureRow, "ageGroup" | "grade" | "teamName">) {
  const grade = f.ageGroup || f.grade || "Juniors";
  return f.teamName && f.teamName !== grade ? `${grade} — ${f.teamName}` : grade;
}

/** A junior opponent's crest from the clubs register, best effort (none on a failed read). */
export async function juniorOpponentCrest(name: string | null | undefined): Promise<string | null> {
  try {
    const [club] = await overlayNativeOpponents([await resolveUnlinkedJuniorOpponent(name)]);
    return club?.logoUrl128 ?? club?.logoUrl ?? null;
  } catch (err) {
    logger.warn({ err }, "junior opponent crest lookup failed");
    return null;
  }
}

/** A per-run reader of the juniors register: each season at most once; a failure is "no numbers". */
export function juniorShirtNumberReader(tenantId: number) {
  const seasons = new Map<number, Promise<TeamListShirtNumbers | null>>();
  return (season: number) => {
    let pending = seasons.get(season);
    if (!pending) {
      pending = loadJuniorSeasonShirtNumbers(tenantId, season).catch((err: unknown) => {
        logger.warn({ err, tenantId, season }, "junior team-list shirt-number lookup failed");
        return null;
      });
      seasons.set(season, pending);
    }
    return pending;
  };
}

/**
 * Each junior side's team list content, in `sides` order, from the junior
 * tables only: names in the club's public junior naming (withheld players as
 * "Private Player", with no number or overseas mark), shirt numbers from the
 * juniors register.
 */
export async function buildJuniorTeamListContent(
  tenantId: number,
  sides: readonly JuniorTeamListSide[],
  opts: BuildJuniorTeamListOptions = {},
): Promise<TeamListContent[]> {
  if (!sides.length) return [];
  // Junior names only: a junior side never takes the senior names.
  const names = opts.juniorNames ?? (await contentJuniorNames(tenantId, opts.onNamesError));
  const naming =
    opts.naming ??
    (await loadJuniorNaming(
      tenantId,
      sides.flatMap((s) => s.players.map((p) => p.participantId)),
    ));
  const nameOf = juniorCardNamer(naming);
  const numbersFor = opts.numbersFor ?? juniorShirtNumberReader(tenantId);
  const out: TeamListContent[] = [];
  for (const { fixture, players } of sides) {
    const source = juniorTeamListToCardInput(
      fixture,
      [...players],
      nameOf,
      await numbersFor(fixture.seasonStartYear),
    ) as TeamListSource;
    out.push(
      teamListContent(
        {
          id: fixture.id,
          grade: fixture.grade ?? fixture.ageGroup,
          roundLabel: null,
          opponentName: fixture.opponentName,
          opponentLogoUrl: await juniorOpponentCrest(fixture.opponentName),
          venue: fixture.venue,
          startAt: fixture.startAt,
        },
        source,
        {
          names,
          junior: true,
          juniorTeamName: fixture.teamName ?? null,
          gradeLabel: juniorTeamGrade(fixture),
        },
      ),
    );
  }
  return out;
}
