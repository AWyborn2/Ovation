import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  baselineAdjustmentsTable,
  playerGradeSeasonStatsTable,
  playersTable,
} from "@workspace/db";
import type { CapSyncTx } from "./cap-sync";

/**
 * Backfill reconciliation mode chosen by the admin for one previous-season
 * import:
 *  - `peel`  — the imported season is ALREADY counted inside the grade's
 *    season=NULL baseline, so subtract its per-player contribution from that
 *    baseline. Career totals stay invariant (baseline shrinks by exactly what
 *    the itemised season adds), floored at zero.
 *  - `add`   — the season is genuinely missing from current totals, so add it
 *    only; the baseline is left untouched (and any prior peel is reversed).
 */
export type ReconcileMode = "peel" | "add";

/** The counting stats that participate in the baseline ↔ season invariant. */
const COUNTING_FIELDS = [
  "games",
  "innings",
  "notOuts",
  "runs",
  "fifties",
  "hundreds",
  "wickets",
  "runsConceded",
  "fiveWickets",
  "catches",
  "stumpings",
  "runOuts",
] as const;
type CountingField = (typeof COUNTING_FIELDS)[number];
type Counting = Record<CountingField, number>;

const ZERO: Counting = {
  games: 0,
  innings: 0,
  notOuts: 0,
  runs: 0,
  fifties: 0,
  hundreds: 0,
  wickets: 0,
  runsConceded: 0,
  fiveWickets: 0,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
};

/** A player whose baseline could not absorb the full peel (data to review). */
export type NegativeBaselineWarning = {
  playerId: number;
  /** Season games being peeled. */
  seasonGames: number;
  /** Baseline games available before peeling (less than seasonGames). */
  baselineGames: number;
};

export type ReconcileResult = {
  mode: ReconcileMode;
  /** Players whose baseline was peeled. */
  peeledPlayers: number;
  /** Players whose baseline floored at zero (career total will change). */
  negativeWarnings: NegativeBaselineWarning[];
};

function add(a: Counting, b: Counting): Counting {
  const out = { ...a };
  for (const f of COUNTING_FIELDS) out[f] = a[f] + b[f];
  return out;
}

/**
 * Reconcile the grade's season=NULL baseline against an itemised backfill season.
 *
 * MUST run inside the import transaction, AFTER the season's snapshot rows are
 * written/derived and BEFORE `recomputeAggregates`, so the recompute sees the
 * adjusted baseline.
 *
 * The routine is idempotent and re-entrant: it first REVERSES any peel it
 * previously recorded for this (grade, season) — adding the stored deltas back
 * to the baseline — then, if `mode === "peel"`, peels the CURRENT season total
 * (which may have grown/shrunk as matches were added/removed). This lets the
 * per-match path call it on every commit and every delete with consistent
 * results, and lets delete/undo restore the baseline simply by re-deriving an
 * empty (or smaller) season.
 *
 * @param mode `peel` or `add` from the admin's choice. Pass `undefined` from
 *        delete/re-derive paths: the routine then peels iff a prior peel
 *        adjustment exists for this (grade, season), otherwise it is a no-op.
 */
export async function reconcileBaseline(
  tx: CapSyncTx,
  grade: string,
  season: number,
  mode?: ReconcileMode,
): Promise<ReconcileResult> {
  // ---- 1. Reverse any previously-recorded peel for this (grade, season) -----
  const prior = await tx
    .select()
    .from(baselineAdjustmentsTable)
    .where(
      and(
        eq(baselineAdjustmentsTable.grade, grade),
        eq(baselineAdjustmentsTable.season, season),
      ),
    );
  const hadPriorPeel = prior.length > 0;

  for (const adj of prior) {
    await restoreToBaseline(tx, grade, adj.playerId, {
      games: adj.games,
      innings: adj.innings,
      notOuts: adj.notOuts,
      runs: adj.runs,
      fifties: adj.fifties,
      hundreds: adj.hundreds,
      wickets: adj.wickets,
      runsConceded: adj.runsConceded,
      fiveWickets: adj.fiveWickets,
      catches: adj.catches,
      stumpings: adj.stumpings,
      runOuts: adj.runOuts,
    });
  }
  if (hadPriorPeel) {
    await tx
      .delete(baselineAdjustmentsTable)
      .where(
        and(
          eq(baselineAdjustmentsTable.grade, grade),
          eq(baselineAdjustmentsTable.season, season),
        ),
      );
  }

  // delete / re-derive callers pass no mode: peel again iff we had a prior peel.
  const effectiveMode: ReconcileMode = mode ?? (hadPriorPeel ? "peel" : "add");
  if (effectiveMode === "add") {
    return { mode: "add", peeledPlayers: 0, negativeWarnings: [] };
  }

  // ---- 2. Peel the current season total out of the baseline -----------------
  const seasonRows = await tx
    .select()
    .from(playerGradeSeasonStatsTable)
    .where(
      and(
        eq(playerGradeSeasonStatsTable.grade, grade),
        eq(playerGradeSeasonStatsTable.season, season),
      ),
    );

  // Sum the season per player (a player may have >1 season row in theory).
  const seasonByPlayer = new Map<number, Counting>();
  for (const r of seasonRows) {
    const cur = seasonByPlayer.get(r.playerId) ?? { ...ZERO };
    seasonByPlayer.set(
      r.playerId,
      add(cur, {
        games: r.games ?? 0,
        innings: r.innings ?? 0,
        notOuts: r.notOuts ?? 0,
        runs: r.runs ?? 0,
        fifties: r.fifties ?? 0,
        hundreds: r.hundreds ?? 0,
        wickets: r.wickets ?? 0,
        runsConceded: r.runsConceded ?? 0,
        fiveWickets: r.fiveWickets ?? 0,
        catches: r.catches ?? 0,
        stumpings: r.stumpings ?? 0,
        runOuts: r.runOuts ?? 0,
      }),
    );
  }

  const negativeWarnings: NegativeBaselineWarning[] = [];
  let peeledPlayers = 0;

  for (const [playerId, season_] of seasonByPlayer) {
    const baseline = await baselineTotal(tx, grade, playerId);
    // Per-stat peel: subtract as much as the baseline holds (floor at zero).
    const delta: Counting = { ...ZERO };
    for (const f of COUNTING_FIELDS) {
      delta[f] = Math.min(baseline[f], season_[f]);
    }
    const anyDelta = COUNTING_FIELDS.some((f) => delta[f] > 0);
    if (anyDelta) {
      await subtractFromBaseline(tx, grade, playerId, delta);
      await tx.insert(baselineAdjustmentsTable).values({
        grade,
        season,
        playerId,
        ...delta,
      });
      peeledPlayers++;
    }
    if (season_.games > baseline.games) {
      negativeWarnings.push({
        playerId,
        seasonGames: season_.games,
        baselineGames: baseline.games,
      });
    }
  }

  return { mode: "peel", peeledPlayers, negativeWarnings };
}

/**
 * Per-player base figures for a backfill preview: the current season=NULL
 * baseline for a grade and the current career totals. Read-only (uses `db`, runs
 * outside any transaction). The season contribution is supplied by the caller
 * from the parsed import.
 */
export type BackfillBaseFigures = {
  baselineGames: number;
  baselineRuns: number;
  baselineWickets: number;
  careerGames: number;
  careerRuns: number;
  careerWickets: number;
};

export async function loadBackfillBaseFigures(
  grade: string,
  playerIds: number[],
): Promise<Map<number, BackfillBaseFigures>> {
  const out = new Map<number, BackfillBaseFigures>();
  const ids = Array.from(new Set(playerIds));
  if (ids.length === 0) return out;

  const baseRows = await db
    .select({
      playerId: playerGradeSeasonStatsTable.playerId,
      games: sql<number>`coalesce(sum(${playerGradeSeasonStatsTable.games}), 0)`,
      runs: sql<number>`coalesce(sum(${playerGradeSeasonStatsTable.runs}), 0)`,
      wickets: sql<number>`coalesce(sum(${playerGradeSeasonStatsTable.wickets}), 0)`,
    })
    .from(playerGradeSeasonStatsTable)
    .where(
      and(
        eq(playerGradeSeasonStatsTable.grade, grade),
        isNull(playerGradeSeasonStatsTable.season),
        inArray(playerGradeSeasonStatsTable.playerId, ids),
      ),
    )
    .groupBy(playerGradeSeasonStatsTable.playerId);
  const baseByPlayer = new Map<number, { games: number; runs: number; wickets: number }>();
  for (const r of baseRows) {
    baseByPlayer.set(r.playerId, {
      games: Number(r.games),
      runs: Number(r.runs),
      wickets: Number(r.wickets),
    });
  }

  const careerRows = await db
    .select({
      id: playersTable.id,
      games: playersTable.totalGames,
      runs: playersTable.totalRuns,
      wickets: playersTable.totalWickets,
    })
    .from(playersTable)
    .where(inArray(playersTable.id, ids));
  const careerByPlayer = new Map<number, { games: number; runs: number; wickets: number }>();
  for (const r of careerRows) {
    careerByPlayer.set(r.id, {
      games: r.games ?? 0,
      runs: r.runs ?? 0,
      wickets: r.wickets ?? 0,
    });
  }

  for (const id of ids) {
    const b = baseByPlayer.get(id) ?? { games: 0, runs: 0, wickets: 0 };
    const c = careerByPlayer.get(id) ?? { games: 0, runs: 0, wickets: 0 };
    out.set(id, {
      baselineGames: b.games,
      baselineRuns: b.runs,
      baselineWickets: b.wickets,
      careerGames: c.games,
      careerRuns: c.runs,
      careerWickets: c.wickets,
    });
  }
  return out;
}

/** Sum a player's season=NULL baseline counting stats for a grade. */
async function baselineTotal(
  tx: CapSyncTx,
  grade: string,
  playerId: number,
): Promise<Counting> {
  const rows = await tx
    .select()
    .from(playerGradeSeasonStatsTable)
    .where(
      and(
        eq(playerGradeSeasonStatsTable.grade, grade),
        isNull(playerGradeSeasonStatsTable.season),
        eq(playerGradeSeasonStatsTable.playerId, playerId),
      ),
    );
  let total: Counting = { ...ZERO };
  for (const r of rows) {
    total = add(total, {
      games: r.games ?? 0,
      innings: r.innings ?? 0,
      notOuts: r.notOuts ?? 0,
      runs: r.runs ?? 0,
      fifties: r.fifties ?? 0,
      hundreds: r.hundreds ?? 0,
      wickets: r.wickets ?? 0,
      runsConceded: r.runsConceded ?? 0,
      fiveWickets: r.fiveWickets ?? 0,
      catches: r.catches ?? 0,
      stumpings: r.stumpings ?? 0,
      runOuts: r.runOuts ?? 0,
    });
  }
  return total;
}

/**
 * Subtract `delta` from the player's baseline rows for the grade, greedily
 * draining the highest-games row first. Distribution across a player's multiple
 * baseline rows is irrelevant to every derived figure (all aggregates SUM across
 * a player's rows), so we only need the per-player total to be correct.
 */
async function subtractFromBaseline(
  tx: CapSyncTx,
  grade: string,
  playerId: number,
  delta: Counting,
): Promise<void> {
  const rows = await tx
    .select()
    .from(playerGradeSeasonStatsTable)
    .where(
      and(
        eq(playerGradeSeasonStatsTable.grade, grade),
        isNull(playerGradeSeasonStatsTable.season),
        eq(playerGradeSeasonStatsTable.playerId, playerId),
      ),
    )
    .orderBy(sql`coalesce(games, 0) desc`);
  if (rows.length === 0) return;

  const remaining: Counting = { ...delta };
  for (const row of rows) {
    if (!COUNTING_FIELDS.some((f) => remaining[f] > 0)) break;
    const take: Counting = { ...ZERO };
    const cur: Counting = {
      games: row.games ?? 0,
      innings: row.innings ?? 0,
      notOuts: row.notOuts ?? 0,
      runs: row.runs ?? 0,
      fifties: row.fifties ?? 0,
      hundreds: row.hundreds ?? 0,
      wickets: row.wickets ?? 0,
      runsConceded: row.runsConceded ?? 0,
      fiveWickets: row.fiveWickets ?? 0,
      catches: row.catches ?? 0,
      stumpings: row.stumpings ?? 0,
      runOuts: row.runOuts ?? 0,
    };
    for (const f of COUNTING_FIELDS) {
      take[f] = Math.min(cur[f], remaining[f]);
      remaining[f] -= take[f];
    }
    await tx
      .update(playerGradeSeasonStatsTable)
      .set({
        games: cur.games - take.games,
        innings: cur.innings - take.innings,
        notOuts: cur.notOuts - take.notOuts,
        runs: cur.runs - take.runs,
        fifties: cur.fifties - take.fifties,
        hundreds: cur.hundreds - take.hundreds,
        wickets: cur.wickets - take.wickets,
        runsConceded: cur.runsConceded - take.runsConceded,
        fiveWickets: cur.fiveWickets - take.fiveWickets,
        catches: cur.catches - take.catches,
        stumpings: cur.stumpings - take.stumpings,
        runOuts: cur.runOuts - take.runOuts,
      })
      .where(eq(playerGradeSeasonStatsTable.id, row.id));
  }
}

/**
 * Reverse a recorded peel: add `delta` back to the player's baseline. Targets
 * the first baseline row for the (player, grade); if none exists (defensive),
 * a fresh baseline row is created carrying the restored figures.
 */
async function restoreToBaseline(
  tx: CapSyncTx,
  grade: string,
  playerId: number,
  delta: Counting,
): Promise<void> {
  if (!COUNTING_FIELDS.some((f) => delta[f] > 0)) return;
  const [row] = await tx
    .select()
    .from(playerGradeSeasonStatsTable)
    .where(
      and(
        eq(playerGradeSeasonStatsTable.grade, grade),
        isNull(playerGradeSeasonStatsTable.season),
        eq(playerGradeSeasonStatsTable.playerId, playerId),
      ),
    )
    .limit(1);
  if (!row) {
    await tx.insert(playerGradeSeasonStatsTable).values({
      importId: null,
      playerId,
      grade,
      season: null,
      ...delta,
    });
    return;
  }
  await tx
    .update(playerGradeSeasonStatsTable)
    .set({
      games: (row.games ?? 0) + delta.games,
      innings: (row.innings ?? 0) + delta.innings,
      notOuts: (row.notOuts ?? 0) + delta.notOuts,
      runs: (row.runs ?? 0) + delta.runs,
      fifties: (row.fifties ?? 0) + delta.fifties,
      hundreds: (row.hundreds ?? 0) + delta.hundreds,
      wickets: (row.wickets ?? 0) + delta.wickets,
      runsConceded: (row.runsConceded ?? 0) + delta.runsConceded,
      fiveWickets: (row.fiveWickets ?? 0) + delta.fiveWickets,
      catches: (row.catches ?? 0) + delta.catches,
      stumpings: (row.stumpings ?? 0) + delta.stumpings,
      runOuts: (row.runOuts ?? 0) + delta.runOuts,
    })
    .where(eq(playerGradeSeasonStatsTable.id, row.id));
}
