/**
 * Card-forms prefill mappers (U8).
 *
 * Pure transforms from a prefill data source (a stored match, a fixture + team
 * list, or a stats/central query result) into a partial `CardFormState` patch
 * the builder merges over the current editable state. Everything a mapper fills
 * lands in an ordinary editable field, so the admin can always override it (R14).
 *
 * DOM-free and hook-free: the page runs the generated query hooks and hands the
 * already-fetched DTOs here, which keeps these testable in isolation.
 */

import type {
  CardKind,
} from "@/lib/share-card";
import type {
  LadderRow,
  TeamListPlayer,
  WeekendWrapMatch,
  ClubLeaderboardLeader,
} from "@/lib/share-card";
import type {
  LadderCardRow,
  ClubSeasonGradeLeaders,
  WeekendWrap,
  Fixture,
  TeamListPlayer as TeamListPlayerDto,
} from "@workspace/api-client-react";
import type { CardFormState } from "./logic";

// --------------------------------------------------------------------------
// Small formatting helpers
// --------------------------------------------------------------------------

/** "2024/25" from the season start year. */
export function seasonLabelFromYear(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

/** The surname (last whitespace token) of a display name, upper-cased for the team-list style. */
function surnameOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] ?? "").toUpperCase();
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "SAT 14 DEC" — matches the bundle's match-day date style. */
function formatFixtureDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "";
  return d
    .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();
}

/** "12:00 PM". */
function formatFixtureTime(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "";
  return d
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
}

/** Whole days between now and the fixture start (never below 0). */
function daysUntil(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "";
  const ms = d.getTime() - Date.now();
  return String(Math.max(0, Math.ceil(ms / 86_400_000)));
}

/** "Round 8" from a fixture's round label / opponent line fallback. */
function roundLabelOf(fixture: Fixture): string {
  return (fixture.roundLabel ?? "").toUpperCase();
}

// --------------------------------------------------------------------------
// Match-derived context (senior match → the card's contextual fields)
// --------------------------------------------------------------------------

/** The subset of a match list row the context prefill reads. */
export interface MatchContext {
  opponent?: string | null;
  round?: number | null;
  season: number;
}

/**
 * Fill the contextual (non-performance) fields of a match-driven card from a
 * selected match + the picked grade. Player and performance figures stay for the
 * admin to enter (via the player typeahead / number fields), so nothing false is
 * ever asserted.
 */
export function matchContextPatch(
  kind: CardKind,
  grade: string,
  match: MatchContext,
): CardFormState {
  const opponent = match.opponent ?? "";
  const round = match.round ?? null;
  const season = seasonLabelFromYear(match.season);
  switch (kind) {
    case "century":
    case "fiveFor":
      return { grade, opponent, round };
    case "debut":
      return { grade, opponent, round, season };
    case "newCap":
    case "gradeLeader":
    case "record":
      return { grade };
    case "player":
      return { gradesPlayed: grade };
    case "bigMoment":
      return { oppositionName: opponent };
    default:
      return {};
  }
}

// --------------------------------------------------------------------------
// Fixture-derived (matchDay / teamList / countdown)
// --------------------------------------------------------------------------

export function fixtureToMatchDayState(fixture: Fixture): CardFormState {
  return {
    roundLabel: roundLabelOf(fixture),
    oppositionName: fixture.opponentName,
    oppositionLogoUrl: fixture.opponentLogoUrl ?? null,
    homeAway: fixture.isHome ? "HOME" : "AWAY",
    venue: fixture.venue ?? "",
    date: formatFixtureDate(fixture.startAt),
    startTime: formatFixtureTime(fixture.startAt),
  };
}

export function fixtureToCountdownState(fixture: Fixture): CardFormState {
  const date = formatFixtureDate(fixture.startAt);
  const venue = fixture.venue ?? "";
  return {
    daysToGo: daysUntil(fixture.startAt),
    eventLabel: roundLabelOf(fixture) || `${fixture.grade} vs ${fixture.opponentName}`.toUpperCase(),
    dateVenue: [date, venue].filter(Boolean).join(" • "),
    fixtureLine: `${fixture.grade} vs ${fixture.opponentName}`,
  };
}

/** The team-list meta fields (heading/competition/venue line) derived from a fixture. */
export function fixtureToTeamListMeta(fixture: Fixture): CardFormState {
  const round = roundLabelOf(fixture);
  const date = formatFixtureDate(fixture.startAt);
  const time = formatFixtureTime(fixture.startAt);
  const venue = fixture.venue ?? "";
  return {
    gradeRound: [fixture.grade.toUpperCase(), round].filter(Boolean).join(" — "),
    competitionLine: fixture.grade,
    venueDateTime: [venue, date, time].filter(Boolean).join(" • "),
  };
}

/**
 * Map a stored team list's players into the card's row shape, excluding fill-in
 * players (`playerId >= 90000`) which never appear on published cards.
 */
export function teamListPlayersToState(players: TeamListPlayerDto[]): {
  players: TeamListPlayer[];
} {
  const rows: TeamListPlayer[] = players
    .filter((p) => p.playerId == null || p.playerId < 90000)
    .map((p) => ({
      order: p.order,
      surname: surnameOf(p.displayName),
      role: p.role,
    }));
  return { players: rows };
}

// --------------------------------------------------------------------------
// Stats-derived (ladder / clubLeaderboard / weekendWrap)
// --------------------------------------------------------------------------

export function ladderRowsToState(
  grade: string,
  rows: LadderCardRow[],
): { competitionName: string; gradeLabel: string; rows: LadderRow[] } {
  const gradeLabel = grade.toUpperCase();
  return {
    competitionName: gradeLabel,
    gradeLabel,
    rows: rows.map((r) => ({
      pos: r.pos,
      team: r.team,
      played: r.played,
      won: r.won,
      lost: r.lost,
      points: r.points,
      isClub: r.isClub,
    })),
  };
}

export function clubSeasonTotalsToState(
  seasonYear: number,
  category: "Runs" | "Wickets",
  grades: ClubSeasonGradeLeaders[],
): {
  title: string;
  subtitle: string;
  season: string;
  category: "Runs" | "Wickets";
  leaders: ClubLeaderboardLeader[];
} {
  const leaders: ClubLeaderboardLeader[] = grades.map((g) => {
    const leader = category === "Runs" ? g.topRunScorer : g.topWicketTaker;
    return {
      gradeLabel: g.gradeLabel.toUpperCase(),
      playerName: leader?.playerName ?? "",
      value: leader != null ? String(leader.value) : "",
    };
  });
  return {
    title: category === "Runs" ? "CLUB RUN SCORERS" : "CLUB WICKET TAKERS",
    subtitle: `Leading ${category === "Runs" ? "run scorer" : "wicket taker"} in each grade`,
    season: seasonLabelFromYear(seasonYear),
    category,
    leaders,
  };
}

const WRAP_OUTCOME: Record<string, WeekendWrapMatch["outcome"]> = {
  WON: "won",
  LOST: "lost",
  "": "draw",
};

export function weekendWrapToState(wrap: WeekendWrap): {
  roundLabel: string;
  dateRange: string;
  matches: WeekendWrapMatch[];
} {
  return {
    roundLabel: wrap.roundLabel,
    dateRange: wrap.dateRange,
    matches: wrap.matches.map((m: WeekendWrap["matches"][number]) => ({
      gradeLabel: m.gradeLabel,
      resultLine: m.resultLine,
      performers: m.performers,
      outcome: WRAP_OUTCOME[m.outcome] ?? "draw",
    })),
  };
}
