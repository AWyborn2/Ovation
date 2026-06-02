import { and, eq, sql } from "drizzle-orm";
import {
  matchesTable,
  matchPlayerLinesTable,
  playerGradeSeasonStatsTable,
} from "@workspace/db";
import type { CapSyncTx } from "./cap-sync";

/**
 * One derived per-(player, grade, season) snapshot, summed from every committed
 * (non-abandoned) match in that grade+season.
 */
export type DerivedSeasonStat = {
  playerId: number;
  grade: string;
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: string | null;
  fifties: number;
  hundreds: number;
  wickets: number;
  runsConceded: number;
  bestBowling: string | null;
  fiveWickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
};

export type SeasonAggregateResult = {
  stats: DerivedSeasonStat[];
  /** Player ids ordered for cap numbering: debut round, then batting position. */
  orderedPlayerIds: number[];
};

type Accum = DerivedSeasonStat & {
  matchIds: Set<number>;
  bestHsRuns: number;
  bestHsNotOut: boolean;
  bestBowlWickets: number;
  bestBowlRuns: number;
  firstRound: number;
  firstPos: number;
};

/**
 * Re-derive the `player_grade_season_stats` rows for one (grade, season) by
 * summing every non-abandoned match line, then replace the existing season rows.
 *
 * MUST run inside the import transaction, BEFORE `recomputeAggregates`. Derived
 * rows are written with `import_id = NULL` (they belong to the season, not a
 * single upload); the per-match audit lives in `matches` / `match_player_lines`.
 */
export async function deriveSeasonSnapshotFromMatches(
  tx: CapSyncTx,
  grade: string,
  season: number,
): Promise<SeasonAggregateResult> {
  const lines = await tx
    .select({
      matchId: matchPlayerLinesTable.matchId,
      playerId: matchPlayerLinesTable.playerId,
      round: matchesTable.round,
      batted: matchPlayerLinesTable.batted,
      battingPos: matchPlayerLinesTable.battingPos,
      runs: matchPlayerLinesTable.runs,
      notOut: matchPlayerLinesTable.notOut,
      bowled: matchPlayerLinesTable.bowled,
      runsConceded: matchPlayerLinesTable.runsConceded,
      wickets: matchPlayerLinesTable.wickets,
      catches: matchPlayerLinesTable.catches,
      stumpings: matchPlayerLinesTable.stumpings,
      runOuts: matchPlayerLinesTable.runOuts,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(matchesTable, eq(matchesTable.id, matchPlayerLinesTable.matchId))
    .where(
      and(
        eq(matchesTable.grade, grade),
        eq(matchesTable.season, season),
        eq(matchesTable.abandoned, false),
      ),
    );

  const byPlayer = new Map<number, Accum>();
  for (const l of lines) {
    let a = byPlayer.get(l.playerId);
    if (!a) {
      a = {
        playerId: l.playerId,
        grade,
        games: 0,
        innings: 0,
        notOuts: 0,
        runs: 0,
        highScore: null,
        fifties: 0,
        hundreds: 0,
        wickets: 0,
        runsConceded: 0,
        bestBowling: null,
        fiveWickets: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        matchIds: new Set<number>(),
        bestHsRuns: -1,
        bestHsNotOut: false,
        bestBowlWickets: -1,
        bestBowlRuns: Infinity,
        firstRound: Number.POSITIVE_INFINITY,
        firstPos: Number.POSITIVE_INFINITY,
      };
      byPlayer.set(l.playerId, a);
    }
    a.matchIds.add(l.matchId);

    // Debut ordering: earliest round, then earliest batting position seen.
    const round = l.round ?? Number.POSITIVE_INFINITY;
    const pos = l.battingPos ?? Number.POSITIVE_INFINITY;
    if (round < a.firstRound || (round === a.firstRound && pos < a.firstPos)) {
      a.firstRound = round;
      a.firstPos = pos;
    }

    if (l.batted) {
      a.innings += 1;
      const runs = l.runs ?? 0;
      a.runs += runs;
      if (l.notOut) a.notOuts += 1;
      if (runs >= 100) a.hundreds += 1;
      else if (runs >= 50) a.fifties += 1;
      // Highest score: greater runs wins; on a tie a not-out beats an out.
      if (
        runs > a.bestHsRuns ||
        (runs === a.bestHsRuns && l.notOut && !a.bestHsNotOut)
      ) {
        a.bestHsRuns = runs;
        a.bestHsNotOut = l.notOut;
      }
    }

    if (l.bowled) {
      const wkts = l.wickets ?? 0;
      const conceded = l.runsConceded ?? 0;
      a.wickets += wkts;
      a.runsConceded += conceded;
      if (wkts >= 5) a.fiveWickets += 1;
      // Best bowling: most wickets, then fewest runs conceded.
      if (
        wkts > a.bestBowlWickets ||
        (wkts === a.bestBowlWickets && conceded < a.bestBowlRuns)
      ) {
        a.bestBowlWickets = wkts;
        a.bestBowlRuns = conceded;
      }
    }

    a.catches += l.catches ?? 0;
    a.stumpings += l.stumpings ?? 0;
    a.runOuts += l.runOuts ?? 0;
  }

  const stats: DerivedSeasonStat[] = [];
  for (const a of byPlayer.values()) {
    a.games = a.matchIds.size;
    a.highScore =
      a.bestHsRuns >= 0 ? `${a.bestHsRuns}${a.bestHsNotOut ? "*" : ""}` : null;
    a.bestBowling =
      a.bestBowlWickets > 0 ? `${a.bestBowlWickets}/${a.bestBowlRuns}` : null;
    const {
      matchIds: _mi,
      bestHsRuns: _hr,
      bestHsNotOut: _hn,
      bestBowlWickets: _bw,
      bestBowlRuns: _br,
      firstRound: _fr,
      firstPos: _fp,
      ...rest
    } = a;
    stats.push(rest);
  }

  const orderedPlayerIds = [...byPlayer.values()]
    .sort(
      (x, y) =>
        x.firstRound - y.firstRound ||
        x.firstPos - y.firstPos ||
        x.playerId - y.playerId,
    )
    .map((a) => a.playerId);

  // Replace the season's derived snapshot rows. These belong to the season as a
  // whole (summed from every match), so they carry import_id = NULL.
  await tx.execute(sql`
    DELETE FROM player_grade_season_stats
    WHERE grade = ${grade} AND season = ${season}
  `);
  if (stats.length > 0) {
    await tx.insert(playerGradeSeasonStatsTable).values(
      stats.map((s) => ({
        importId: null,
        playerId: s.playerId,
        grade: s.grade,
        season,
        games: s.games,
        innings: s.innings,
        notOuts: s.notOuts,
        runs: s.runs,
        highScore: s.highScore,
        fifties: s.fifties,
        hundreds: s.hundreds,
        wickets: s.wickets,
        runsConceded: s.runsConceded,
        bestBowling: s.bestBowling,
        fiveWickets: s.fiveWickets,
        catches: s.catches,
        stumpings: s.stumpings,
        runOuts: s.runOuts,
      })),
    );
  }

  return { stats, orderedPlayerIds };
}
