-- Sponsors page options (ADR-010 P6, migration 0055; .10x/decisions/architect/match-day-carousel-content.md).
-- Additive only; the defaults leave every club exactly as today:
--   sponsors.tier                               'major' | 'standard' (default 'standard'); major
--                                               sponsors show larger on the tiered sponsors page
--   social_settings.sponsors_background_photo_id  the library photo behind the sponsors page;
--                                               null = none, cleared when the photo is deleted
-- Apply BEFORE republishing: the new code selects these columns. Idempotent.
ALTER TABLE "sponsors" ADD COLUMN IF NOT EXISTS "tier" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_tier_check" CHECK ("tier" IN ('major', 'standard'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "sponsors_background_photo_id" integer;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "social_settings" ADD CONSTRAINT "social_settings_sponsors_background_photo_id_club_photos_id_fk" FOREIGN KEY ("sponsors_background_photo_id") REFERENCES "public"."club_photos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
