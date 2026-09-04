import { and, eq, sql } from "drizzle-orm";
import {
  centralDb,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralFieldingTable,
  centralLadderTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows, type CentralClubMatchRow } from "./club-matches";
import {
  appGradeFromCentral,
  classifyCentralGrade,
  parseSeasonStartYear,
} from "./grades";
import { centralPlayerCareers } from "./players";
import { battingInningsKindSql } from "./scoring";
import { inList } from "./where";

/**
 * Distinct central `matches.grade` labels for a club, with the app grade each
 * maps to and any attributable note. Used by the comparison script to make
 * grade-mapping decisions (folded sub-comps, divisions, exclusions) visible.
 */
export async function listCentralGradesForClub(
  clubId: number,
): Promise<{ centralGrade: string; appGrade: string | null; note?: string }[]> {
  return withCentralCache(cacheKey("listCentralGradesForClub", [clubId]), async () => {
    const matchRows = await getClubMatchRows(clubId);
    return [...new Set(matchRows.map((r) => r.grade))]
      .filter((g): g is string => Boolean(g))
      .sort()
      .map((centralGrade) => {
        const { appGrade, note } = classifyCentralGrade(centralGrade);
        return { centralGrade, appGrade, note };
      });
  });
}

/** Distinct season start-years a club played, newest-first (for the season picker). */
export async function centralClubSeasons(clubId: number): Promise<number[]> {
  return withCentralCache(cacheKey("centralClubSeasons", [clubId]), async () => {
    const rows = await getClubMatchRows(clubId);
    const set = new Set<number>();
    for (const r of rows) {
      const y = parseSeasonStartYear(r.season);
      if (y !== null) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  });
}

/**
 * Distinct app grades a club's central matches map to, optionally narrowed to
 * one season. Feeds the Top Performers grade-filter chips.
 */
export async function centralGradesForSeason(
  clubId: number,
  season: number | null,
): Promise<string[]> {
  return withCentralCache(cacheKey("centralGradesForSeason", [clubId, season]), async () => {
    const matchRows = await getClubMatchRows(clubId);
    const grades = new Set<string>();
    for (const m of matchRows) {
      if (season !== null && parseSeasonStartYear(m.season) !== season) continue;
      const g = appGradeFromCentral(m.grade);
      if (g) grades.add(g);
    }
    return [...grades].sort((a, b) => a.localeCompare(b));
  });
}

/**
 * Club-wide career totals for a tenant club, read from the central PCA database.
 * Identity-free (pure counts/sums, no GUID→int mapping needed), so it works for
 * any tenant club. Mirrors the app's home-overview `totals` block:
 *   - players: distinct participants who appeared for the club (from rosters)
 *   - games:   total appearances (one roster line per player per match)
 *   - runs:    sum of the club's batting runs
 *   - wickets: sum of the club's bowling wickets
 *   - grades:  distinct app-grades the club's matches map to
 *
 * Scorecard-era only (2002/03+), so for Halls Head (club 1) these differ from the
 * tenant totals that fold in pre-2002 history — the same expected divergence the
 * comparison script documents.
 */
export async function centralClubTotals(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<{
  players: number;
  games: number;
  runs: number;
  wickets: number;
  grades: number;
}> {
  return withCentralCache(cacheKey("centralClubTotals", [clubId]), () =>
    centralClubTotalsImpl(clubId, preloadedMatchRows),
  );
}

async function centralClubTotalsImpl(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<{
  players: number;
  games: number;
  runs: number;
  wickets: number;
  grades: number;
}> {
  const matchRows = preloadedMatchRows ?? (await getClubMatchRows(clubId));
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) {
    return { players: 0, games: 0, runs: 0, wickets: 0, grades: 0 };
  }
  const grades = new Set(
    matchRows
      .map((m) => appGradeFromCentral(m.grade))
      .filter((g): g is string => Boolean(g)),
  ).size;

  // Roster counts, batting sum and bowling sum are independent given matchIds —
  // run the three round trips in parallel. The roster read is a SQL aggregate
  // now (was: fetch every roster row and count in JS): games = count(*) (one
  // appearance per roster line), players = count(distinct participant_id),
  // with nullif('') mirroring the old `.filter(Boolean)` that dropped both
  // NULL and empty-string ids.
  const [[roster], [bat], [bowl]] = await Promise.all([
    centralDb
      .select({
        games: sql<number>`count(*)::int`,
        players: sql<number>`count(distinct nullif(${centralMatchRostersTable.participantId}, ''))::int`,
      })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({ runs: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)` })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({ wickets: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)` })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
  ]);

  return {
    players: Number(roster?.players ?? 0),
    games: Number(roster?.games ?? 0),
    runs: Number(bat?.runs ?? 0),
    wickets: Number(bowl?.wickets ?? 0),
    grades,
  };
}

/**
 * Points awarded per result, used to DERIVE the ladder card's `points` — the
 * central `ladder` table stores no points column, so it is computed here.
 * Adjust if the association's points system differs (win 6 / tie or wash 3 is
 * the common Australian community system).
 */
const LADDER_POINTS = { win: 6, tie: 3, noResult: 3, loss: 0 } as const;

/**
 * One ladder standings row shaped for the Pack A "Ladder" social card (A7).
 * `isClub` marks the tenant's own club so the card can highlight its row.
 */
export interface CentralLadderCardRow {
  pos: number;
  team: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  isClub: boolean;
}

/**
 * Grade standings from the central `ladder` table, shaped for the Ladder card.
 * First (and currently only) consumer of `centralLadderTable`.
 *
 * IMPORTANT data-shape caveat (verified against the live central schema): the
 * central `ladder` table is an ALL-TIME cumulative record per (grade, club) —
 * it has NO `season`, `points` or position columns. Consequences:
 *   - `season` is accepted for API symmetry with the other prefill reads and
 *     forward-compat, but does NOT filter — the table carries no season
 *     dimension, so every season returns the same all-time standings today.
 *     A genuinely season-scoped ladder is a follow-up (a new central table or a
 *     matches-derived computation), out of scope for this unit.
 *   - `points` is DERIVED from won/tied/no-result via {@link LADDER_POINTS}.
 *   - `pos` is DERIVED by ordering (points, wins, net result, played, name).
 *
 * `grade` is an app grade (e.g. "A Grade"); it resolves to the central grade
 * labels that map to it (same free-text space as `matches.grade`). Because
 * several central labels ("A Grade", "A Grade: Wyllie Cup", …) fold into one
 * app grade, a club can appear more than once — we keep one row per club (its
 * fullest / most-played all-time record) so the ladder has no duplicate teams.
 * An empty ladder (no rows for the grade) returns [] — never throws.
 */
export async function centralLadder(
  clubId: number,
  season: number | null,
  grade: string,
): Promise<CentralLadderCardRow[]> {
  // season is part of the cache key (and the public contract) even though the
  // all-time table can't filter on it — see the caveat above.
  return withCentralCache(cacheKey("centralLadder", [clubId, season, grade]), () =>
    centralLadderImpl(clubId, grade),
  );
}

async function centralLadderImpl(
  clubId: number,
  grade: string,
): Promise<CentralLadderCardRow[]> {
  const rows = await centralDb
    .select({
      grade: centralLadderTable.grade,
      clubId: centralLadderTable.clubId,
      club: centralLadderTable.club,
      played: centralLadderTable.played,
      won: centralLadderTable.won,
      lost: centralLadderTable.lost,
      tied: centralLadderTable.tied,
      noResult: centralLadderTable.noResult,
    })
    .from(centralLadderTable);

  const mapped = rows.filter((r) => appGradeFromCentral(r.grade) === grade);
  if (mapped.length === 0) return [];

  // Dedupe folded labels: one row per club, keeping its most-played record.
  const bestByClub = new Map<number | string, (typeof mapped)[number]>();
  for (const r of mapped) {
    const key = r.clubId ?? `name:${r.club ?? ""}`;
    const prev = bestByClub.get(key);
    if (!prev || (r.played ?? 0) > (prev.played ?? 0)) bestByClub.set(key, r);
  }

  const ranked = [...bestByClub.values()].map((r) => {
    const won = r.won ?? 0;
    const lost = r.lost ?? 0;
    const tied = r.tied ?? 0;
    const noResult = r.noResult ?? 0;
    return {
      team: r.club ?? "",
      played: r.played ?? 0,
      won,
      lost,
      points:
        won * LADDER_POINTS.win +
        tied * LADDER_POINTS.tie +
        noResult * LADDER_POINTS.noResult +
        lost * LADDER_POINTS.loss,
      isClub: r.clubId != null && r.clubId === clubId,
    };
  });

  ranked.sort(
    (a, b) =>
      b.points - a.points ||
      b.won - a.won ||
      b.won - b.lost - (a.won - a.lost) ||
      b.played - a.played ||
      a.team.localeCompare(b.team),
  );

  return ranked.map((r, i) => ({
    pos: i + 1,
    team: r.team,
    played: r.played,
    won: r.won,
    lost: r.lost,
    points: r.points,
    isClub: r.isClub,
  }));
}

// ---------------------------------------------------------------------------
// Central reads for the endpoints that were missed in the first migration pass
// (dashboard, grades). All seniors-only and scorecard-era (2002/03+), keyed by
// central club id; routes map the participant GUIDs to tenant int ids via
// player_id_map where they need them.
// ---------------------------------------------------------------------------

/** One grade's club-wide aggregate, matching the app's grade_summaries shape. */
export interface CentralGradeSummary {
  grade: string;
  players: number;
  games: number;
  innings: number;
  runs: number;
  wickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
}

export async function centralGradeSummaries(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<CentralGradeSummary[]> {
  return withCentralCache(cacheKey("centralGradeSummaries", [clubId]), () =>
    centralGradeSummariesImpl(clubId, preloadedMatchRows),
  );
}

async function centralGradeSummariesImpl(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<CentralGradeSummary[]> {
  const matchRows = preloadedMatchRows ?? (await getClubMatchRows(clubId));
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];
  const gradeOf = new Map(matchRows.map((m) => [m.matchId, appGradeFromCentral(m.grade)]));

  // Partially SQL-aggregated. The per-grade rollup itself must stay in JS —
  // "grade" is the JS label mapping (classifyCentralGrade) applied per match,
  // and the distinct players-per-grade count needs (participant, match)
  // granularity — but the per-row work is pushed down:
  //   - batting groups to one row per (participant, match) with the DNB-aware
  //     innings count and runs sum (classification via battingInningsKindSql),
  //     so the dismissal text columns never travel;
  //   - bowling groups to one wickets sum per match;
  //   - fielding groups to counts per (match, kind) — the JS regexes then run
  //     per distinct kind instead of per row.
  // Rosters stay row-level: every (participant, match) pair feeds the distinct
  // players/games sets and there is nothing smaller to fetch.
  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        innings: sql<number>`(count(*) filter (where ${battingInningsKindSql} <> 'dnb'))::int`,
        runs: sql<number>`coalesce(sum(coalesce(${centralMatchBattingTable.runs}, 0)) filter (where ${battingInningsKindSql} <> 'dnb'), 0)::int`,
      })
      .from(centralMatchBattingTable)
      .where(and(eq(centralMatchBattingTable.clubId, clubId), inList(centralMatchBattingTable.matchId, matchIds)))
      .groupBy(centralMatchBattingTable.participantId, centralMatchBattingTable.matchId),
    centralDb
      .select({
        matchId: centralMatchBowlingTable.matchId,
        wickets: sql<number>`coalesce(sum(coalesce(${centralMatchBowlingTable.wickets}, 0)), 0)::int`,
      })
      .from(centralMatchBowlingTable)
      .where(and(eq(centralMatchBowlingTable.clubId, clubId), inList(centralMatchBowlingTable.matchId, matchIds)))
      .groupBy(centralMatchBowlingTable.matchId),
    centralDb
      .select({
        participantId: centralMatchRostersTable.participantId,
        matchId: centralMatchRostersTable.matchId,
      })
      .from(centralMatchRostersTable)
      .where(and(eq(centralMatchRostersTable.clubId, clubId), inList(centralMatchRostersTable.matchId, matchIds))),
    centralDb
      .select({
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
        n: sql<number>`count(*)::int`,
      })
      .from(centralFieldingTable)
      .where(and(eq(centralFieldingTable.clubId, clubId), inList(centralFieldingTable.matchId, matchIds)))
      .groupBy(centralFieldingTable.matchId, centralFieldingTable.kind),
  ]);

  interface G {
    players: Set<string>;
    games: Set<number>;
    innings: number;
    runs: number;
    wickets: number;
    catches: number;
    stumpings: number;
    runOuts: number;
  }
  const byGrade = new Map<string, G>();
  const grp = (grade: string): G => {
    let a = byGrade.get(grade);
    if (!a) {
      a = { players: new Set(), games: new Set(), innings: 0, runs: 0, wickets: 0, catches: 0, stumpings: 0, runOuts: 0 };
      byGrade.set(grade, a);
    }
    return a;
  };

  for (const r of rosters) {
    if (r.matchId === null) continue;
    const grade = gradeOf.get(r.matchId);
    if (!grade) continue;
    const a = grp(grade);
    a.games.add(r.matchId);
    if (r.participantId) a.players.add(r.participantId);
  }
  for (const b of batting) {
    if (b.matchId === null) continue;
    const grade = gradeOf.get(b.matchId);
    if (!grade) continue;
    const a = grp(grade);
    a.games.add(b.matchId);
    if (b.participantId) a.players.add(b.participantId);
    a.innings += Number(b.innings);
    a.runs += Number(b.runs);
  }
  for (const b of bowling) {
    if (b.matchId === null) continue;
    const grade = gradeOf.get(b.matchId);
    if (!grade) continue;
    grp(grade).wickets += Number(b.wickets);
  }
  for (const f of fielding) {
    if (f.matchId === null) continue;
    const grade = gradeOf.get(f.matchId);
    if (!grade) continue;
    const a = grp(grade);
    const kind = (f.kind ?? "").toLowerCase();
    const n = Number(f.n);
    if (/stump/.test(kind)) a.stumpings += n;
    else if (/run\s*out/.test(kind)) a.runOuts += n;
    else if (/catch|caught|^c$/.test(kind)) a.catches += n;
  }

  return [...byGrade.entries()]
    .map(([grade, a]) => ({
      grade,
      players: a.players.size,
      games: a.games.size,
      innings: a.innings,
      runs: a.runs,
      wickets: a.wickets,
      catches: a.catches,
      stumpings: a.stumpings,
      runOuts: a.runOuts,
    }))
    .sort((x, y) => x.grade.localeCompare(y.grade));
}

export interface CentralDashboard {
  totalPlayers: number;
  totalGames: number;
  totalRuns: number;
  totalWickets: number;
  gradesCount: number;
  topRunScorer: { participantId: string; displayName: string | null; value: number } | null;
  topWicketTaker: { participantId: string; displayName: string | null; value: number } | null;
  topFielder: { participantId: string; displayName: string | null; value: number } | null;
  gradeSummaries: CentralGradeSummary[];
}

export async function centralDashboard(clubId: number): Promise<CentralDashboard> {
  return withCentralCache(cacheKey("centralDashboard", [clubId]), () =>
    centralDashboardImpl(clubId),
  );
}

async function centralDashboardImpl(clubId: number): Promise<CentralDashboard> {
  // Fetch the club's match rows ONCE and thread them into the three aggregate
  // reads (each used to re-issue the identical matches query) and this
  // function's own fielding fetch — 4 redundant round trips saved, and the
  // fielding read runs in parallel with the aggregates.
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows.map((m) => m.matchId);

  const [totals, gradeSummaries, careers, fielding] = await Promise.all([
    centralClubTotals(clubId, matchRows),
    centralGradeSummaries(clubId, matchRows),
    centralPlayerCareers(clubId, matchRows),
    matchIds.length
      ? centralDb
          .select({ participantId: centralFieldingTable.participantId, kind: centralFieldingTable.kind })
          .from(centralFieldingTable)
          .where(and(eq(centralFieldingTable.clubId, clubId), inList(centralFieldingTable.matchId, matchIds)))
      : Promise.resolve([]),
  ]);
  const catchesByPid = new Map<string, number>();
  for (const f of fielding) {
    if (!f.participantId) continue;
    const kind = (f.kind ?? "").toLowerCase();
    if (/catch|caught|^c$/.test(kind) && !/run\s*out|stump/.test(kind)) {
      catchesByPid.set(f.participantId, (catchesByPid.get(f.participantId) ?? 0) + 1);
    }
  }

  const ids = careers.map((c) => c.participantId);
  const privateById = new Map(careers.map((c) => [c.participantId, c.isPrivate]));
  const nameById = new Map(careers.map((c) => [c.participantId, c.displayName]));

  const pickTop = (
    score: (pid: string) => number,
  ): { participantId: string; displayName: string | null; value: number } | null => {
    let best: { participantId: string; value: number } | null = null;
    for (const pid of ids) {
      if (privateById.get(pid)) continue;
      const v = score(pid);
      if (v <= 0) continue;
      if (!best || v > best.value) best = { participantId: pid, value: v };
    }
    return best ? { participantId: best.participantId, displayName: nameById.get(best.participantId) ?? null, value: best.value } : null;
  };

  const runsByPid = new Map(careers.map((c) => [c.participantId, c.runs]));
  const wktsByPid = new Map(careers.map((c) => [c.participantId, c.wickets]));

  return {
    totalPlayers: totals.players,
    totalGames: totals.games,
    totalRuns: totals.runs,
    totalWickets: totals.wickets,
    gradesCount: gradeSummaries.length,
    topRunScorer: pickTop((pid) => runsByPid.get(pid) ?? 0),
    topWicketTaker: pickTop((pid) => wktsByPid.get(pid) ?? 0),
    topFielder: pickTop((pid) => catchesByPid.get(pid) ?? 0),
    gradeSummaries,
  };
}
