-- Central premiership seeding (honour boards for central-backed tenants):
-- premierships remember the central.premiers row they were seeded from (the
-- re-seed key) and the decider's central match id (the Grand Final scorecard
-- link); premiership_players keep the central participant GUID so the player
-- link resolves through player_id_map. Idempotent (IF NOT EXISTS) for the same
-- reason as 0002-0004: production is baselined at 0000, so every statement must
-- be safe on both a fresh database and a pushed one.
ALTER TABLE "premiership_players" ADD COLUMN IF NOT EXISTS "participant_id" text;--> statement-breakpoint
ALTER TABLE "premierships" ADD COLUMN IF NOT EXISTS "central_premier_id" integer;--> statement-breakpoint
ALTER TABLE "premierships" ADD COLUMN IF NOT EXISTS "central_match_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "premierships_tenant_central_premier_uq" ON "premierships" USING btree ("tenant_id","central_premier_id");
