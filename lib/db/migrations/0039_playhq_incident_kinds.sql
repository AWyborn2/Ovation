-- PlayHQ sync incidents per kind (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md,
-- U4, KTD4). The open-incident unique index moves from (org_id) to (org_id, kind), so an
-- organisation can have one open `unclassified_grades` entry (its grades no classifier
-- recognises, for the platform admin) beside the watchdog's own `overdue` / `failed` incident.
-- The watchdog still keeps at most one open incident of its kinds per org: it reads and opens
-- only those, and only when none is open.
-- No row changes. Idempotent: the wider index is built first (the old, stricter one guarantees
-- no duplicates), then the old one is dropped if it is still there.

CREATE UNIQUE INDEX IF NOT EXISTS "playhq_sync_incidents_open_org_kind_uidx" ON "playhq_sync_incidents" USING btree ("org_id","kind") WHERE "resolved_at" IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "playhq_sync_incidents_open_org_uidx";
