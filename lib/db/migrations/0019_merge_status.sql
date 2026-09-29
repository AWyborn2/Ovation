-- Merge review state on player curation (hybrid stats plan U6 / KTD2). Only a
-- "confirmed" merge folds a duplicate GUID into its keeper on read; "suggested"
-- and "rejected" leave both separate. Every merge that already exists was
-- written deliberately (the admin curation route, or the reviewed Halls Head
-- crosswalk persist), so it becomes "confirmed" — which is also what keeps
-- each such pair showing as one player now that reads honour the status.
-- Idempotent (production was push-built and baselined at 0000): re-running is
-- harmless.
ALTER TABLE "player_curation" ADD COLUMN IF NOT EXISTS "merge_status" text;--> statement-breakpoint
UPDATE "player_curation" SET "merge_status" = 'confirmed' WHERE "merged_into_participant_id" IS NOT NULL AND "merge_status" IS NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "player_curation" ADD CONSTRAINT "player_curation_merge_status_check" CHECK ("merge_status" IS NULL OR "merge_status" IN ('suggested', 'confirmed', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "player_curation" ADD CONSTRAINT "player_curation_merge_has_status_check" CHECK ("merged_into_participant_id" IS NULL OR "merge_status" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
