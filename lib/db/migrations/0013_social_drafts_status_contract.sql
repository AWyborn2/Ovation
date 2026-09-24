UPDATE "social_drafts" SET "status" = 'awaiting_review' WHERE "status" = 'pending';--> statement-breakpoint
UPDATE "social_drafts" SET "status" = 'ready' WHERE "status" = 'approved';--> statement-breakpoint
ALTER TABLE "social_drafts" DROP CONSTRAINT IF EXISTS "social_drafts_status_check";--> statement-breakpoint
ALTER TABLE "social_drafts" ALTER COLUMN "status" SET DEFAULT 'awaiting_review';--> statement-breakpoint
ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_status_check" CHECK ("status" IN ('awaiting_review', 'ready', 'dismissed', 'posted'));
