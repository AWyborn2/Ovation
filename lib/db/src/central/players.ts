import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralFieldingTable,
  centralPlayersTable,
} from "../central";
import type { PlayerGradeStat } from "../schema";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows, type CentralClubMatchRow } from "./club-matches";
import {
  appGradeFromCentral,
  parseRound,
  parseSeasonStartYear,
  parseStage,
} from "./grades";
import { isPrivateParticipant, isPrivateRow } from "./privacy";
import {
  classifyFieldingKind,
  classifyInnings,
  emptyFieldingTally,
  round2,
} from "./scoring";
import { clubInvolvedWhere, inList } from "./where";

/**
 * Distinct central participants (PlayHQ GUIDs) who appeared for a club, with
 * display name + privacy flag. The source list for minting a tenant's
 * player_id_map. Unions roster, batting and bowling lines so a player who only
 * batted/bowled (no roster row) is still included.
 */
export async function centralClubParticipants(
  clubId: number,
): Promise<{ participantId: string; displayName: string | null; isPrivate: boolean }[]> {
  return withCentralCache(cacheKey("centralClubParticipants", [clubId]), () =>
    centralClubParticipantsImpl(clubId),
  );
}

async function centralClubParticipantsImpl(
  clubId: number,
): Promise<{ participantId: string; displayName: string | null; isPrivate: boolean }[]> {
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];

  const [rosters, batting, bowling] = await Promise.all([
    centralDb
      .selectDistinct({ participantId: centralMatchRostersTable.participantId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .selectDistinct({ participantId: centralMatchBattingTable.participantId })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .selectDistinct({ participantId: centralMatchBowlingTable.participantId })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
  ]);

  const ids = [
    ...new Set(
      [...rosters, ...batting, ...bowling]
        .map((r) => r.participantId)
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  if (ids.length === 0) return [];

  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inList(centralPlayersTable.participantId, ids));
  const byId = new Map(players.map((p) => [p.participantId, p]));

  return ids.map((participantId) => {
    const p = byId.get(participantId);
    return {
      participantId,
      displayName: p?.displayName ?? null,
      isPrivate: isPrivateRow(p),
    };
  });
}

/** Per-player career aggregate for a club, read from central (identity = GUID). */
export interface CentralPlayerCareer {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  games: number;
  runs: number;
  wickets: number;
  grades: string[];
}

/**
 * Career aggregates for every player a club fielded, read from the central PCA
 * database and keyed by PlayHQ `participant_id`. The API route translates the
 * GUID to the tenant's int id via player_id_map and shapes the player-directory
 * rows. Games = distinct matches the player appeared in (roster ∪ batting ∪
 * bowling); runs from batting; wickets from bowling; grades = the app grades of
 * those matches. Scorecard-era only.
 */
export async function centralPlayerCareers(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<CentralPlayerCareer[]> {
  return withCentralCache(cacheKey("centralPlayerCareers", [clubId]), () =>
    centralPlayerCareersImpl(clubId, preloadedMatchRows),
  );
}

async function centralPlayerCareersImpl(
  clubId: number,
  preloadedMatchRows?: CentralClubMatchRow[],
): Promise<CentralPlayerCareer[]> {
  const matchRows = preloadedMatchRows ?? (await getClubMatchRows(clubId));
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];

  // SQL-side aggregation (was: fetch every batting/bowling/roster line for the
  // club's whole history and fold them in a JS Map). Runs and wickets are
  // per-participant GROUP BY sums; `apps` unions the three sources' distinct
  // (participant, match) appearance pairs — the same Set-union the JS built —
  // and collapses them to one row per participant carrying the distinct match
  // count (games) and the distinct central grade LABELS of those matches. Only
  // the label -> app-grade mapping stays in JS (classifyCentralGrade is regex
  // logic that doesn't translate to SQL); it now runs on a handful of labels
  // per player instead of every raw line. The `is not null` / `<> ''` guards
  // mirror the old `if (!pid) continue` falsy check.
  const [batAgg, bowlAgg, appearanceRes] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        runs: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)::int`,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, matchIds),
          isNotNull(centralMatchBattingTable.participantId),
          ne(centralMatchBattingTable.participantId, ""),
        ),
      )
      .groupBy(centralMatchBattingTable.participantId),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        wickets: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)::int`,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, matchIds),
          isNotNull(centralMatchBowlingTable.participantId),
          ne(centralMatchBowlingTable.participantId, ""),
        ),
      )
      .groupBy(centralMatchBowlingTable.participantId),
    centralDb.execute(sql`
      with apps as (
        select
          ${centralMatchBattingTable.participantId} as participant_id,
          ${centralMatchBattingTable.matchId} as match_id
        from ${centralMatchBattingTable}
        where ${centralMatchBattingTable.clubId} = ${clubId}
          and ${inList(centralMatchBattingTable.matchId, matchIds)}
          and ${centralMatchBattingTable.participantId} is not null
          and ${centralMatchBattingTable.participantId} <> ''
        union
        select
          ${centralMatchBowlingTable.participantId},
          ${centralMatchBowlingTable.matchId}
        from ${centralMatchBowlingTable}
        where ${centralMatchBowlingTable.clubId} = ${clubId}
          and ${inList(centralMatchBowlingTable.matchId, matchIds)}
          and ${centralMatchBowlingTable.participantId} is not null
          and ${centralMatchBowlingTable.participantId} <> ''
        union
        select
          ${centralMatchRostersTable.participantId},
          ${centralMatchRostersTable.matchId}
        from ${centralMatchRostersTable}
        where ${centralMatchRostersTable.clubId} = ${clubId}
          and ${inList(centralMatchRostersTable.matchId, matchIds)}
          and ${centralMatchRostersTable.participantId} is not null
          and ${centralMatchRostersTable.participantId} <> ''
      )
      select
        a.participant_id as "participantId",
        count(distinct a.match_id)::int as games,
        json_agg(distinct m.grade) as "gradeLabels"
      from apps a
      join ${centralMatchesTable} m on m.match_id = a.match_id
      group by a.participant_id
    `),
  ]);
  const appearances = appearanceRes.rows as Array<{
    participantId: string;
    games: number;
    gradeLabels: (string | null)[] | null;
  }>;
  if (appearances.length === 0) return [];
  const runsByPid = new Map(batAgg.map((b) => [b.participantId, Number(b.runs)]));
  const wktsByPid = new Map(bowlAgg.map((b) => [b.participantId, Number(b.wickets)]));

  const ids = appearances.map((a) => a.participantId);
  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inList(centralPlayersTable.participantId, ids));
  const byId = new Map(players.map((p) => [p.participantId, p]));

  return appearances.map((a) => {
    const p = byId.get(a.participantId);
    const grades = [
      ...new Set(
        (a.gradeLabels ?? [])
          .map((g) => appGradeFromCentral(g))
          .filter((g): g is string => Boolean(g)),
      ),
    ].sort();
    return {
      participantId: a.participantId,
      displayName: p?.displayName ?? null,
      isPrivate: isPrivateRow(p),
      games: Number(a.games),
      runs: runsByPid.get(a.participantId) ?? 0,
      wickets: wktsByPid.get(a.participantId) ?? 0,
      grades,
    };
  });
}

/** One central player's club career: name + totals + per-grade PlayerGradeStat[]. */
export interface CentralPlayerDetail {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  games: number;
  runs: number;
  wickets: number;
  grades: string[];
  stats: PlayerGradeStat[];
}

/**
 * One player's career for a club, read from central and shaped as the player
 * detail page's per-grade `stats[]` (batting + bowling) plus career totals.
 * Keyed by participant GUID; the route translates the tenant int id → GUID via
 * player_id_map first. Returns null when the participant has no lines for the
 * club. Fielding/curated bits (premierships/awards) are not central — the route
 * returns them empty for central tenants. Scorecard-era only.
 */
export async function centralPlayerDetail(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerDetail | null> {
  return withCentralCache(
    cacheKey("centralPlayerDetail", [clubId, participantId]),
    () => centralPlayerDetailImpl(clubId, participantId),
  );
}

async function centralPlayerDetailImpl(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerDetail | null> {
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return null;
  const matchGrade = new Map(
    matchRows.map((m) => [m.matchId, appGradeFromCentral(m.grade)]),
  );

  const [batting, bowling, rosters, players] = await Promise.all([
    centralDb
      .select({
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          eq(centralMatchBattingTable.participantId, participantId),
          inList(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          eq(centralMatchBowlingTable.participantId, participantId),
          inList(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({ matchId: centralMatchRostersTable.matchId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          eq(centralMatchRostersTable.participantId, participantId),
          inList(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        displayName: centralPlayersTable.displayName,
        isPrivate: centralPlayersTable.isPrivate,
      })
      .from(centralPlayersTable)
      .where(eq(centralPlayersTable.participantId, participantId)),
  ]);

  interface G {
    games: Set<number>;
    innings: number;
    notOuts: number;
    runs: number;
    fifties: number;
    hundreds: number;
    hs: number;
    hsNotOut: boolean;
    wickets: number;
    runsConceded: number;
    bestW: number;
    bestR: number;
    fiveW: number;
  }
  const byGrade = new Map<string, G>();
  const grp = (grade: string): G => {
    let a = byGrade.get(grade);
    if (!a) {
      a = {
        games: new Set(),
        innings: 0,
        notOuts: 0,
        runs: 0,
        fifties: 0,
        hundreds: 0,
        hs: 0,
        hsNotOut: false,
        wickets: 0,
        runsConceded: 0,
        bestW: 0,
        bestR: 0,
        fiveW: 0,
      };
      byGrade.set(grade, a);
    }
    return a;
  };

  for (const r of rosters) {
    if (r.matchId === null) continue;
    const grade = matchGrade.get(r.matchId);
    if (grade) grp(grade).games.add(r.matchId);
  }
  for (const b of batting) {
    if (b.matchId === null) continue;
    const grade = matchGrade.get(b.matchId);
    if (!grade) continue;
    const a = grp(grade);
    a.games.add(b.matchId);
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    if (kind !== "dnb") {
      const runs = b.runs ?? 0;
      a.innings += 1;
      a.runs += runs;
      if (kind === "notout") a.notOuts += 1;
      if (runs >= 100) a.hundreds += 1;
      else if (runs >= 50) a.fifties += 1;
      if (runs > a.hs) {
        a.hs = runs;
        a.hsNotOut = kind === "notout";
      } else if (runs === a.hs && kind === "notout") {
        a.hsNotOut = true;
      }
    }
  }
  for (const bw of bowling) {
    if (bw.matchId === null) continue;
    const grade = matchGrade.get(bw.matchId);
    if (!grade) continue;
    const a = grp(grade);
    a.games.add(bw.matchId);
    const w = bw.wickets ?? 0;
    const r = bw.runs ?? 0;
    a.wickets += w;
    a.runsConceded += r;
    if (w >= 5) a.fiveW += 1;
    if (w > a.bestW || (w === a.bestW && w > 0 && r < a.bestR)) {
      a.bestW = w;
      a.bestR = r;
    }
  }

  const stats: PlayerGradeStat[] = [...byGrade.entries()]
    .map(([grade, a]) => {
      const dismissals = a.innings - a.notOuts;
      return {
        id: 0,
        playerId: 0,
        surname: "",
        givenName: "",
        grade,
        season: null,
        games: a.games.size,
        innings: a.innings,
        notOuts: a.notOuts,
        runs: a.runs,
        batAvg: dismissals > 0 ? round2(a.runs / dismissals) : null,
        highScore: a.innings === 0 ? null : `${a.hs}${a.hsNotOut ? "*" : ""}`,
        fifties: a.fifties,
        hundreds: a.hundreds,
        wickets: a.wickets,
        runsConceded: a.runsConceded,
        bowlAvg: a.wickets > 0 ? round2(a.runsConceded / a.wickets) : null,
        bestBowling: a.bestW > 0 ? `${a.bestW}/${a.bestR}` : null,
        fiveWickets: a.fiveW,
        catches: null,
        stumpings: null,
        runOuts: null,
      };
    })
    .sort((x, y) => x.grade.localeCompare(y.grade));

  if (stats.length === 0) return null;

  return {
    participantId,
    displayName: players[0]?.displayName ?? null,
    isPrivate: isPrivateRow(players[0]),
    games: stats.reduce((s, r) => s + (r.games ?? 0), 0),
    runs: stats.reduce((s, r) => s + (r.runs ?? 0), 0),
    wickets: stats.reduce((s, r) => s + (r.wickets ?? 0), 0),
    grades: stats.map((s) => s.grade),
    stats,
  };
}

/** One row of a player's per-(grade, season) breakdown — native
 *  /players/:id/seasons shape (zeros collapse to null like the SQL NULLIFs). */
export interface CentralPlayerSeasonRow {
  grade: string;
  season: number;
  games: number | null;
  innings: number | null;
  notOuts: number | null;
  runs: number | null;
  batAvg: number | null;
  highScore: string | null;
  fifties: number | null;
  hundreds: number | null;
  wickets: number | null;
  runsConceded: number | null;
  bowlAvg: number | null;
  bestBowling: string | null;
  fiveWickets: number | null;
  catches: number | null;
  stumpings: number | null;
  runOuts: number | null;
}

/**
 * A club player's per-(grade, season) career breakdown from central, mirroring
 * the native /players/:id/seasons rows (which the season-history tab renders).
 * Grades map via classifyCentralGrade; unmapped grades and unparseable seasons
 * are excluded, like every other central read.
 */
export async function centralPlayerSeasons(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerSeasonRow[]> {
  return withCentralCache(
    cacheKey("centralPlayerSeasons", [clubId, participantId]),
    () => centralPlayerSeasonsImpl(clubId, participantId),
  );
}

async function centralPlayerSeasonsImpl(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerSeasonRow[]> {
  if (await isPrivateParticipant(participantId)) return [];

  const matchRows = await getClubMatchRows(clubId);
  const keyOfMatch = new Map<number, { grade: string; season: number }>();
  for (const m of matchRows) {
    const grade = appGradeFromCentral(m.grade);
    const season = parseSeasonStartYear(m.season);
    if (!grade || season === null) continue;
    keyOfMatch.set(m.matchId, { grade, season });
  }
  if (keyOfMatch.size === 0) return [];
  const matchIds = [...keyOfMatch.keys()];

  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb
      .select({
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          eq(centralMatchBattingTable.participantId, participantId),
          inList(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          eq(centralMatchBowlingTable.participantId, participantId),
          inList(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({ matchId: centralMatchRostersTable.matchId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          eq(centralMatchRostersTable.participantId, participantId),
          inList(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          eq(centralFieldingTable.participantId, participantId),
          inList(centralFieldingTable.matchId, matchIds),
        ),
      ),
  ]);

  interface Agg {
    games: Set<number>;
    innings: number;
    notOuts: number;
    runs: number;
    fifties: number;
    hundreds: number;
    hs: number;
    hsNotOut: boolean;
    hasBat: boolean;
    wickets: number;
    runsConceded: number;
    bestW: number;
    bestR: number;
    fiveW: number;
    catches: number;
    stumpings: number;
    runOuts: number;
  }
  const byKey = new Map<string, { grade: string; season: number; a: Agg }>();
  const grp = (matchId: number | null): Agg | null => {
    if (matchId === null) return null;
    const key = keyOfMatch.get(matchId);
    if (!key) return null;
    const k = `${key.grade}|${key.season}`;
    let e = byKey.get(k);
    if (!e) {
      e = {
        grade: key.grade,
        season: key.season,
        a: {
          games: new Set(),
          innings: 0,
          notOuts: 0,
          runs: 0,
          fifties: 0,
          hundreds: 0,
          hs: -1,
          hsNotOut: false,
          hasBat: false,
          wickets: 0,
          runsConceded: 0,
          bestW: -1,
          bestR: -1,
          fiveW: 0,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
        },
      };
      byKey.set(k, e);
    }
    return e.a;
  };

  for (const r of rosters) {
    const a = grp(r.matchId);
    if (a && r.matchId !== null) a.games.add(r.matchId);
  }
  for (const b of batting) {
    const a = grp(b.matchId);
    if (!a || b.matchId === null) continue;
    a.games.add(b.matchId);
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    if (kind === "dnb") continue;
    const runs = b.runs ?? 0;
    a.hasBat = true;
    a.innings += 1;
    a.runs += runs;
    if (kind === "notout") a.notOuts += 1;
    if (runs >= 100) a.hundreds += 1;
    else if (runs >= 50) a.fifties += 1;
    if (runs > a.hs || (runs === a.hs && kind === "notout" && !a.hsNotOut)) {
      a.hs = runs;
      a.hsNotOut = kind === "notout";
    }
  }
  for (const b of bowling) {
    const a = grp(b.matchId);
    if (!a || b.matchId === null) continue;
    a.games.add(b.matchId);
    const w = b.wickets ?? 0;
    const r = b.runs ?? 0;
    a.wickets += w;
    a.runsConceded += r;
    if (w >= 5) a.fiveW += 1;
    if (w > a.bestW || (w === a.bestW && r < a.bestR)) {
      a.bestW = w;
      a.bestR = r;
    }
  }
  for (const f of fielding) {
    const a = grp(f.matchId);
    if (!a) continue;
    const cls = classifyFieldingKind(f.kind);
    if (cls === "catch") a.catches += 1;
    else if (cls === "stumping") a.stumpings += 1;
    else if (cls === "runOut") a.runOuts += 1;
  }

  const nz = (n: number): number | null => (n === 0 ? null : n);
  return [...byKey.values()]
    .map(({ grade, season, a }) => {
      const dismissals = a.innings - a.notOuts;
      return {
        grade,
        season,
        games: nz(a.games.size),
        innings: nz(a.innings),
        notOuts: nz(a.notOuts),
        runs: nz(a.runs),
        batAvg: dismissals > 0 ? a.runs / dismissals : null,
        highScore: a.hasBat && a.hs >= 0 ? `${a.hs}${a.hsNotOut ? "*" : ""}` : null,
        fifties: nz(a.fifties),
        hundreds: nz(a.hundreds),
        wickets: nz(a.wickets),
        runsConceded: nz(a.runsConceded),
        bowlAvg: a.wickets > 0 ? a.runsConceded / a.wickets : null,
        bestBowling: a.bestW >= 0 ? `${a.bestW}/${Math.max(a.bestR, 0)}` : null,
        fiveWickets: nz(a.fiveW),
        catches: nz(a.catches),
        stumpings: nz(a.stumpings),
        runOuts: nz(a.runOuts),
      };
    })
    .sort((x, y) => x.grade.localeCompare(y.grade) || x.season - y.season);
}

/** One row of a player's game-by-game log — native /players/:id/matches shape. */
export interface CentralPlayerMatchRow {
  matchId: number;
  grade: string;
  season: number;
  round: number | null;
  stage: string | null;
  matchDate: string | null;
  opponent: string | null;
  venue: string | null;
  result: string | null;
  batted: boolean;
  battingPos: number | null;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
  dismissal: string | null;
  bowled: boolean;
  overs: string | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  wides: number | null;
  noBalls: number | null;
  catches: number | null;
  stumpings: number | null;
  runOuts: number | null;
}

/**
 * A club player's game-by-game match log from central, mirroring the native
 * /players/:id/matches rows. Two-innings matches collapse to one row (sums;
 * first-innings batting position/dismissal), matching the one-line-per-match
 * native table. Sorted newest first (season, then round).
 */
export async function centralPlayerMatchLog(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerMatchRow[]> {
  return withCentralCache(
    cacheKey("centralPlayerMatchLog", [clubId, participantId]),
    () => centralPlayerMatchLogImpl(clubId, participantId),
  );
}

async function centralPlayerMatchLogImpl(
  clubId: number,
  participantId: string,
): Promise<CentralPlayerMatchRow[]> {
  if (await isPrivateParticipant(participantId)) return [];

  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb
      .select({
        matchId: centralMatchBattingTable.matchId,
        innings: centralMatchBattingTable.innings,
        batOrder: centralMatchBattingTable.batOrder,
        runs: centralMatchBattingTable.runs,
        balls: centralMatchBattingTable.balls,
        fours: centralMatchBattingTable.fours,
        sixes: centralMatchBattingTable.sixes,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          eq(centralMatchBattingTable.participantId, participantId),
        ),
      ),
    centralDb
      .select({
        matchId: centralMatchBowlingTable.matchId,
        overs: centralMatchBowlingTable.overs,
        maidens: centralMatchBowlingTable.maidens,
        runs: centralMatchBowlingTable.runs,
        wickets: centralMatchBowlingTable.wickets,
        wides: centralMatchBowlingTable.wides,
        noBalls: centralMatchBowlingTable.noBalls,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          eq(centralMatchBowlingTable.participantId, participantId),
        ),
      ),
    centralDb
      .select({ matchId: centralMatchRostersTable.matchId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          eq(centralMatchRostersTable.participantId, participantId),
        ),
      ),
    centralDb
      .select({
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          eq(centralFieldingTable.participantId, participantId),
        ),
      ),
  ]);

  const playedIds = new Set<number>();
  for (const rows of [batting, bowling, rosters, fielding])
    for (const r of rows) if (r.matchId !== null) playedIds.add(r.matchId);
  if (playedIds.size === 0) return [];

  // A long career runs to a few hundred matches — bind as one array parameter.
  const matches = await centralDb
    .select()
    .from(centralMatchesTable)
    .where(
      and(
        clubInvolvedWhere(clubId),
        inList(centralMatchesTable.matchId, [...playedIds]),
      ),
    );

  const out: CentralPlayerMatchRow[] = [];
  for (const m of matches) {
    const grade = appGradeFromCentral(m.grade);
    const season = parseSeasonStartYear(m.season);
    if (!grade || season === null) continue;

    const isHome = m.homeClubId === clubId;
    const batLines = batting
      .filter((b) => b.matchId === m.matchId)
      .sort((a, b) => (a.innings ?? 0) - (b.innings ?? 0));
    const played = batLines.filter(
      (b) => classifyInnings(b.dismissalType, b.dismissal) !== "dnb",
    );
    const bowlLines = bowling.filter((b) => b.matchId === m.matchId);
    const fld = emptyFieldingTally();
    for (const f of fielding) {
      if (f.matchId !== m.matchId) continue;
      const cls = classifyFieldingKind(f.kind);
      if (cls === "catch") fld.catches += 1;
      else if (cls === "stumping") fld.stumpings += 1;
      else if (cls === "runOut") fld.runOuts += 1;
    }

    const sumOf = <T>(rows: T[], pick: (r: T) => number | null): number | null => {
      let any = false;
      let total = 0;
      for (const r of rows) {
        const v = pick(r);
        if (v !== null) {
          any = true;
          total += v;
        }
      }
      return any ? total : null;
    };

    const lastBat = played[played.length - 1];
    const totalOvers = sumOf(bowlLines, (b) => b.overs);
    out.push({
      matchId: m.matchId,
      grade,
      season,
      round: parseRound(m.round),
      stage: parseStage(m.round),
      matchDate: m.matchDate,
      opponent: isHome ? m.awayTeam : m.homeTeam,
      venue: m.venue,
      result:
        m.resultText ??
        (m.winnerClubId == null ? null : m.winnerClubId === clubId ? "Won" : "Lost"),
      batted: played.length > 0,
      battingPos: played[0]?.batOrder ?? null,
      runs: sumOf(played, (b) => b.runs),
      balls: sumOf(played, (b) => b.balls),
      fours: sumOf(played, (b) => b.fours),
      sixes: sumOf(played, (b) => b.sixes),
      notOut:
        lastBat !== undefined &&
        classifyInnings(lastBat.dismissalType, lastBat.dismissal) === "notout",
      dismissal: played.map((b) => b.dismissal).filter(Boolean).join("; ") || null,
      bowled: bowlLines.length > 0,
      overs: totalOvers === null ? null : String(totalOvers),
      maidens: sumOf(bowlLines, (b) => b.maidens),
      runsConceded: sumOf(bowlLines, (b) => b.runs),
      wickets: sumOf(bowlLines, (b) => b.wickets),
      wides: sumOf(bowlLines, (b) => b.wides),
      noBalls: sumOf(bowlLines, (b) => b.noBalls),
      catches: fld.catches || null,
      stumpings: fld.stumpings || null,
      runOuts: fld.runOuts || null,
    });
  }

  out.sort(
    (a, b) => b.season - a.season || (b.round ?? -1) - (a.round ?? -1) || b.matchId - a.matchId,
  );
  return out;
}
