-- Squad register from this season's games: a per-club marker set once the register
-- was filled automatically from the season's played sides
-- (artifacts/api-server/src/lib/squad-season-seed.ts), so a club that later empties its
-- register on purpose is never re-filled. One nullable column; nothing else is touched.
-- Idempotent (production was push-built and baselined at 0000).
ALTER TABLE "availability_settings" ADD COLUMN IF NOT EXISTS "season_seeded_at" timestamp with time zone;
