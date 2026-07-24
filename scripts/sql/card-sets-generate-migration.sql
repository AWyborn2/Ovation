-- Migration: card_sets grouping columns + idempotent-generation index
-- (Task C3 — server-side themed carousel-set generation).
--
-- WHY: POST /card-sets/generate batch-assembles a carousel from a group of
-- same-kind cards (e.g. every match summary in a round, or every grade's
-- leaderboard) into ONE card_sets row, and re-running the generation must UPDATE
-- that same set rather than pile up duplicates. The grouping key is stored on
-- the row: source_kind (the ShareCardInput kind assembled), plus season /
-- source_round / grade to narrow the source rows. All four are nullable and stay
-- null for hand-authored sets.
--
-- The partial unique index enforces one generated set per
-- (tenant_id, source_kind, season, source_round, grade) WHERE source_kind IS NOT
-- NULL — mirroring social_drafts_match_dedupe. Postgres treats NULLs as distinct
-- in a unique index by default, so a raw-column index would NOT dedupe the
-- all-null gradeLeader key (season/round/grade all null); NULLS NOT DISTINCT
-- would, but drizzle-kit 0.45.2's partial uniqueIndex can't express it, so
-- `push` would create the looser index and diverge from this file. Instead the
-- nullable columns are folded through COALESCE sentinels (-1 / '') so the key is
-- non-null and dedupes at the DB level — and this expression is identical in the
-- Drizzle schema, so BOTH sync paths (`push` and this SQL) produce the same
-- index. The route's select-then-upsert stays as the in-transaction guard.
--
-- The repo's primary schema-sync path is `pnpm --filter @workspace/db run push`
-- (drizzle-kit push, no migration files); this file mirrors that change for
-- environments where the SQL is applied manually. The block is idempotent
-- (IF NOT EXISTS guards), matching sponsor-presenting-migration.sql.

BEGIN;

ALTER TABLE card_sets
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_round integer,
  ADD COLUMN IF NOT EXISTS season integer,
  ADD COLUMN IF NOT EXISTS grade text;

CREATE UNIQUE INDEX IF NOT EXISTS card_sets_source_dedupe
  ON card_sets (
    tenant_id,
    source_kind,
    COALESCE(season, -1),
    COALESCE(source_round, -1),
    COALESCE(grade, '')
  )
  WHERE source_kind IS NOT NULL;

COMMIT;
