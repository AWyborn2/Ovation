-- Migration: fixtures + team_lists tables and social_settings.season_start_date
-- (Pack A social templates, U6 — fixtures + team-list store).
--
-- The repo's primary schema-sync path is `pnpm --filter @workspace/db run push`
-- (drizzle-kit push, no migration files); this file mirrors that change for
-- environments where the SQL is applied manually. Each block is idempotent
-- (IF NOT EXISTS guards), matching rename-brand-colours-migration.sql.
--
-- Adds:
--   fixtures            — admin-entered upcoming fixtures, tenant-scoped.
--                         `source` = 'manual' (admin CRUD) | 'playhq'
--                         (reserved for the follow-up PlayHQ ingest).
--   team_lists          — one ordered XI per fixture (unique tenant+fixture),
--                         players jsonb [{order, playerId?, displayName, role?}].
--   social_settings.season_start_date — countdown-card season-start override
--                         (null = derive from earliest upcoming fixture).

BEGIN;

-- ─── fixtures ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fixtures (
  id                serial PRIMARY KEY,
  tenant_id         integer NOT NULL DEFAULT 1 REFERENCES tenants(id),
  grade             text NOT NULL,
  round_label       text,
  opponent_name     text NOT NULL,
  opponent_club_id  integer,
  opponent_logo_url text,
  venue             text,
  start_at          timestamptz NOT NULL,
  is_home           boolean NOT NULL DEFAULT true,
  notes             text,
  source            text NOT NULL DEFAULT 'manual',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── team_lists ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_lists (
  id           serial PRIMARY KEY,
  tenant_id    integer NOT NULL DEFAULT 1 REFERENCES tenants(id),
  fixture_id   integer NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  players      jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_lists_tenant_fixture_unique
  ON team_lists (tenant_id, fixture_id);

-- ─── social_settings: add season_start_date ─────────────────────────────────

ALTER TABLE social_settings
  ADD COLUMN IF NOT EXISTS season_start_date timestamptz;

COMMIT;
