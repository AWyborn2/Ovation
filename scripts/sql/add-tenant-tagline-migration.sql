-- Migration: add tenants.tagline (A9 — club tagline for pack cards)
-- Run once per environment. Idempotent: checks column existence before acting.
-- DEV/PROD: run this file before deploying the code that references the new column.
--
-- `tagline` is a short club line rendered under the club name on pack cards
-- (e.g. "CRICKET CLUB · EST 1991"). Nullable: a tenant with no tagline renders
-- nothing (never another club's founding line). Halls Head (tenant #1) gets its
-- own tagline seeded from HALLS_HEAD_BRAND via scripts/seed-tenants.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'tagline'
  ) THEN
    ALTER TABLE tenants ADD COLUMN tagline text;
  END IF;
END $$;

COMMIT;
