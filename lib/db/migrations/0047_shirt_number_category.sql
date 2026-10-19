-- Shirt-number categories (admin-menu-consolidation PR 2; .10x/decisions/architect/admin-menu-consolidation.md).
-- The senior register splits into Men and Female:
--   shirt_numbers.category  'men' or 'female'. Every existing row takes the default ('men'),
--                           so nothing that shows today changes until an admin moves a row.
--   The two per-person unique indexes gain the category, so one person may hold an entry on
--   the men's AND the female register in the same season (a woman who also plays in a men's
--   side). Number clashes are checked within a category only (service layer).
-- junior_shirt_numbers is unchanged (juniors isolation).
-- Apply BEFORE republishing: the new code writes and filters on this column.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS,
-- the check is dropped if present and re-added, and the old indexes are dropped IF EXISTS.

ALTER TABLE "shirt_numbers" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'men' NOT NULL;--> statement-breakpoint
ALTER TABLE "shirt_numbers" DROP CONSTRAINT IF EXISTS "shirt_numbers_category_check";--> statement-breakpoint
ALTER TABLE "shirt_numbers" ADD CONSTRAINT "shirt_numbers_category_check" CHECK ("category" IN ('men', 'female'));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shirt_numbers_tenant_season_category_participant_uidx" ON "shirt_numbers" USING btree ("tenant_id","season","category","participant_id") WHERE "participant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shirt_numbers_tenant_season_category_player_uidx" ON "shirt_numbers" USING btree ("tenant_id","season","category","player_id") WHERE "player_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "shirt_numbers_tenant_season_participant_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "shirt_numbers_tenant_season_player_uidx";
