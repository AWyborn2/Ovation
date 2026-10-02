-- PlayHQ scheduled sync: per-tenant switch (docs/plans/2026-10-01-001-feat-playhq-
-- scheduled-sync-plan.md, U4). ONE new column and nothing else:
--   tenants.playhq_sync_enabled  when false, the hourly runner plans nothing for the
--                                tenant's PlayHQ organisation and ingest does not
--                                project its fixtures. Toggled by platform admins.
--
-- Tenants already linked to a PlayHQ organisation are switched ON, exactly once: the
-- backfill runs only in the same step that creates the column, so re-running this file
-- (production was push-built and baselined at 0000) can never re-enable a tenant an
-- admin has since switched off. Idempotent.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'playhq_sync_enabled'
  ) THEN
    ALTER TABLE "tenants" ADD COLUMN "playhq_sync_enabled" boolean DEFAULT false NOT NULL;
    UPDATE "tenants" SET "playhq_sync_enabled" = true WHERE "playhq_org_id" IS NOT NULL;
  END IF;
END $$;
