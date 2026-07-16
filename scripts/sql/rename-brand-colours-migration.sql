-- Migration: Rename branding colour fields + add useNavyBase + fix Secret Harbour
-- Run once per environment. Each block is truly idempotent (checks column existence
-- before acting; the Secret Harbour fix targets the exact known pre-fix inverted values).
-- DEV: already applied via Node pg script in the renaming task session.
-- PROD: run this file before deploying the code that references the new column names.
--
-- Field mapping (camelCase / snake_case):
--   OLD primaryColour   / primary_colour   → NEW backgroundColour / background_colour
--   OLD secondaryColour / secondary_colour → NEW primaryColour    / primary_colour
--   OLD tertiaryColour  / tertiary_colour  → NEW juniorsColour    / juniors_colour
--
-- Also adds:  tenants.use_navy_base boolean NOT NULL DEFAULT false
-- Also fixes: tenant id 96 (Secret Harbour) whose background_colour and
--             primary_colour were inverted in the pre-migration naming.

BEGIN;

-- ─── tenants: rename colour columns ────────────────────────────────────────
-- Guard: only rename when the OLD column name still exists (secondary_colour)
-- and the NEW one doesn't — prevents double-run errors.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'secondary_colour'
  ) THEN
    ALTER TABLE tenants RENAME COLUMN primary_colour   TO background_colour;
    ALTER TABLE tenants RENAME COLUMN secondary_colour TO primary_colour;
    ALTER TABLE tenants RENAME COLUMN tertiary_colour  TO juniors_colour;
  END IF;
END $$;

-- ─── tenants: add use_navy_base ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'use_navy_base'
  ) THEN
    ALTER TABLE tenants ADD COLUMN use_navy_base boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── clubs: rename colour columns ──────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clubs' AND column_name = 'secondary_colour'
  ) THEN
    ALTER TABLE clubs RENAME COLUMN primary_colour   TO background_colour;
    ALTER TABLE clubs RENAME COLUMN secondary_colour TO primary_colour;
    ALTER TABLE clubs RENAME COLUMN tertiary_colour  TO juniors_colour;
  END IF;
END $$;

-- ─── Data fix: Secret Harbour (tenant #96) ─────────────────────────────────
-- Prior to the rename, Secret Harbour's colours were entered in the wrong
-- columns: the dark navy (#271E54) was stored as old secondary_colour (accent)
-- and white (#ffffff) was stored as old primary_colour (background), so after
-- the column rename they ended up inverted.
--
-- Pre-fix (inverted) values after rename:
--   background_colour = '#ffffff'   ← was stored as old primary_colour (background slot)
--   primary_colour    = '#271E54'   ← was stored as old secondary_colour (accent slot)
--
-- Required post-fix values (correct semantics):
--   background_colour = '#271E54'   ← dark navy for backgrounds/scorecards
--   primary_colour    = '#ffffff'   ← white accent for buttons/nav/badges
--
-- The WHERE clause targets the exact known inverted values, making this
-- fully idempotent: if the row is already corrected, no rows match and
-- nothing changes.

UPDATE tenants
   SET background_colour = '#271E54',
       primary_colour    = '#ffffff'
 WHERE id = 96
   AND background_colour = '#ffffff'
   AND primary_colour    = '#271E54';

COMMIT;
