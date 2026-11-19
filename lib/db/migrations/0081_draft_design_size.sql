-- Portrait and Story sizes (plan 2026-11-19, Stage 2): remember the size a
-- draft was designed at, so it reopens there (round 7: Format wasn't saved).
-- Null = a draft from before this change; it opens at Square as before (D5:
-- no backfill). Additive only:
--   social_drafts.design_size           text, null: square | portrait | story | landscape
--   social_draft_revisions.design_size  text, null: the size, restored with the revision
-- The check allows the older sizes on purpose: the server refuses a new square
-- or landscape value in code (only a draft whose design already covers that
-- size may save it), so a legacy draft can still save "Landscape".
-- Apply BEFORE republishing: the new code selects these columns.
--
-- Idempotent (production was push-built and baselined at 0000). Each statement
-- runs on its own: paste them into the Production SQL runner one at a time.

ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "design_size" text;--> statement-breakpoint
ALTER TABLE "social_draft_revisions" ADD COLUMN IF NOT EXISTS "design_size" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_drafts_design_size_check') THEN
    ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_design_size_check"
      CHECK ("design_size" IS NULL OR "design_size" IN ('square', 'portrait', 'story', 'landscape'));
  END IF;
END $$;
