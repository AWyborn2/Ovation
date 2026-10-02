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

import type { CardKind } from "@/lib/share-card";
import type {
  LadderRow,
  TeamListPlayer,
  RoundTeam,
  WeekendWrapMatch,
  ClubLeaderboardLeader,
  ClubLeaderboardCategory,
} from "@/lib/share-card";
import type {
  LadderCardRow,
  ClubSeasonGradeLeaders,
  WeekendWrap,
  Fixture,
  MilestoneItem,
  Premiership,
  TeamList as TeamListDto,
  TeamListPlayer as TeamListPlayerDto,
} from "@workspace/api-client-react";
import { gradeTile, isJuniorGradeLabel } from "@workspace/scorecard";
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
    eventLabel:
      roundLabelOf(fixture) || `${fixture.grade} vs ${fixture.opponentName}`.toUpperCase(),
    dateVenue: [date, venue].filter(Boolean).join(" • "),
    fixtureLine: `${fixture.grade} vs ${fixture.opponentName}`,
  };
}

// --------------------------------------------------------------------------
// Round-derived (roundFixtures — game day, every grade this round)
// --------------------------------------------------------------------------

/**
 * Most grades one game-day card lists. A round with more posts as a balanced
 * card set (plan 2026-10-01-001), so the prefill keeps every grade.
 */
export const ROUND_FIXTURES_CAP = 5;

/** One round's fixtures, seniors and juniors kept apart (juniors isolation). */
export interface FixtureRound {
  /** Stable key for a select. */
  key: string;
  /** "ROUND 15", or "" when PlayHQ gave no round label. */
  roundLabel: string;
  /** The weekend's Saturday (local date, YYYY-MM-DD). */
  weekend: string;
  junior: boolean;
  /** Earliest start first. */
  fixtures: Fixture[];
}

/** YYYY-MM-DD (local) of the weekend a start falls in: Sunday → the day before, else the coming Saturday. */
function weekendOf(d: Date): string {
  const day = d.getDay();
  const shift = day === 0 ? -1 : (6 - day + 7) % 7;
  const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() + shift);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${sat.getFullYear()}-${pad(sat.getMonth() + 1)}-${pad(sat.getDate())}`;
}

/**
 * Group fixtures into rounds: the same round label on the same weekend (a
 * round's grades can span Friday night to Sunday). Senior and junior grades
 * never share a group, so a game-day card never blends them. Rounds come
 * back in date order.
 */
export function groupFixturesByRound(fixtures: readonly Fixture[]): FixtureRound[] {
  const groups = new Map<string, FixtureRound>();
  for (const f of fixtures) {
    const d = parseDate(f.startAt);
    if (!d) continue;
    const weekend = weekendOf(d);
    const roundLabel = roundLabelOf(f);
    const junior = isJuniorGradeLabel(f.grade);
    const key = `${weekend}|${roundLabel}|${junior ? "junior" : "senior"}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, roundLabel, weekend, junior, fixtures: [] };
      groups.set(key, g);
    }
    g.fixtures.push(f);
  }
  const start = (f: Fixture) => parseDate(f.startAt)?.getTime() ?? 0;
  const out = [...groups.values()];
  for (const g of out) g.fixtures.sort((a, b) => start(a) - start(b) || a.id - b.id);
  return out.sort(
    (a, b) =>
      start(a.fixtures[0]) - start(b.fixtures[0]) || (a.junior ? 1 : 0) - (b.junior ? 1 : 0),
  );
}

export { gradeTile };

/** "SATURDAY 14 FEB". */
function formatRoundDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return "";
  return d
    .toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })
    .replace(",", "")
    .toUpperCase();
}

/** A round's fixtures → the game-day card's fields (every grade; a long round becomes a set). */
export function fixtureRoundToState(round: FixtureRound): CardFormState {
  const first = round.fixtures[0];
  return {
    roundLabel: round.roundLabel,
    date: formatRoundDate(first?.startAt),
    fixtures: round.fixtures.map((f) => ({
      grade: gradeTile(f.grade),
      opponent: f.opponentName,
      venue: f.venue || (f.isHome ? "Home" : "Away"),
      startTime: formatFixtureTime(f.startAt),
    })),
    junior: round.junior,
  };
}

/** The select label for a round: "ROUND 15 · SAT 14 FEB · 4 grades (juniors)". */
export function fixtureRoundLabel(round: FixtureRound): string {
  const n = round.fixtures.length;
  return [
    round.roundLabel || "Round",
    formatFixtureDate(round.fixtures[0]?.startAt),
    `${n} grade${n === 1 ? "" : "s"}${round.junior ? " (juniors)" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");
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

/**
 * A round's PUBLISHED team lists → the round team-lists card (`teamListRound`):
 * one team per fixture whose XI is saved and published, in start order. Each
 * team carries exactly what that fixture's single team-list card would, so a
 * set's team slide matches the card posted on its own. Unpublished or missing
 * lists are left out; fill-ins are excluded as on every card.
 */
export function fixtureRoundTeamsToState(
  round: FixtureRound,
  lists: ReadonlyMap<number, TeamListDto | null | undefined>,
): { roundLabel: string; date: string; teams: RoundTeam[] } {
  const teams: RoundTeam[] = [];
  for (const f of round.fixtures) {
    const list = lists.get(f.id);
    if (!list || !list.isPublished) continue;
    const { players } = teamListPlayersToState(list.players);
    if (players.length === 0) continue;
    const meta = fixtureToTeamListMeta(f) as Omit<RoundTeam, "grade" | "players">;
    teams.push({ grade: f.grade, ...meta, players });
  }
  return {
    roundLabel: round.roundLabel,
    date: formatRoundDate(round.fixtures[0]?.startAt),
    teams,
  };
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

const CLUB_LEADER_COPY: Record<ClubLeaderboardCategory, { title: string; subtitle: string }> = {
  Runs: { title: "CLUB RUN SCORERS", subtitle: "Leading run scorer in each grade" },
  Wickets: { title: "CLUB WICKET TAKERS", subtitle: "Leading wicket taker in each grade" },
  Catches: { title: "CLUB CATCHERS", subtitle: "Most catches in each grade" },
  Dismissals: { title: "SAFE HANDS", subtitle: "Most catches and stumpings in each grade" },
};

export function clubSeasonTotalsToState(
  seasonYear: number,
  category: ClubLeaderboardCategory,
  grades: ClubSeasonGradeLeaders[],
): {
  title: string;
  subtitle: string;
  season: string;
  category: ClubLeaderboardCategory;
  leaders: ClubLeaderboardLeader[];
} {
  const leaders: ClubLeaderboardLeader[] = grades.map((g) => {
    const leader =
      category === "Runs"
        ? g.topRunScorer
        : category === "Wickets"
          ? g.topWicketTaker
          : category === "Catches"
            ? (g.topCatches ?? null)
            : (g.topDismissals ?? null);
    return {
      gradeLabel: g.gradeLabel.toUpperCase(),
      playerName: leader?.playerName ?? "",
      value: leader != null ? String(leader.value) : "",
    };
  });
  return {
    ...CLUB_LEADER_COPY[category],
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

// --------------------------------------------------------------------------
// Milestone / premiership (the club's own milestone feed and premierships)
// --------------------------------------------------------------------------

const BOARD_LABEL: Record<string, string> = {
  games: "Games",
  runs: "Runs",
  wickets: "Wickets",
  dismissals: "Dismissals",
};

/**
 * A career-tier crossing from the club's milestone feed (`GET /milestones`,
 * central-backed for a central-data club) → the Milestone card's fields.
 */
export function milestoneItemToState(item: MilestoneItem): CardFormState {
  const key = item.boardKey ?? "games";
  const label = BOARD_LABEL[key] ?? key;
  const threshold = item.threshold ?? item.value;
  return {
    playerName: item.playerName,
    tierLabel: `${threshold} ${label}`,
    tierIndex: Math.min(Math.max(item.tierIndex ?? 0, 0), 6),
    milestoneLabel: `Career ${label}`,
    currentValue: item.value,
    threshold,
    headline: `${threshold} career ${label.toLowerCase()}`,
  };
}

/** Season start year of a premiership won in calendar `year` (finals Jan–Jun close the previous season). */
export function premiershipSeasonYear(p: Pick<Premiership, "year" | "matchDate">): number {
  const m = /^(\d{4})-(\d{2})/.exec(p.matchDate ?? "");
  if (m) return Number(m[2]) >= 7 ? Number(m[1]) : Number(m[1]) - 1;
  return p.year - 1;
}

/** One of the club's premierships → the Premiership card's fields. */
export function premiershipToState(p: Premiership): CardFormState {
  return {
    grade: p.grade,
    year: premiershipSeasonYear(p),
    competition: p.competition,
    result: p.result ?? "",
    mom: p.mom ?? "",
  };
}
