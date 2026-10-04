-- Platform-admin privacy overrides for central players (docs/plans/2026-10-04-001-feat-playhq-
-- central-projection-plan.md, D4 / P8). ONE new platform-level table and nothing else:
--   player_privacy_overrides  one row per PlayHQ participant whose central privacy flag a
--                             platform admin has set or cleared; the PlayHQ → central projector
--                             applies it to central.players.is_private.
-- No existing table, column or row is touched. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "player_privacy_overrides" (
	"participant_id" text PRIMARY KEY NOT NULL,
	"is_private" boolean NOT NULL,
	"reason" text,
	"set_by_platform_admin_id" integer,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
