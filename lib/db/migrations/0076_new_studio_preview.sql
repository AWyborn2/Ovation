-- Studio create consolidation, S1: the per-club "New Studio (preview)" switch.
-- Additive only:
--   tenants.new_studio_enabled
--       A platform-admin switch. Off (the default): the club sees today's Social Studio
--       unchanged. On: the new menu, Create flow and editor panels.
-- Apply BEFORE republishing: the new code selects this column.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "new_studio_enabled" boolean DEFAULT false NOT NULL;
