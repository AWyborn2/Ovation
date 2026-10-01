import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralFieldingTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows } from "./club-matches";
import { appGradeFromCentral, parseSeasonStartYear, seasonLabelFromStartYear } from "./grades";
import { canonicalGuid, canonicalizeLines, mergesCacheArg, type CentralMerges } from "./merges";
import { centralPlayerNames } from "./privacy";
import { classifyFieldingKind, classifyInnings } from "./scoring";
import { clubInvolvedWhere, inList } from "./where";

/** A club-record holder (top player for a counting stat). */
export interface CentralRecordHolder {
  participantId: string;
  displayName: string | null;
  value: number;
  grades: string[];
}
/** A single-innings club record (highest score / best bowling). */
export interface CentralRecordInnings {
  participantId: string;
  displayName: string | null;
  grade: string | null;
  value: string; // "107*" or "5/12"
}

export interface CentralClubRecords {
  mostGames: CentralRecordHolder | null;
  mostRuns: CentralRecordHolder | null;
  mostWickets: CentralRecordHolder | null;
  mostCatches: CentralRecordHolder | null;
  mostFifties: CentralRecordHolder | null;
  mostHundreds: CentralRecordHolder | null;
  highestScore: CentralRecordInnings | null;
  bestBowling: CentralRecordInnings | null;
}

/**
 * All-time club records from central: most games/runs/wickets/catches/50s/100s
 * (top non-private player), plus the highest individual score and best bowling
 * (single innings). Keyed by participant GUID; the route maps the holders' ids
 * via player_id_map. Scorecard-era only.
 */
export async function centralClubRecords(
  clubId: number,
  filter?: CentralRecordsFilter,
  /** The tenant's confirmed merges: a merged pair is one record holder. */
  merges?: CentralMerges,
): Promise<CentralClubRecords> {
  // No filter: the original all-time read (the match set is exactly what it
  // always was).
  if (!hasRecordsFilter(filter)) {
    return withCentralCache(cacheKey("centralClubRecords", [clubId, mergesCacheArg(merges)]), () =>
      centralClubRecordsImpl(clubId, undefined, merges),
    );
  }
  return withCentralCache(
    cacheKey("centralClubRecords", [clubId, filter, mergesCacheArg(merges)]),
    () => centralClubRecordsImpl(clubId, filter, merges),
  );
}

/** Optional grade / season-span restriction for the records reads (KTD5). */
export interface CentralRecordsFilter {
  /** App grade label ("A Grade", "1st Grade"). */
  grade?: string;
  /** Inclusive season start years. */
  fromSeason?: number;
  toSeason?: number;
}

function hasRecordsFilter(f: CentralRecordsFilter | undefined): f is CentralRecordsFilter {
  return !!f && (f.grade !== undefined || f.fromSeason !== undefined || f.toSeason !== undefined);
}

/**
 * The club's matches restricted to senior grades (junior / pathway / unmapped
 * labels dropped — juniors isolation) and, optionally, one app grade and an
 * inclusive season span.
 */
export function filterSeniorMatchRows<T extends { grade: string | null; season: string | null }>(
  rows: T[],
  filter: CentralRecordsFilter = {},
): T[] {
  return rows.filter((m) => {
    const grade = appGradeFromCentral(m.grade);
    if (!grade) return false;
    if (filter.grade !== undefined && grade !== filter.grade) return false;
    if (filter.fromSeason !== undefined || filter.toSeason !== undefined) {
      const season = parseSeasonStartYear(m.season);
      if (season === null) return false;
      if (filter.fromSeason !== undefined && season < filter.fromSeason) return false;
      if (filter.toSeason !== undefined && season > filter.toSeason) return false;
    }
    return true;
  });
}

async function centralClubRecordsImpl(
  clubId: number,
  filter?: CentralRecordsFilter,
  merges?: CentralMerges,
): Promise<CentralClubRecords> {
  // Deliberately still JS-aggregated (unlike centralGradeLeaderboard): the
  // single-innings records (highestScore / bestBowling) and every topBy()
  // holder resolve ties by FIRST-encountered row/insertion order, which is the
  // database's unspecified fetch order — a SQL `order by ... limit 1` would
  // silently pick a different (if equally arbitrary) holder on ties, and this
  // read is cold + cached. The fetches below are already minimal-column;
  // fielding is additionally grouped to counts per (participant, kind) so the
  // catch regex runs per distinct kind instead of per row.
  // Senior matches only, filtered or not: a junior score is never a club record.
  const matchRows = filterSeniorMatchRows(await getClubMatchRows(clubId), filter);
  const empty: CentralClubRecords = {
    mostGames: null,
    mostRuns: null,
    mostWickets: null,
    mostCatches: null,
    mostFifties: null,
    mostHundreds: null,
    highestScore: null,
    bestBowling: null,
  };
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return empty;
  const matchGrade = new Map(matchRows.map((m) => [m.matchId, appGradeFromCentral(m.grade)]));

  const [rawBatting, rawBowling, rawRosters, rawFielding] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchRostersTable.participantId,
        matchId: centralMatchRostersTable.matchId,
      })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralFieldingTable.participantId,
        kind: centralFieldingTable.kind,
        n: sql<number>`count(*)::int`,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          inList(centralFieldingTable.matchId, matchIds),
        ),
      )
      .groupBy(centralFieldingTable.participantId, centralFieldingTable.kind),
  ]);
  // Confirmed merges fold to the keeper before anything is aggregated.
  const batting = canonicalizeLines(rawBatting, merges);
  const bowling = canonicalizeLines(rawBowling, merges);
  const rosters = canonicalizeLines(rawRosters, merges);
  const fielding = canonicalizeLines(rawFielding, merges);

  interface Agg {
    games: Set<number>;
    runs: number;
    wickets: number;
    catches: number;
    fifties: number;
    hundreds: number;
    grades: Set<string>;
  }
  const agg = new Map<string, Agg>();
  const get = (pid: string): Agg => {
    let a = agg.get(pid);
    if (!a) {
      a = {
        games: new Set(),
        runs: 0,
        wickets: 0,
        catches: 0,
        fifties: 0,
        hundreds: 0,
        grades: new Set(),
      };
      agg.set(pid, a);
    }
    return a;
  };
  const addGrade = (a: Agg, matchId: number) => {
    const g = matchGrade.get(matchId);
    if (g) a.grades.add(g);
  };

  let bestScore: {
    participantId: string;
    grade: string | null;
    runs: number;
    notOut: boolean;
  } | null = null;
  for (const b of batting) {
    if (!b.participantId || b.matchId === null) continue;
    const a = get(b.participantId);
    a.games.add(b.matchId);
    addGrade(a, b.matchId);
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    if (kind === "dnb") continue;
    const runs = b.runs ?? 0;
    a.runs += runs;
    if (runs >= 100) a.hundreds += 1;
    else if (runs >= 50) a.fifties += 1;
    if (!bestScore || runs > bestScore.runs) {
      bestScore = {
        participantId: b.participantId,
        grade: matchGrade.get(b.matchId) ?? null,
        runs,
        notOut: kind === "notout",
      };
    }
  }
  let bestBowl: { participantId: string; grade: string | null; wkts: number; runs: number } | null =
    null;
  for (const b of bowling) {
    if (!b.participantId || b.matchId === null) continue;
    const a = get(b.participantId);
    a.games.add(b.matchId);
    addGrade(a, b.matchId);
    const w = b.wickets ?? 0;
    const r = b.runs ?? 0;
    a.wickets += w;
    if (!bestBowl || w > bestBowl.wkts || (w === bestBowl.wkts && w > 0 && r < bestBowl.runs)) {
      if (w > 0)
        bestBowl = {
          participantId: b.participantId,
          grade: matchGrade.get(b.matchId) ?? null,
          wkts: w,
          runs: r,
        };
    }
  }
  for (const r of rosters) {
    if (!r.participantId || r.matchId === null) continue;
    const a = get(r.participantId);
    a.games.add(r.matchId);
    addGrade(a, r.matchId);
  }
  for (const f of fielding) {
    if (!f.participantId) continue;
    // ONE catch rule everywhere (classifyFieldingKind): a keeper's stumping or
    // a run-out is never a catch, on this card or anywhere else.
    if (classifyFieldingKind(f.kind) === "catch") get(f.participantId).catches += Number(f.n);
  }

  // Every participant the club ever fielded — bind as one array parameter.
  // With merges, a keeper is private when any GUID in its group is.
  const byId = await centralPlayerNames([...agg.keys()], merges);
  const isPrivate = (pid: string) => byId.get(pid)?.isPrivate === true;
  const nameOf = (pid: string) => byId.get(pid)?.displayName ?? null;

  const topBy = (pick: (a: Agg) => number): CentralRecordHolder | null => {
    let best: { pid: string; value: number; a: Agg } | null = null;
    for (const [pid, a] of agg) {
      if (isPrivate(pid)) continue;
      const value = pick(a);
      if (value <= 0) continue;
      if (!best || value > best.value) best = { pid, value, a };
    }
    return best
      ? {
          participantId: best.pid,
          displayName: nameOf(best.pid),
          value: best.value,
          grades: [...best.a.grades].sort(),
        }
      : null;
  };

  return {
    mostGames: topBy((a) => a.games.size),
    mostRuns: topBy((a) => a.runs),
    mostWickets: topBy((a) => a.wickets),
    mostCatches: topBy((a) => a.catches),
    mostFifties: topBy((a) => a.fifties),
    mostHundreds: topBy((a) => a.hundreds),
    highestScore:
      bestScore && !isPrivate(bestScore.participantId)
        ? {
            participantId: bestScore.participantId,
            displayName: nameOf(bestScore.participantId),
            grade: bestScore.grade,
            value: `${bestScore.runs}${bestScore.notOut ? "*" : ""}`,
          }
        : null,
    bestBowling:
      bestBowl && !isPrivate(bestBowl.participantId)
        ? {
            participantId: bestBowl.participantId,
            displayName: nameOf(bestBowl.participantId),
            grade: bestBowl.grade,
            value: `${bestBowl.wkts}/${bestBowl.runs}`,
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Honour-board reads (centuries, five-wicket hauls, milestones). All seniors-
// only and scorecard-era (2002/03+), keyed by central club id; routes map the
// participant GUIDs to tenant int ids via player_id_map where they need them.
// ---------------------------------------------------------------------------

export interface CentralCentury {
  participantId: string;
  displayName: string | null;
  /** The central match it was scored in (the club overlay matches corrections on it). */
  matchId: number;
  grade: string;
  score: string;
  season: string;
}

export interface CentralFiveWicketHaul {
  participantId: string;
  displayName: string | null;
  /** The central match it was taken in (the club overlay matches corrections on it). */
  matchId: number;
  grade: string;
  figures: string;
  season: string;
}

export async function centralCenturies(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralCentury[]> {
  return withCentralCache(cacheKey("centralCenturies", [clubId, mergesCacheArg(merges)]), () =>
    centralCenturiesImpl(clubId, merges),
  );
}

async function centralCenturiesImpl(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralCentury[]> {
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];
  const metaOf = new Map(
    matchRows.map((m) => [
      m.matchId,
      { grade: appGradeFromCentral(m.grade), season: parseSeasonStartYear(m.season) },
    ]),
  );

  // Threshold pushed into SQL: only the century lines travel over the wire
  // (was: every batting line the club ever recorded, filtered in JS). SQL
  // `runs >= 100` ≡ the old `(runs ?? 0) >= 100` — NULL runs fail both.
  const batting = await centralDb
    .select({
      participantId: centralMatchBattingTable.participantId,
      matchId: centralMatchBattingTable.matchId,
      runs: centralMatchBattingTable.runs,
      dismissal: centralMatchBattingTable.dismissal,
      dismissalType: centralMatchBattingTable.dismissalType,
    })
    .from(centralMatchBattingTable)
    .where(
      and(
        eq(centralMatchBattingTable.clubId, clubId),
        inList(centralMatchBattingTable.matchId, matchIds),
        gte(centralMatchBattingTable.runs, 100),
      ),
    );

  const hundreds = canonicalizeLines(batting, merges).filter((b) => b.participantId);
  const names = await centralPlayerNames(
    [...new Set(hundreds.map((b) => b.participantId as string))],
    merges,
  );

  const rows: CentralCentury[] = [];
  for (const b of hundreds) {
    if (b.matchId === null) continue;
    const meta = metaOf.get(b.matchId);
    if (!meta?.grade || meta.season === null) continue;
    const p = names.get(b.participantId as string);
    if (p?.isPrivate) continue;
    const notOut = classifyInnings(b.dismissalType, b.dismissal) === "notout";
    rows.push({
      participantId: b.participantId as string,
      displayName: p?.displayName ?? null,
      matchId: b.matchId,
      grade: meta.grade,
      score: `${b.runs ?? 0}${notOut ? "*" : ""}`,
      season: seasonLabelFromStartYear(meta.season),
    });
  }
  rows.sort((a, b) => a.grade.localeCompare(b.grade) || b.season.localeCompare(a.season));
  return rows;
}

export interface CentralMilestone {
  kind: "century" | "fiveFor" | "career";
  participantId: string;
  displayName: string | null;
  grade: string;
  season: number;
  matchId: number;
  matchDate: string | null;
  opponent: string | null;
  value: number;
  /** Career crossings only: which running total crossed a tier. */
  boardKey?: "games" | "runs" | "wickets" | "dismissals";
  tierIndex?: number;
  threshold?: number;
}

/** Default significance tiers, mirroring the native milestone board defaults. */
const DEFAULT_CAREER_TIERS = {
  games: [100, 150, 200, 250, 300],
  runs: [1000, 2000, 3000, 5000, 7500, 10000],
  wickets: [100, 150, 200, 300],
};

// Career dismissal tiers (catches + stumpings + run-outs). The native milestone
// board has no dismissals column, so this ladder is central-only; it mirrors the
// client-side "Dismissals Club" bands on the honour-boards page (10/25/50/75/100).
const DEFAULT_DISMISSALS_TIERS = [10, 25, 50, 75, 100];

export async function centralMilestones(
  clubId: number,
  tiers: {
    games: number[];
    runs: number[];
    wickets: number[];
    dismissals?: number[];
  } = DEFAULT_CAREER_TIERS,
  /**
   * The tenant's confirmed merges: a merged group walks ONE career, so a
   * combined total crosses each tier once, under the keeper.
   */
  merges?: CentralMerges,
): Promise<CentralMilestone[]> {
  // Career totals are senior-only (juniors isolation): junior and senior
  // stats are never combined. "seniorOnly" in the key retires any cache entry
  // from the old walk, which counted junior matches.
  const key = cacheKey("centralMilestones", [clubId, tiers, "seniorOnly", mergesCacheArg(merges)]);
  return withCentralCache(key, () => centralMilestonesImpl(clubId, tiers, merges));
}

async function centralMilestonesImpl(
  clubId: number,
  tiers: MilestoneTiers,
  merges?: CentralMerges,
): Promise<CentralMilestone[]> {
  return walkCentralMilestones(await loadMilestoneInputs(clubId, merges), tiers);
}

/** Career tier ladders for the milestone walk. */
export interface MilestoneTiers {
  games: number[];
  runs: number[];
  wickets: number[];
  dismissals?: number[];
}

/** One participant's per-match running-total inputs (keeper GUID when merged). */
export interface CentralMilestoneCareer {
  runsByMatch: Map<number, number>;
  wktsByMatch: Map<number, number>;
  dismByMatch: Map<number, number>;
  matches: Set<number>;
}

/**
 * Everything the milestone walk consumes, fetched once per club (+ merges):
 * match meta, per-participant per-match contributions, the century and
 * five-for lines, and names/privacy. The club overlay (hybrid stats plan U10)
 * walks these with its boundary, history and corrections applied — see
 * {@link walkCentralMilestones}.
 */
export interface CentralMilestoneInputs {
  metaOf: Map<
    number,
    {
      grade: string | null;
      season: number | null;
      matchDate: string | null;
      opponent: string | null;
    }
  >;
  careers: Map<string, CentralMilestoneCareer>;
  centuries: Array<{ participantId: string; matchId: number; runs: number }>;
  fivers: Array<{ participantId: string; matchId: number; wickets: number }>;
  names: Map<string, { displayName: string | null; isPrivate: boolean }>;
}

/** The milestone inputs for a club, cached by club + the tenant's confirmed merges. */
export async function centralMilestoneInputs(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralMilestoneInputs> {
  return withCentralCache(
    cacheKey("centralMilestoneInputs", [clubId, "seniorOnly", mergesCacheArg(merges)]),
    () => loadMilestoneInputs(clubId, merges),
  );
}

async function loadMilestoneInputs(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralMilestoneInputs> {
  // Deliberately still JS-aggregated: career tier-crossings need each player's
  // full per-match running totals walked in chronological order against
  // caller-supplied tier arrays — a sequential scan that doesn't reduce to a
  // GROUP BY (a SQL window-function port would be a rewrite, not a pushdown).
  // The fetches below already select only the 2–3 columns the walk consumes,
  // and the read is cold + cached.
  //
  // This read needs match date + opponent team names, which the shared
  // getClubMatchRows() projection doesn't carry, so it issues its own match
  // query (same club predicate).
  const matchRows = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      grade: centralMatchesTable.grade,
      season: centralMatchesTable.season,
      matchDate: centralMatchesTable.matchDate,
      homeClubId: centralMatchesTable.homeClubId,
      awayClubId: centralMatchesTable.awayClubId,
      homeTeam: centralMatchesTable.homeTeam,
      awayTeam: centralMatchesTable.awayTeam,
    })
    .from(centralMatchesTable)
    .where(clubInvolvedWhere(clubId));
  const matchIds = matchRows.map((m) => m.matchId);
  const empty: CentralMilestoneInputs = {
    metaOf: new Map(),
    careers: new Map(),
    centuries: [],
    fivers: [],
    names: new Map(),
  };
  if (matchIds.length === 0) return empty;
  const metaOf: CentralMilestoneInputs["metaOf"] = new Map(
    matchRows.map((m) => [
      m.matchId,
      {
        grade: appGradeFromCentral(m.grade),
        season: parseSeasonStartYear(m.season),
        matchDate: m.matchDate,
        opponent: m.homeClubId === clubId ? m.awayTeam : m.homeTeam,
      },
    ]),
  );

  // Batting, bowling, rosters (rosters give the games count — a player counts as
  // having played even in matches where they didn't bat or bowl) and fielding
  // (for the dismissals career ladder) are independent given matchIds — run all
  // four round trips in parallel.
  const [rawBatting, rawBowling, rawRosters, rawFielding] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchRostersTable.participantId,
        matchId: centralMatchRostersTable.matchId,
      })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralFieldingTable.participantId,
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          inList(centralFieldingTable.matchId, matchIds),
        ),
      ),
  ]);
  // Confirmed merges fold to the keeper before the walk: one career per group.
  const batting = canonicalizeLines(rawBatting, merges);
  const bowling = canonicalizeLines(rawBowling, merges);
  const rosters = canonicalizeLines(rawRosters, merges);
  const fielding = canonicalizeLines(rawFielding, merges);

  const centuries: CentralMilestoneInputs["centuries"] = [];
  for (const b of batting) {
    if ((b.runs ?? 0) >= 100 && b.participantId && b.matchId !== null) {
      centuries.push({ participantId: b.participantId, matchId: b.matchId, runs: b.runs ?? 0 });
    }
  }
  const fivers: CentralMilestoneInputs["fivers"] = [];
  for (const b of bowling) {
    if ((b.wickets ?? 0) >= 5 && b.participantId && b.matchId !== null) {
      fivers.push({ participantId: b.participantId, matchId: b.matchId, wickets: b.wickets ?? 0 });
    }
  }

  // Per-participant running-total inputs: runs and wickets per match, and the
  // set of matches played (rosters unioned with batted/bowled matches).
  const careers = new Map<string, CentralMilestoneCareer>();
  const accFor = (pid: string): CentralMilestoneCareer => {
    let a = careers.get(pid);
    if (!a) {
      a = {
        runsByMatch: new Map(),
        wktsByMatch: new Map(),
        dismByMatch: new Map(),
        matches: new Set(),
      };
      careers.set(pid, a);
    }
    return a;
  };
  for (const b of batting) {
    if (!b.participantId || b.matchId === null) continue;
    const a = accFor(b.participantId);
    a.runsByMatch.set(b.matchId, (a.runsByMatch.get(b.matchId) ?? 0) + (b.runs ?? 0));
    a.matches.add(b.matchId);
  }
  for (const b of bowling) {
    if (!b.participantId || b.matchId === null) continue;
    const a = accFor(b.participantId);
    a.wktsByMatch.set(b.matchId, (a.wktsByMatch.get(b.matchId) ?? 0) + (b.wickets ?? 0));
    a.matches.add(b.matchId);
  }
  for (const r of rosters) {
    if (!r.participantId || r.matchId === null) continue;
    accFor(r.participantId).matches.add(r.matchId);
  }
  for (const f of fielding) {
    if (!f.participantId || f.matchId === null) continue;
    if (!classifyFieldingKind(f.kind)) continue;
    // Every classified catch/stumping/run-out counts one dismissal. Deliberately
    // NOT added to `matches` (the games/appearance set) — a fielding row must not
    // inflate the games tally; the walk below unions these in for dismissals only.
    const a = accFor(f.participantId);
    a.dismByMatch.set(f.matchId, (a.dismByMatch.get(f.matchId) ?? 0) + 1);
  }

  // Names for every participant that could cross a tier (superset of the
  // century/five-for authors).
  const names = await centralPlayerNames([...careers.keys()], merges);
  return { metaOf, careers, centuries, fivers, names };
}

/** Running-total seed / per-match adjustment for the milestone walk. */
export interface MilestoneTotals {
  games: number;
  runs: number;
  wickets: number;
  dismissals: number;
}

/**
 * The club overlay's view of the walk (hybrid stats plan U10). Absent, the
 * walk is exactly the plain central one.
 */
export interface MilestoneOverlay {
  /** True for a (grade, season) central does not supply for this club (before the boundary). */
  dropBucket?: (grade: string, season: number | null) => boolean;
  /**
   * Totals a keeper carries INTO its first central match (pre-boundary club
   * history). They never emit a crossing of their own — a milestone needs a
   * match — but a central match that takes the total over a tier does.
   */
  baseTotals?: ReadonlyMap<string, MilestoneTotals>;
  /** Correction deltas per (keeper GUID, match id), keyed `${guid}\u0000${matchId}`. */
  matchDeltas?: ReadonlyMap<string, Omit<MilestoneTotals, "games">>;
  /** Keepers to leave out entirely (fill-ins). */
  exclude?: ReadonlySet<string>;
}

/**
 * Walk the inputs into milestones: centuries, five-fors and career tier
 * crossings. Pure. Senior-only: a junior / pathway / unmapped match neither
 * counts towards nor triggers anything.
 */
export function walkCentralMilestones(
  inputs: CentralMilestoneInputs,
  tiers: MilestoneTiers,
  overlay?: MilestoneOverlay,
): CentralMilestone[] {
  const { metaOf, careers, names } = inputs;
  const dropped = (matchId: number): boolean => {
    const meta = metaOf.get(matchId);
    if (!meta?.grade) return true;
    return overlay?.dropBucket?.(meta.grade, meta.season) === true;
  };
  const delta = (pid: string, matchId: number) =>
    overlay?.matchDeltas?.get(`${pid}\u0000${matchId}`);
  const excluded = (pid: string) => overlay?.exclude?.has(pid) === true;

  const out: CentralMilestone[] = [];
  const pushLine = (
    kind: "century" | "fiveFor",
    participantId: string,
    matchId: number,
    value: number,
  ) => {
    const meta = metaOf.get(matchId);
    if (!meta?.grade || meta.season === null) return;
    if (dropped(matchId) || excluded(participantId)) return;
    const p = names.get(participantId);
    if (p?.isPrivate) return;
    out.push({
      kind,
      participantId,
      displayName: p?.displayName ?? null,
      grade: meta.grade,
      season: meta.season,
      matchId,
      matchDate: meta.matchDate,
      opponent: meta.opponent,
      value,
    });
  };

  if (!overlay?.matchDeltas?.size) {
    for (const b of inputs.centuries) pushLine("century", b.participantId, b.matchId, b.runs);
    for (const b of inputs.fivers) pushLine("fiveFor", b.participantId, b.matchId, b.wickets);
  } else {
    // A correction can make or unmake a century / five-for: judge the
    // corrected match figure (corrections are per match, so a two-innings
    // match is judged on its corrected total for the corrected player only).
    const seen = new Set<string>();
    for (const b of inputs.centuries) {
      const k = `${b.participantId}\u0000${b.matchId}`;
      const d = delta(b.participantId, b.matchId);
      if (!d) {
        pushLine("century", b.participantId, b.matchId, b.runs);
        continue;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      const runs = (careers.get(b.participantId)?.runsByMatch.get(b.matchId) ?? 0) + d.runs;
      if (runs >= 100) pushLine("century", b.participantId, b.matchId, runs);
    }
    for (const b of inputs.fivers) {
      const k = `${b.participantId}\u0000${b.matchId}`;
      const d = delta(b.participantId, b.matchId);
      if (!d) {
        pushLine("fiveFor", b.participantId, b.matchId, b.wickets);
        continue;
      }
      if (seen.has(`w${k}`)) continue;
      seen.add(`w${k}`);
      const wkts = (careers.get(b.participantId)?.wktsByMatch.get(b.matchId) ?? 0) + d.wickets;
      if (wkts >= 5) pushLine("fiveFor", b.participantId, b.matchId, wkts);
    }
    for (const [k, d] of overlay.matchDeltas) {
      const [pid, m] = k.split("\u0000") as [string, string];
      const matchId = Number(m);
      const acc = careers.get(pid);
      if (!acc) continue;
      if (d.runs !== 0 && !seen.has(k)) {
        const runs = (acc.runsByMatch.get(matchId) ?? 0) + d.runs;
        if (runs >= 100) pushLine("century", pid, matchId, runs);
      }
      if (d.wickets !== 0 && !seen.has(`w${k}`)) {
        const wkts = (acc.wktsByMatch.get(matchId) ?? 0) + d.wickets;
        if (wkts >= 5) pushLine("fiveFor", pid, matchId, wkts);
      }
    }
  }

  // Career crossings: walk each participant's matches in chronological order
  // (season, then match id), accumulate games/runs/wickets, and emit a
  // milestone at the match where a running total first crosses each tier.
  const chrono = (x: number, y: number): number => {
    const mx = metaOf.get(x);
    const my = metaOf.get(y);
    return (mx?.season ?? 0) - (my?.season ?? 0) || x - y;
  };
  const tierSpecs = [
    { key: "games" as const, tiers: tiers.games },
    { key: "runs" as const, tiers: tiers.runs },
    { key: "wickets" as const, tiers: tiers.wickets },
    { key: "dismissals" as const, tiers: tiers.dismissals ?? DEFAULT_DISMISSALS_TIERS },
  ];
  for (const [pid, acc] of careers) {
    const p = names.get(pid);
    if (p?.isPrivate || excluded(pid)) continue;
    // Walk over appearances unioned with fielding-only matches so dismissal
    // crossings still fire in a match where the player neither batted nor bowled;
    // `games` contrib stays gated on a real appearance so the games tally is
    // unchanged.
    const ordered = [...new Set([...acc.matches, ...acc.dismByMatch.keys()])].sort(chrono);
    const base = overlay?.baseTotals?.get(pid);
    const totals = {
      games: base?.games ?? 0,
      runs: base?.runs ?? 0,
      wickets: base?.wickets ?? 0,
      dismissals: base?.dismissals ?? 0,
    };
    for (const mId of ordered) {
      const meta = metaOf.get(mId);
      // Senior-only totals: a junior / pathway / unmapped match contributes
      // nothing, so it can neither count towards nor trigger a crossing. Nor
      // does a match before the club's boundary (club history supplies it).
      if (!meta?.grade || dropped(mId)) continue;
      const d = delta(pid, mId);
      const contrib = {
        games: acc.matches.has(mId) ? 1 : 0,
        runs: (acc.runsByMatch.get(mId) ?? 0) + (d?.runs ?? 0),
        wickets: (acc.wktsByMatch.get(mId) ?? 0) + (d?.wickets ?? 0),
        dismissals: (acc.dismByMatch.get(mId) ?? 0) + (d?.dismissals ?? 0),
      };
      for (const spec of tierSpecs) {
        const prev = totals[spec.key];
        const now = prev + contrib[spec.key];
        totals[spec.key] = now;
        if (!meta?.grade || meta.season === null) continue;
        for (const [i, tier] of spec.tiers.entries()) {
          if (prev < tier && now >= tier) {
            out.push({
              kind: "career",
              participantId: pid,
              displayName: p?.displayName ?? null,
              grade: meta.grade,
              season: meta.season,
              matchId: mId,
              matchDate: meta.matchDate,
              opponent: meta.opponent,
              value: now,
              boardKey: spec.key,
              tierIndex: i,
              threshold: tier,
            });
          }
        }
      }
    }
  }

  out.sort((a, b) => b.season - a.season || b.matchId - a.matchId);
  return out;
}

export async function centralFiveWicketHauls(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralFiveWicketHaul[]> {
  return withCentralCache(
    cacheKey("centralFiveWicketHauls", [clubId, mergesCacheArg(merges)]),
    () => centralFiveWicketHaulsImpl(clubId, merges),
  );
}

async function centralFiveWicketHaulsImpl(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralFiveWicketHaul[]> {
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];
  const metaOf = new Map(
    matchRows.map((m) => [
      m.matchId,
      { grade: appGradeFromCentral(m.grade), season: parseSeasonStartYear(m.season) },
    ]),
  );

  // Threshold pushed into SQL: only the five-for lines travel over the wire
  // (was: every bowling line, filtered in JS). SQL `wickets >= 5` ≡ the old
  // `(wickets ?? 0) >= 5` — NULL wickets fail both.
  const bowling = await centralDb
    .select({
      participantId: centralMatchBowlingTable.participantId,
      matchId: centralMatchBowlingTable.matchId,
      wickets: centralMatchBowlingTable.wickets,
      runs: centralMatchBowlingTable.runs,
    })
    .from(centralMatchBowlingTable)
    .where(
      and(
        eq(centralMatchBowlingTable.clubId, clubId),
        inList(centralMatchBowlingTable.matchId, matchIds),
        gte(centralMatchBowlingTable.wickets, 5),
      ),
    );

  const fivers = canonicalizeLines(bowling, merges).filter((b) => b.participantId);
  const names = await centralPlayerNames(
    [...new Set(fivers.map((b) => b.participantId as string))],
    merges,
  );

  const rows: CentralFiveWicketHaul[] = [];
  for (const b of fivers) {
    if (b.matchId === null) continue;
    const meta = metaOf.get(b.matchId);
    if (!meta?.grade || meta.season === null) continue;
    const p = names.get(b.participantId as string);
    if (p?.isPrivate) continue;
    rows.push({
      participantId: b.participantId as string,
      displayName: p?.displayName ?? null,
      matchId: b.matchId,
      grade: meta.grade,
      figures: `${b.wickets ?? 0}/${b.runs ?? 0}`,
      season: seasonLabelFromStartYear(meta.season),
    });
  }
  rows.sort((a, b) => a.grade.localeCompare(b.grade) || b.season.localeCompare(a.season));
  return rows;
}

// ---------------------------------------------------------------------------
// Records analytics (stats plan U9 / KTD5): career leaders by metric and the
// raw material for the highest-score / best-bowling progression. Seniors only
// (junior / pathway grades dropped), private players excluded, keyed by
// participant GUID — the route maps GUIDs to tenant ints via player_id_map.
// ---------------------------------------------------------------------------

export type CentralRecordLeaderMetric = "runs" | "wickets" | "catches" | "hundreds" | "games";

export interface CentralRecordLeader {
  participantId: string;
  displayName: string | null;
  value: number;
  /** Last senior season (start year) the player appeared for the club, any grade. */
  lastSeason: number | null;
}

/**
 * Every non-private player's total for `metric` over the (optionally grade /
 * season-filtered) senior matches, highest first. `lastSeason` ignores the
 * filter — it answers "is this player still playing", not "when did they last
 * play in this grade".
 */
export async function centralRecordLeaders(
  clubId: number,
  metric: CentralRecordLeaderMetric,
  filter: CentralRecordsFilter = {},
  /** The tenant's confirmed merges: a merged pair ranks as one player. */
  merges?: CentralMerges,
): Promise<CentralRecordLeader[]> {
  return withCentralCache(
    cacheKey("centralRecordLeaders", [clubId, metric, filter, mergesCacheArg(merges)]),
    () => centralRecordLeadersImpl(clubId, metric, filter, merges),
  );
}

async function centralRecordLeadersImpl(
  clubId: number,
  metric: CentralRecordLeaderMetric,
  filter: CentralRecordsFilter,
  merges?: CentralMerges,
): Promise<CentralRecordLeader[]> {
  const senior = filterSeniorMatchRows(await getClubMatchRows(clubId));
  const seniorIds = senior.map((m) => m.matchId);
  if (seniorIds.length === 0) return [];
  const scoped = new Set(filterSeniorMatchRows(senior, filter).map((m) => m.matchId));
  const seasonOf = new Map(senior.map((m) => [m.matchId, parseSeasonStartYear(m.season)]));

  const [rawBatting, rawBowling, rawRosters, rawFielding] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, seniorIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, seniorIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchRostersTable.participantId,
        matchId: centralMatchRostersTable.matchId,
      })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.matchId, seniorIds),
        ),
      ),
    metric === "catches"
      ? centralDb
          .select({
            participantId: centralFieldingTable.participantId,
            matchId: centralFieldingTable.matchId,
            kind: centralFieldingTable.kind,
          })
          .from(centralFieldingTable)
          .where(
            and(
              eq(centralFieldingTable.clubId, clubId),
              inList(centralFieldingTable.matchId, seniorIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const batting = canonicalizeLines(rawBatting, merges);
  const bowling = canonicalizeLines(rawBowling, merges);
  const rosters = canonicalizeLines(rawRosters, merges);
  const fielding = canonicalizeLines(rawFielding, merges);

  const lastSeason = new Map<string, number>();
  const games = new Map<string, Set<number>>();
  const values = new Map<string, number>();
  const add = (pid: string, n: number) => values.set(pid, (values.get(pid) ?? 0) + n);
  const played = (pid: string, matchId: number) => {
    const s = seasonOf.get(matchId);
    if (s != null && s > (lastSeason.get(pid) ?? -Infinity)) lastSeason.set(pid, s);
    if (metric !== "games" || !scoped.has(matchId)) return;
    let g = games.get(pid);
    if (!g) {
      g = new Set();
      games.set(pid, g);
    }
    g.add(matchId);
  };

  for (const b of batting) {
    if (!b.participantId || b.matchId === null) continue;
    played(b.participantId, b.matchId);
    if (!scoped.has(b.matchId)) continue;
    if (classifyInnings(b.dismissalType, b.dismissal) === "dnb") continue;
    const runs = b.runs ?? 0;
    if (metric === "runs") add(b.participantId, runs);
    else if (metric === "hundreds" && runs >= 100) add(b.participantId, 1);
  }
  for (const b of bowling) {
    if (!b.participantId || b.matchId === null) continue;
    played(b.participantId, b.matchId);
    if (metric === "wickets" && scoped.has(b.matchId)) add(b.participantId, b.wickets ?? 0);
  }
  for (const r of rosters) {
    if (!r.participantId || r.matchId === null) continue;
    played(r.participantId, r.matchId);
  }
  for (const f of fielding) {
    if (!f.participantId || f.matchId === null || !scoped.has(f.matchId)) continue;
    // Same catch test as the all-time records card (and every other read), so
    // leader #1 matches it.
    if (classifyFieldingKind(f.kind) === "catch") add(f.participantId, 1);
  }
  for (const [pid, g] of games) values.set(pid, g.size);

  const candidates = [...values].filter(([, v]) => v > 0);
  const names = await centralPlayerNames(
    candidates.map(([pid]) => pid),
    merges,
  );
  return candidates
    .filter(([pid]) => !names.get(pid)?.isPrivate)
    .map(([pid, value]) => ({
      participantId: pid,
      displayName: names.get(pid)?.displayName ?? null,
      value,
      lastSeason: lastSeason.get(pid) ?? null,
    }))
    .sort((a, b) => b.value - a.value || (a.displayName ?? "").localeCompare(b.displayName ?? ""));
}

/** One match's best single innings (score or bowling figures) for the progression. */
export interface CentralRecordProgressionRow {
  participantId: string;
  displayName: string | null;
  grade: string;
  season: number;
  matchId: number;
  /** Central "YYYY-MM-DD" (or null). */
  matchDate: string | null;
  /** highScore: runs scored. bestBowling: wickets taken. */
  primary: number;
  /** highScore: 1 when not out, else 0. bestBowling: runs conceded. */
  secondary: number;
}

/**
 * Per senior match (optionally one grade), the club's best non-private batting
 * innings (`highScore`) or bowling figures (`bestBowling`). The route walks
 * these chronologically and keeps only the rows that broke the record.
 */
export async function centralRecordProgressionRows(
  clubId: number,
  kind: "highScore" | "bestBowling",
  grade?: string,
  /** The tenant's confirmed merges: record holders are shown as their keeper. */
  merges?: CentralMerges,
): Promise<CentralRecordProgressionRow[]> {
  return withCentralCache(
    cacheKey("centralRecordProgressionRows", [clubId, kind, grade ?? null, mergesCacheArg(merges)]),
    () => centralRecordProgressionRowsImpl(clubId, kind, grade, merges),
  );
}

async function centralRecordProgressionRowsImpl(
  clubId: number,
  kind: "highScore" | "bestBowling",
  grade: string | undefined,
  merges?: CentralMerges,
): Promise<CentralRecordProgressionRow[]> {
  // Needs match_date, which the shared getClubMatchRows() projection lacks.
  const matchRows = filterSeniorMatchRows(
    await centralDb
      .select({
        matchId: centralMatchesTable.matchId,
        grade: centralMatchesTable.grade,
        season: centralMatchesTable.season,
        matchDate: centralMatchesTable.matchDate,
      })
      .from(centralMatchesTable)
      .where(clubInvolvedWhere(clubId)),
    grade === undefined ? {} : { grade },
  );
  const matchIds = matchRows.map((m) => m.matchId);
  if (matchIds.length === 0) return [];
  const metaOf = new Map(matchRows.map((m) => [m.matchId, m]));

  type Line = { participantId: string; matchId: number; primary: number; secondary: number };
  const lines: Line[] = [];
  if (kind === "highScore") {
    const batting = await centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, matchIds),
          isNotNull(centralMatchBattingTable.runs),
        ),
      );
    for (const b of batting) {
      if (!b.participantId || b.matchId === null) continue;
      const inningsKind = classifyInnings(b.dismissalType, b.dismissal);
      if (inningsKind === "dnb") continue;
      lines.push({
        participantId: canonicalGuid(b.participantId, merges),
        matchId: b.matchId,
        primary: b.runs ?? 0,
        secondary: inningsKind === "notout" ? 1 : 0,
      });
    }
  } else {
    const bowling = await centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, matchIds),
          gte(centralMatchBowlingTable.wickets, 1),
        ),
      );
    for (const b of bowling) {
      if (!b.participantId || b.matchId === null) continue;
      lines.push({
        participantId: canonicalGuid(b.participantId, merges),
        matchId: b.matchId,
        primary: b.wickets ?? 0,
        secondary: b.runs ?? 0,
      });
    }
  }

  const names = await centralPlayerNames([...new Set(lines.map((l) => l.participantId))], merges);
  const better = (a: Line, b: Line): boolean =>
    kind === "highScore"
      ? a.primary > b.primary
      : a.primary > b.primary || (a.primary === b.primary && a.secondary < b.secondary);
  const bestByMatch = new Map<number, Line>();
  for (const l of lines) {
    if (names.get(l.participantId)?.isPrivate) continue;
    const cur = bestByMatch.get(l.matchId);
    if (!cur || better(l, cur)) bestByMatch.set(l.matchId, l);
  }

  const out: CentralRecordProgressionRow[] = [];
  for (const [matchId, l] of bestByMatch) {
    const m = metaOf.get(matchId);
    const appGrade = appGradeFromCentral(m?.grade ?? null);
    const season = parseSeasonStartYear(m?.season ?? null);
    if (!m || !appGrade || season === null) continue;
    out.push({
      participantId: l.participantId,
      displayName: names.get(l.participantId)?.displayName ?? null,
      grade: appGrade,
      season,
      matchId,
      matchDate: m.matchDate,
      primary: l.primary,
      secondary: l.secondary,
    });
  }
  return out;
}
