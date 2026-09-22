-- PlayHQ linkage for fixtures (Fixtures & Results page + Social Studio projection).
--   tenants.playhq_org_id      the club's PlayHQ organisation GUID (null = not linked)
--   fixtures.playhq_match_id   PlayHQ match GUID on rows projected from playhq.* (null = manual)
-- Both partial-unique: one tenant per organisation, one fixture per PlayHQ match per
-- tenant (the upsert key scripts/src/playhq-project-fixtures.ts re-syncs on).
-- Idempotent (IF NOT EXISTS) for the same reason as 0002: production is baselined at
-- 0000, so every statement must be safe on both a fresh database and a pushed one.
ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "playhq_match_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "playhq_org_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fixtures_tenant_playhq_match_uidx" ON "fixtures" USING btree ("tenant_id","playhq_match_id") WHERE "playhq_match_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_playhq_org_id_uidx" ON "tenants" USING btree ("playhq_org_id") WHERE "playhq_org_id" IS NOT NULL;
