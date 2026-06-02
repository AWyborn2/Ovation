/**
 * Reconcile the cap_register's cached game counts with the current stats.
 *
 * `cap_register.games_a_grade` / `in_stats` are cached columns. They are kept
 * fresh by the API (import sync, rollback, recompute-on-link, and the admin
 * "Refresh from stats" action), but caps that were linked to a player BEFORE
 * those paths existed — or linked directly in the database — can carry a stale
 * value (typically 0 games even though the linked player has games on record).
 *
 * This script refreshes every LINKED cap (any cap with a player_id) so its
 * games_a_grade equals the linked player's per-grade games and in_stats reflects
 * whether they have any (male caps → "A Grade", female caps → "Female A Grade").
 * Unlinked, pre-digital caps are left untouched. It is idempotent and safe to
 * run on every deploy from post-merge.
 *
 * Run with: pnpm --filter @workspace/scripts run reconcile-caps
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    UPDATE cap_register c
    SET games_a_grade = COALESCE(s.games, 0),
        in_stats = COALESCE(s.games, 0) > 0
    FROM cap_register cc
    LEFT JOIN player_grade_stats s
      ON s.player_id = cc.player_id
     AND s.grade = CASE cc.category WHEN 'female' THEN 'Female A Grade' ELSE 'A Grade' END
    WHERE c.id = cc.id
      AND cc.player_id IS NOT NULL
      AND (
        c.games_a_grade <> COALESCE(s.games, 0)
        OR c.in_stats <> (COALESCE(s.games, 0) > 0)
      )
  `);
  const changed = (result as { rowCount?: number } | null)?.rowCount ?? 0;
  console.log(`reconcile-caps: refreshed ${changed} linked cap(s) from stats`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
