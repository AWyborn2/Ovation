-- Posting calendar (docs/plans/2026-10-07-003-feat-social-posting-calendar-plan.md, U1).
-- Additive: new nullable or defaulted columns, one partial index and two check constraints.
-- No existing row changes meaning (a club's calendar stays off until it is switched on), so
-- this can apply before or after the code that reads it ships — but it MUST be applied
-- before republishing, because the new code selects these columns.
--   social_drafts.planned_at / planned_by        when a card goes out; "auto" or "admin" (pinned)
--   social_drafts.roll_count                       times it rolled to a later slot unapproved
--   social_drafts.dispatched_at                    published or nudged at its time (never twice)
--   social_drafts.overdue_notified_at              a pinned card's one overdue reminder
--   social_drafts.expired_at                       past the club's age limit
--   social_settings.posting_schedule               weekly slots per kind, cap, gap, age limit
--
-- Idempotent (production was push-built and baselined at 0000): columns use
-- ADD COLUMN IF NOT EXISTS, the index IF NOT EXISTS, and each check constraint is dropped if
-- present and re-added.

ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "planned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "planned_by" text;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "roll_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "overdue_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "posting_schedule" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_drafts_planned_idx" ON "social_drafts" USING btree ("tenant_id","planned_at") WHERE planned_at IS NOT NULL;--> statement-breakpoint
ALTER TABLE "social_drafts" DROP CONSTRAINT IF EXISTS "social_drafts_planned_by_check";--> statement-breakpoint
ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_planned_by_check" CHECK ("planned_by" IS NULL OR "planned_by" IN ('auto', 'admin'));--> statement-breakpoint
ALTER TABLE "social_drafts" DROP CONSTRAINT IF EXISTS "social_drafts_roll_count_check";--> statement-breakpoint
ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_roll_count_check" CHECK ("roll_count" >= 0);
