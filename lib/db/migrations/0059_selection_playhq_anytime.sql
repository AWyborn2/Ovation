-- Selection Hub: PlayHQ's named side at any time, and a hub-triggered PlayHQ fetch.
-- Additive only:
--   team_lists.playhq_players / playhq_seen_at          the side the club last named in PlayHQ,
--   junior_team_lists.playhq_players / playhq_seen_at   kept by the sync whatever the list's
--                                                       source; the Hub's "Sync from PlayHQ"
--                                                       reads it, so a finalised-then-reopened
--                                                       side (or an admin's list) can still
--                                                       pull PlayHQ's side
--   tenants.playhq_fetch_requested_at / _by / completed_at
--                                                       an admin's "Fetch latest from PlayHQ":
--                                                       the next sync run collects the club's
--                                                       named sides (the `ondemand` plan)
-- NULL everywhere until the next sync or request, so nothing changes on deploy: the Hub falls
-- back to a PlayHQ-sourced list's own players until the sync has filled the new column.
-- Apply BEFORE republishing: the new code selects these columns.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "team_lists" ADD COLUMN IF NOT EXISTS "playhq_players" jsonb;--> statement-breakpoint
ALTER TABLE "team_lists" ADD COLUMN IF NOT EXISTS "playhq_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "junior_team_lists" ADD COLUMN IF NOT EXISTS "playhq_players" jsonb;--> statement-breakpoint
ALTER TABLE "junior_team_lists" ADD COLUMN IF NOT EXISTS "playhq_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "playhq_fetch_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "playhq_fetch_requested_by" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "playhq_fetch_completed_at" timestamp with time zone;
