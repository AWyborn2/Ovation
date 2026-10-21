/**
 * Team list content (ADR-010 P7), pure: a fixture's published side becomes the
 * content its team list card prints, for the team list carousel, the single
 * auto-queued card and Create a Card alike.
 *
 * The server builder (`api-server/src/lib/card-content/team-list.ts`) loads
 * the side (fill-ins out, withheld juniors masked, shirt numbers, debuts) and
 * makes the card input the sweep has always saved; this adds the display
 * values beside it. A side of up to 14 and its overseas marks (ADR-009) are
 * kept as the input has them.
 */

import {
  resolveCardCrest,
  resolveCardCompetition,
  resolveCardTeamName,
  teamMonogram,
  type CardNames,
} from "../card-names";
import { isJuniorGradeLabel } from "../junior-grade";
import { CLUB_TIME_ZONE, clubDay, normaliseRoundLabel } from "./match-day";
import type { TeamListContent, TeamListSource } from "./types";

/** The fixture a team list is for (a `fixtures` or `junior_fixtures` row fits). */
export interface TeamListFixtureLike {
  id: number;
  grade: string | null;
  roundLabel: string | null;
  opponentName: string | null;
  opponentLogoUrl?: string | null;
  venue: string | null;
  startAt: Date | null;
}

export interface TeamListContentOptions {
  names?: CardNames | null;
  /** A junior fixture (from the junior tables). A junior-looking grade counts too (fail closed). */
  junior?: boolean;
  juniorTeamName?: string | null;
  /** The label the card prints for the grade ("Under 13 — Blue"); default the fixture's grade. */
  gradeLabel?: string;
  timeZone?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** One fixture's team list content. `source` is kept as it is: it is the single card's input. */
export function teamListContent(
  fixture: TeamListFixtureLike,
  source: TeamListSource,
  opts: TeamListContentOptions = {},
): TeamListContent {
  const names = opts.names ?? null;
  const rawName = (fixture.opponentName ?? "").trim();
  const name = resolveCardTeamName(names, rawName) || rawName;
  const gradeRaw = (opts.gradeLabel ?? fixture.grade ?? "").trim();
  const homeAway = source.homeAway === "HOME" || source.homeAway === "AWAY" ? source.homeAway : "";
  return {
    kind: "teamList",
    page: "team",
    fixtureId: fixture.id,
    junior: opts.junior === true || source.junior === true || isJuniorGradeLabel(gradeRaw),
    juniorTeamName: opts.juniorTeamName ?? null,
    grade: resolveCardCompetition(names, gradeRaw) || gradeRaw,
    roundLabel: normaliseRoundLabel(fixture.roundLabel),
    opposition: {
      name,
      rawName,
      crestUrl: resolveCardCrest(names, rawName, fixture.opponentLogoUrl),
      monogram: teamMonogram(name),
    },
    homeAway,
    venue: (fixture.venue ?? "").trim(),
    date: str(source.date),
    startTime: str(source.startTime),
    day: fixture.startAt ? clubDay(fixture.startAt, opts.timeZone ?? CLUB_TIME_ZONE) : null,
    source,
  };
}

/** The optional team list fields a single card's input carries (photo and sponsor are the renderer's). */
const TEAM_LIST_INPUT_FIELDS = [
  "team.round",
  "team.oppositionCrest",
  "team.shirtNumbers",
  "team.debuts",
] as const;

/** A team list card with only `visible` fields shown, names final. */
function teamListProjection(
  c: TeamListContent,
  visible: ReadonlySet<string>,
): Record<string, unknown> {
  const round = visible.has("team.round") ? c.roundLabel : "";
  const numbers = visible.has("team.shirtNumbers") && c.source.numbering === "shirt";
  const crest = visible.has("team.oppositionCrest") ? c.opposition.crestUrl : null;
  const { numbering: _numbering, opponentLogoUrl: _logo, ...rest } = c.source;
  return {
    ...rest,
    gradeRound: [c.grade.toUpperCase(), round].filter(Boolean).join(" — "),
    competitionLine: c.grade,
    grade: c.grade,
    roundLabel: round,
    opponent: c.opposition.name,
    ...(crest ? { opponentLogoUrl: crest } : {}),
    players: c.source.players.map(({ debut, shirtNumber, ...p }) => ({
      ...p,
      ...(debut && visible.has("team.debuts") ? { debut } : {}),
      ...(shirtNumber && numbers ? { shirtNumber } : {}),
    })),
    ...(numbers ? { numbering: "shirt" } : {}),
    namesResolved: true,
  };
}

/**
 * The single card's input (the sweep's draft, Create a Card's prefill). With
 * every field the input carries shown (Standard, Full, or no settings) it is
 * exactly the input the sweep saved before the content pipeline, so existing
 * drafts are never rewritten. A club that hides a field gets the shown fields only.
 */
export function teamListDraftInput(
  content: TeamListContent,
  visible?: ReadonlySet<string> | null,
): Record<string, unknown> {
  if (!visible || TEAM_LIST_INPUT_FIELDS.every((f) => visible.has(f))) return content.source;
  return teamListProjection(content, visible);
}

/** A team list's carousel slide input, with only `visible` fields shown. */
export function teamListSlideInput(
  c: TeamListContent,
  visible: ReadonlySet<string>,
): Record<string, unknown> {
  return {
    ...teamListProjection(c, visible),
    junior: c.junior,
    ...(c.junior && c.juniorTeamName ? { juniorTeamName: c.juniorTeamName } : {}),
  };
}
