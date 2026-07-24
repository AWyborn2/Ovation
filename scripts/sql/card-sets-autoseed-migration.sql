-- Migration: social_settings.autoseed_carousels toggle
-- (Task C4 — auto-seed a carousel from a round's approved match-summary drafts).
--
-- WHY: POST /card-sets/autoseed turns a round's APPROVED match-summary
-- social_drafts into one carousel card_sets row (reusing the C3 generate core).
-- The behaviour is gated by this per-tenant boolean, DEFAULT FALSE — dormant
-- like the other social-automation toggles until a tenant opts in.
--
-- The repo's primary schema-sync path is `pnpm --filter @workspace/db run push`
-- (drizzle-kit push, no migration files); this file mirrors that change for
-- environments where the SQL is applied manually. Idempotent (IF NOT EXISTS),
-- matching card-sets-generate-migration.sql.

BEGIN;

ALTER TABLE social_settings
  ADD COLUMN IF NOT EXISTS autoseed_carousels boolean NOT NULL DEFAULT false;

COMMIT;
