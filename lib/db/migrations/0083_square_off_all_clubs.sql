-- Portrait and Story sizes (plan 2026-11-19, Stage 6, D3): Square goes off
-- for every club. A data change, in this order: Portrait on first wherever a
-- club is about to lose Square with Portrait off, so no club is left without a
-- feed size; then Square off. Older square designs keep opening and
-- downloading at Square; feed posts go out at Portrait.
--
-- Each statement runs on its own: paste them into the Production SQL runner
-- one at a time, in order (it runs only the first statement of a paste). Both
-- are guarded, so running them again changes nothing.
--
-- Read-only check, before and after (expect square_on = 0 and
-- no_feed_size = 0 after): scripts/sql/count-club-sizes.sql

-- 1. A club about to lose Square with Portrait off gets Portrait on first, so no club is left
--    without a feed size.
UPDATE "social_settings" SET "size_portrait" = true WHERE "size_square" = true AND "size_portrait" = false;--> statement-breakpoint
-- 2. Square off for every club (Portrait is on for all of them after step 1).
UPDATE "social_settings" SET "size_square" = false WHERE "size_square" = true AND "size_portrait" = true;
