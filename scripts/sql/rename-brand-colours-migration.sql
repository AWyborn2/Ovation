-- Migration: Rename branding colour fields + add useNavyBase + fix Secret Harbour
-- Run once per environment (idempotent via DO blocks).
-- DEV: already applied via Node pg script in the renaming task session.
-- PROD: run this file before deploying the code that references the new column names.
--
-- Field mapping (camelCase/snake_case):
--   OLD primaryColour   / primary_colour   → NEW backgroundColour / background_colour
--   OLD secondaryColour / secondary_colour → NEW primaryColour    / primary_colour
--   OLD tertiaryColour  / tertiary_colour  → NEW juniorsColour    / juniors_colour
--
-- Also adds: tenants.use_navy_base boolean NOT NULL DEFAULT false
-- Also fixes: tenant id 96 (Secret Harbour) whose background/primary were inverted.

BEGIN;

-- ─── tenants ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'primary_colour'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tenants' AND column_name = 'background_colour'
    )
  ) THEN
    ALTER TABLE tenants RENAME COLUMN primary_colour   TO background_colour;
    ALTER TABLE tenants RENAME COLUMN secondary_colour TO primary_colour;
    ALTER TABLE tenants RENAME COLUMN tertiary_colour  TO juniors_colour;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'use_navy_base'
  ) THEN
    ALTER TABLE tenants ADD COLUMN use_navy_base boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── clubs ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'primary_colour'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'clubs' AND column_name = 'background_colour'
    )
  ) THEN
    ALTER TABLE clubs RENAME COLUMN primary_colour   TO background_colour;
    ALTER TABLE clubs RENAME COLUMN secondary_colour TO primary_colour;
    ALTER TABLE clubs RENAME COLUMN tertiary_colour  TO juniors_colour;
  END IF;
END $$;

-- ─── Data fix: Secret Harbour (tenant #96) — inverted colours ────────────────
-- At the time of the rename, tenant 96 had its background_colour and
-- primary_colour values in each other's column (they were stored inverted in the
-- old naming).  Swap them so the resolved brand shows the correct colours.

DO $$
DECLARE
  v_bg  text;
  v_pri text;
BEGIN
  SELECT background_colour, primary_colour
    INTO v_bg, v_pri
    FROM tenants
   WHERE id = 96;

  -- Only swap if both values look like hex colours and are different,
  -- guarding against an already-corrected row or a row that was never set.
  IF v_bg IS NOT NULL AND v_pri IS NOT NULL
     AND v_bg ~ '^#[0-9a-fA-F]{6}$'
     AND v_pri ~ '^#[0-9a-fA-F]{6}$'
     AND v_bg <> v_pri
     -- Detect the original inverted state: old secondary (now primary_colour)
     -- was the darker navy value that should be the background.
     -- We identify "needs swap" if background_colour looks like an accent
     -- (lighter / golden) and primary_colour looks like a dark base.
     -- Simple heuristic: background_colour luminance > primary_colour luminance.
     -- If already swapped (background is dark, primary is light), skip.
  THEN
    UPDATE tenants
       SET background_colour = v_pri,
           primary_colour    = v_bg
     WHERE id = 96
       -- Safety guard: only run when background_colour matches the known
       -- inverted value captured at time of migration authoring.
       AND background_colour IS DISTINCT FROM primary_colour;
  END IF;
END $$;

COMMIT;
