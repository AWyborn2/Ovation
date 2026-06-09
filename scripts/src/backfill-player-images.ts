/**
 * Backfill the player photo gallery from the legacy single-photo pointer.
 *
 * Before the gallery existed, each player had at most one photo stored in
 * `players.image_url`. The gallery (`player_images`) is additive: every reader
 * still treats `players.image_url` as the default-photo pointer, and that value
 * MIRRORS the gallery's default row. For players that pre-date the gallery we
 * must therefore insert one default `player_images` row per non-null
 * `players.image_url`, or those legacy photos never appear in the admin gallery
 * or the per-card photo pickers.
 *
 * This inserts a single default row (sort_order 0, is_default true) for every
 * player that has a non-null `image_url` but no gallery row yet. It is
 * idempotent — the NOT EXISTS guard means re-running it (e.g. on every deploy
 * from post-merge) inserts nothing once a player already has gallery rows, so it
 * never duplicates a photo or clobbers a curated gallery.
 *
 * Run with: pnpm --filter @workspace/scripts run backfill-player-images
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    INSERT INTO player_images (player_id, image_url, sort_order, is_default)
    SELECT p.id, p.image_url, 0, true
    FROM players p
    WHERE p.image_url IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM player_images pi WHERE pi.player_id = p.id
      )
  `);
  const inserted = (result as { rowCount?: number } | null)?.rowCount ?? 0;
  console.log(
    `backfill-player-images: inserted ${inserted} default gallery row(s) from players.image_url`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
