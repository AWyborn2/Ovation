-- PlayHQ scheduled sync: incident log for the watchdog (docs/plans/2026-10-01-001-feat-
-- playhq-scheduled-sync-plan.md, U8/U9). ONE new platform-level table and nothing else:
--   playhq_sync_incidents  one row per sync incident for a PlayHQ organisation; at most one
--                          OPEN row per org, so alerts fire once when an incident opens and
--                          once when it resolves.
-- No existing table, column or row is touched. Idempotent: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS "playhq_sync_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"detail" jsonb DEFAULT '{"reasons":[]}'::jsonb NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "playhq_sync_incidents_open_org_uidx" ON "playhq_sync_incidents" USING btree ("org_id") WHERE "resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playhq_sync_incidents_org_opened_idx" ON "playhq_sync_incidents" USING btree ("org_id","opened_at");
