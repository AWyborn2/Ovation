-- Migration: sponsors.is_presenting column + one-presenting-per-tenant index
-- (Pack A7 — dynamic "presented by" primary sponsor).
--
-- WHY: the Broadcast Dark pack renderer stamps a "presented by <sponsor>" line
-- on many cards. It historically resolved to a hard-coded Halls Head sample
-- literal ("eSA Sport" / "PlayHQ"). A7 lets a tenant DESIGNATE one presenting
-- (primary) sponsor whose name fills that line; when none is designated the line
-- renders empty rather than leaking the sample. The designation is a boolean on
-- the existing sponsors row (tenant-scoped) — at most one presenting sponsor per
-- tenant, enforced by the partial unique index below and mirrored by the route's
-- transaction that unsets any prior presenting sponsor before setting a new one.
--
-- The repo's primary schema-sync path is `pnpm --filter @workspace/db run push`
-- (drizzle-kit push, no migration files); this file mirrors that change for
-- environments where the SQL is applied manually. The block is idempotent
-- (IF NOT EXISTS guards), matching card-theme-display-font-migration.sql.

BEGIN;

ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS is_presenting boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS sponsors_one_presenting_per_tenant
  ON sponsors (tenant_id)
  WHERE is_presenting;

COMMIT;
