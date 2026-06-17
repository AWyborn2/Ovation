/**
 * recompute-all.ts — one-shot full recompute of the stored senior aggregates.
 *
 *   pnpm --filter @workspace/api-server run recompute-all
 *
 * The canonical derivation `recomputeAggregates(tx, grades)` is normally run
 * per-grade inside each import/stat-edit transaction. Nothing runs it across the
 * whole database, so a missed recompute (e.g. a data edit that bypassed the
 * import path) leaves `player_grade_stats` / `players` career rollups drifted
 * from the `player_grade_season_stats` snapshots. This runs the SAME canonical
 * module over EVERY grade once, in a single transaction, reconciling:
 *   - player_grade_stats := SUM(player_grade_season_stats)  per (player, grade)
 *   - players.total_*     := SUM(player_grade_stats)         per player
 *   - grade_summaries     := rebuilt per grade
 *
 * After this, both consistency invariants hold for every player by construction
 * (so it clears player-totals-consistency + senior-games-consistency). It
 * reconciles TO the snapshot source of truth — if a specific figure then looks
 * wrong, that's a snapshot/import data question, not a consistency one.
 *
 * Juniors are NOT affected: junior stats are derived in-query from the read-only
 * junior_* tables, not stored aggregates, so there is no junior recompute.
 *
 * Requires DATABASE_URL.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { recomputeAggregates } from "../lib/recompute";

async function main(): Promise<void> {
  const res = await db.execute(
    sql`SELECT DISTINCT grade FROM player_grade_season_stats
        WHERE grade IS NOT NULL AND grade <> 'CLUB TOTAL'
        ORDER BY grade`,
  );
  const grades = (res.rows as { grade: string }[]).map((r) => r.grade);
  if (grades.length === 0) {
    console.log("recompute-all: no grades in player_grade_season_stats; nothing to do.");
    return;
  }

  await db.transaction(async (tx) => {
    await recomputeAggregates(tx, grades);
  });

  console.log(
    `recompute-all: rebuilt player_grade_stats + player career totals + ` +
      `grade_summaries for ${grades.length} grade(s): ${grades.join(", ")}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
