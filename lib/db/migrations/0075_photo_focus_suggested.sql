-- Photo focus areas follow-up: a focus box suggested from the faces found on upload.
-- Additive only:
--   club_photos.focus_suggested / junior_photos.focus_suggested
--       true = the focus box came from face suggestions on upload and no admin has saved
--       it yet. Cards crop to it; the library's "Needs focus" filter still lists the photo.
-- Defaults to false, so every existing box keeps counting as set by an admin.
-- Apply BEFORE republishing: the new code selects these columns.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "junior_photos" ADD COLUMN IF NOT EXISTS "focus_suggested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "club_photos" ADD COLUMN IF NOT EXISTS "focus_suggested" boolean DEFAULT false NOT NULL;
