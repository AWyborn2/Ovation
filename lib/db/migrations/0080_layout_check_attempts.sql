-- Layout checks that never finish (retest 7): every templated draft made on
-- 19 Nov 2026 showed "Checking layout" in the Social Queue for good, because a
-- check that failed left the draft pending and the next sweep tried it again,
-- forever, ahead of newer drafts. These columns count the tries so the queue
-- can say when one was last tried, and after three failed tries mark it
-- "check failed, needs a look". A failed check stays pending
-- (layout_check_pending stays true), so automation still leaves the draft
-- alone; an edit, apply or data refresh clears all four and it is tried again.
-- Additive only:
--   social_drafts.layout_check_attempts       integer, default 0: tries since the design last changed
--   social_drafts.layout_check_last_tried_at  timestamptz, null until a sweep tries it
--   social_drafts.layout_check_failed         boolean, default false: gave up after three failed tries
--   social_drafts.layout_check_error          text, null: why the last try failed
-- Apply BEFORE republishing: the new code selects these columns.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "layout_check_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "layout_check_last_tried_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "layout_check_failed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "layout_check_error" text;
