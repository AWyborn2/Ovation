import { and, eq, gte, sql } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralFieldingTable,
  centralPlayersTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows } from "./club-matches";
import { appGradeFromCentral, parseSeasonStartYear, seasonLabelFromStartYear } from "./grades";
import { centralPlayerNames, isPrivateRow } from "./privacy";
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
export async function centralClubRecords(clubId: number): Promise<CentralClubRecords> {
  return withCentralCache(cacheKey("centralClubRecords", [clubId]), () =>
    centralClubRecordsImpl(clubId),
  );
}

async function centralClubRecordsImpl(clubId: number): Promise<CentralClubRecords> {
  // Deliberately still JS-aggregated (unlike centralGradeLeaderboard): the
  // single-innings records (highestScore / bestBowling) and every topBy()
  // holder resolve ties by FIRST-encountered row/insertion order, which is the
  // database's unspecified fetch order — a SQL `order by ... limit 1` would
  // silently pick a different (if equally arbitrary) holder on ties, and this
  // read is cold + cached. The fetches below are already minimal-column;
  // fielding is additionally grouped to counts per (participant, kind) so the
  // catch regex runs per distinct kind instead of per row.
  const matchRows = await getClubMatchRows(clubId);
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

  const [batting, bowling, rosters, fielding] = await Promise.all([
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
    if (/catch|caught|^c$|^c\b/i.test(f.kind ?? "")) get(f.participantId).catches += Number(f.n);
  }

  // Every participant the club ever fielded — bind as one array parameter.
  const ids = [...agg.keys()];
  const players = ids.length
    ? await centralDb
        .select({
          participantId: centralPlayersTable.participantId,
          displayName: centralPlayersTable.displayName,
          isPrivate: centralPlayersTable.isPrivate,
        })
        .from(centralPlayersTable)
        .where(inList(centralPlayersTable.participantId, ids))
    : [];
  const byId = new Map(players.map((p) => [p.participantId, p]));
  const isPrivate = (pid: string) => isPrivateRow(byId.get(pid));
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
  grade: string;
  score: string;
  season: string;
}

export interface CentralFiveWicketHaul {
  participantId: string;
  displayName: string | null;
  grade: string;
  figures: string;
  season: string;
}

export async function centralCenturies(clubId: number): Promise<CentralCentury[]> {
  return withCentralCache(cacheKey("centralCenturies", [clubId]), () =>
    centralCenturiesImpl(clubId),
  );
}

async function centralCenturiesImpl(clubId: number): Promise<CentralCentury[]> {
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

  const hundreds = batting.filter((b) => b.participantId);
  const names = await centralPlayerNames([
    ...new Set(hundreds.map((b) => b.participantId as string)),
  ]);

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
): Promise<CentralMilestone[]> {
  return withCentralCache(cacheKey("centralMilestones", [clubId, tiers]), () =>
    centralMilestonesImpl(clubId, tiers),
  );
}

async function centralMilestonesImpl(
  clubId: number,
  tiers: {
    games: number[];
    runs: number[];
    wickets: number[];
    dismissals?: number[];
  },
): Promise<CentralMilestone[]> {
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
  if (matchIds.length === 0) return [];
  const metaOf = new Map(
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
  const [batting, bowling, rosters, fielding] = await Promise.all([
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

  const centuries = batting.filter(
    (b) => (b.runs ?? 0) >= 100 && b.participantId && b.matchId !== null,
  );
  const fivers = bowling.filter(
    (b) => (b.wickets ?? 0) >= 5 && b.participantId && b.matchId !== null,
  );

  // Per-participant running-total inputs: runs and wickets per match, and the
  // set of matches played (rosters unioned with batted/bowled matches).
  interface CareerAcc {
    runsByMatch: Map<number, number>;
    wktsByMatch: Map<number, number>;
    dismByMatch: Map<number, number>;
    matches: Set<number>;
  }
  const byPid = new Map<string, CareerAcc>();
  const accFor = (pid: string): CareerAcc => {
    let a = byPid.get(pid);
    if (!a) {
      a = {
        runsByMatch: new Map(),
        wktsByMatch: new Map(),
        dismByMatch: new Map(),
        matches: new Set(),
      };
      byPid.set(pid, a);
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
  const names = await centralPlayerNames([...byPid.keys()]);

  const out: CentralMilestone[] = [];
  for (const b of centuries) {
    const meta = metaOf.get(b.matchId as number);
    if (!meta?.grade || meta.season === null) continue;
    const p = names.get(b.participantId as string);
    if (p?.isPrivate) continue;
    out.push({
      kind: "century",
      participantId: b.participantId as string,
      displayName: p?.displayName ?? null,
      grade: meta.grade,
      season: meta.season,
      matchId: b.matchId as number,
      matchDate: meta.matchDate,
      opponent: meta.opponent,
      value: b.runs ?? 0,
    });
  }
  for (const b of fivers) {
    const meta = metaOf.get(b.matchId as number);
    if (!meta?.grade || meta.season === null) continue;
    const p = names.get(b.participantId as string);
    if (p?.isPrivate) continue;
    out.push({
      kind: "fiveFor",
      participantId: b.participantId as string,
      displayName: p?.displayName ?? null,
      grade: meta.grade,
      season: meta.season,
      matchId: b.matchId as number,
      matchDate: meta.matchDate,
      opponent: meta.opponent,
      value: b.wickets ?? 0,
    });
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
  for (const [pid, acc] of byPid) {
    const p = names.get(pid);
    if (p?.isPrivate) continue;
    // Walk over appearances unioned with fielding-only matches so dismissal
    // crossings still fire in a match where the player neither batted nor bowled;
    // `games` contrib stays gated on a real appearance so the games tally is
    // unchanged.
    const ordered = [...new Set([...acc.matches, ...acc.dismByMatch.keys()])].sort(chrono);
    const totals = { games: 0, runs: 0, wickets: 0, dismissals: 0 };
    for (const mId of ordered) {
      const meta = metaOf.get(mId);
      const contrib = {
        games: acc.matches.has(mId) ? 1 : 0,
        runs: acc.runsByMatch.get(mId) ?? 0,
        wickets: acc.wktsByMatch.get(mId) ?? 0,
        dismissals: acc.dismByMatch.get(mId) ?? 0,
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

export async function centralFiveWicketHauls(clubId: number): Promise<CentralFiveWicketHaul[]> {
  return withCentralCache(cacheKey("centralFiveWicketHauls", [clubId]), () =>
    centralFiveWicketHaulsImpl(clubId),
  );
}

async function centralFiveWicketHaulsImpl(clubId: number): Promise<CentralFiveWicketHaul[]> {
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

  const fivers = bowling.filter((b) => b.participantId);
  const names = await centralPlayerNames([
    ...new Set(fivers.map((b) => b.participantId as string)),
  ]);

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
      grade: meta.grade,
      figures: `${b.wickets ?? 0}/${b.runs ?? 0}`,
      season: seasonLabelFromStartYear(meta.season),
    });
  }
  rows.sort((a, b) => a.grade.localeCompare(b.grade) || b.season.localeCompare(a.season));
  return rows;
}
