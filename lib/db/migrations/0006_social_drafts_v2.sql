-- Social Studio automation (U1): draft model v2 and revision history.
-- EXPAND step of an expand-then-contract status rename: the status check now
-- accepts both the legacy values ('pending', 'approved') and the new ones
-- ('awaiting_review', 'ready'), so the build running before this change keeps
-- working after the migration and before the new build is published. A later
-- contract migration rewrites the legacy values and narrows the check.
-- Idempotent for the same reason as 0002-0004: production is baselined at
-- 0000, so every statement must be safe on both a fresh database and a pushed
-- one. Apply to production BEFORE publishing any build whose schema includes it.
CREATE TABLE IF NOT EXISTS "social_draft_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"draft_id" integer NOT NULL,
	"card_input" jsonb NOT NULL,
	"caption" text,
	"photo_url" text,
	"photo_source" text,
	"adjustments" jsonb,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_draft_revisions_reason_check" CHECK ("reason" IN ('refresh', 'edit', 'revert'))
);
--> statement-breakpoint
ALTER TABLE "social_drafts" DROP CONSTRAINT IF EXISTS "social_drafts_status_check";--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "family" text;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "source_key" text;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "source_imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "auto_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "pack_id" text;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "caption" text;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "photo_url" text;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "photo_source" text;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "adjustments" jsonb;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "stale_since" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "social_draft_revisions" ADD CONSTRAINT "social_draft_revisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "social_draft_revisions" ADD CONSTRAINT "social_draft_revisions_draft_id_social_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."social_drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_draft_revisions_draft_idx" ON "social_draft_revisions" USING btree ("draft_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_drafts_source_key_dedupe" ON "social_drafts" USING btree ("tenant_id","source_key") WHERE source_key IS NOT NULL AND status != 'dismissed';--> statement-breakpoint
ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_status_check" CHECK ("status" IN ('pending', 'approved', 'awaiting_review', 'ready', 'dismissed', 'posted'));
