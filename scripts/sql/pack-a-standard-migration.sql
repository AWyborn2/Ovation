-- Migration: retire the matchSummary-v1 pack rows and all card_layouts
-- (Pack A social templates, U5 — pack registration + old-pack/layouts migration).
--
-- The repo's primary schema-sync path is `pnpm --filter @workspace/db run push`
-- (drizzle-kit push, no migration files); this file mirrors the accompanying data
-- change for environments where the SQL is applied manually. Each statement is
-- idempotent (a DELETE that matches nothing on re-run), matching the style of
-- fixtures-team-lists-migration.sql.
--
-- WHY:
--   Pack A ("broadcast-dark-v1") becomes the standard card catalogue and replaces
--   the built-in canvas visuals that both the old Figma matchSummary pack and the
--   per-kind custom layouts / element-override layers used to customize. With the
--   built-in visuals gone (KTD5/KTD7), those rows have nothing left to target:
--     * card_templates rows for the old pack ('source=pack', 'pack_id=matchSummary-v1')
--       are superseded by the freshly-seeded broadcast-dark-v1 rows.
--     * every card_layouts row (per-kind element overrides + extra sticker/text
--       layers, incl. carousel slide-level layers) is dropped wholesale — standard
--       cards no longer honour layouts.
--   BYO 'background'/'layers' card_templates rows are untouched (R9).

BEGIN;

-- ─── retire the old matchSummary-v1 pack template rows ───────────────────────
DELETE FROM card_templates
  WHERE source = 'pack' AND pack_id = 'matchSummary-v1';

-- ─── drop all per-kind custom layouts (standard cards ignore layouts now) ─────
DELETE FROM card_layouts;

COMMIT;
