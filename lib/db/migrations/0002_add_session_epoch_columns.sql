-- Columns added to the Drizzle schema AFTER the last production `drizzle-kit
-- push`. 0000 defines them, but a pushed database is BASELINED at 0000 (recorded,
-- not executed) by src/migrate.ts, and 0001 reconciles only constraints and
-- indexes, so these columns never reached production. Symptom (10 Sep 2026):
-- every admin login and self-serve signup failed with
--   column "session_epoch" of relation "admins" does not exist
-- Idempotent: a fresh database already has them from 0000 (every statement is
-- a no-op there).
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "session_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "session_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "captains" ADD COLUMN IF NOT EXISTS "session_epoch" integer DEFAULT 0 NOT NULL;
