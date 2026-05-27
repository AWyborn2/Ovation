/**
 * Idempotent one-off backfill: copy existing player_grade_stats rows into
 * player_grade_season_stats with season = NULL as the baseline snapshot, so
 * the snapshot table is the source of truth before any PlayCricket import.
 *
 * Safe to run multiple times: only inserts rows for (player_id, grade) pairs
 * that don't already have a baseline (season IS NULL) snapshot.
 *
 * Run with: pnpm --filter @workspace/scripts run backfill-season-snapshots
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const before = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM player_grade_season_stats WHERE season IS NULL`,
  );
  console.log("baseline snapshots before:", before.rows[0]);

  const result = await db.execute(sql`
    INSERT INTO player_grade_season_stats
      (player_id, grade, season, games, innings, not_outs, runs, high_score,
       fifties, hundreds, wickets, runs_conceded, best_bowling, five_wickets,
       catches, stumpings, run_outs)
    SELECT
      s.player_id, s.grade, NULL::int, s.games, s.innings, s.not_outs, s.runs,
      s.high_score, s.fifties, s.hundreds, s.wickets, s.runs_conceded,
      s.best_bowling, s.five_wickets, s.catches, s.stumpings, s.run_outs
    FROM player_grade_stats s
    WHERE NOT EXISTS (
      SELECT 1 FROM player_grade_season_stats x
      WHERE x.player_id = s.player_id
        AND x.grade = s.grade
        AND x.season IS NULL
    )
  `);
  console.log("rows inserted:", result.rowCount);

  const after = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM player_grade_season_stats WHERE season IS NULL`,
  );
  console.log("baseline snapshots after:", after.rows[0]);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
