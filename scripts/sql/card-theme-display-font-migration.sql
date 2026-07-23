-- Migration: card_themes.display_font column
-- (Pack A social templates, U9 — style token panel + themes extension).
--
-- WHY: the Broadcast Dark pack renderer exposes a curated display-font token
-- (`--disp`) so admins can restyle the heading typeface per theme. The font is
-- stored on the existing card_themes row (see KTD6) rather than a new table.
-- Values are a curated key set (anton | bebas | oswald | teko | archivo); the
-- column is nullable and null resolves to the default "anton" family in the
-- client renderer (pack-render.ts), so existing rows need no backfill.
--
-- The repo's primary schema-sync path is `pnpm --filter @workspace/db run push`
-- (drizzle-kit push, no migration files); this file mirrors that change for
-- environments where the SQL is applied manually. The block is idempotent
-- (IF NOT EXISTS guard), matching fixtures-team-lists-migration.sql.

BEGIN;

ALTER TABLE card_themes
  ADD COLUMN IF NOT EXISTS display_font text;

COMMIT;
