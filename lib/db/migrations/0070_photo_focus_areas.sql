-- Photo focus areas (.10x/decisions/product-manager/photo-focus-areas.md).
-- Additive only:
--   club_photos.focus_box / junior_photos.focus_box     the part of the photo that matters
--                                                      (fractions 0–1); null = centred crop
--   club_photos.off_shapes / junior_photos.off_shapes   frame shapes switched off for the photo
--   club_photo_players.area / junior_photo_participants.area
--                                                      where that player is on the photo
--   social_drafts.photo_focus                          the chosen photo's box and size when
--                                                      it was picked; null = centred crop
-- Nothing is set on deploy, so every card renders exactly as before.
-- Apply BEFORE republishing: the new code selects these columns.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "club_photos" ADD COLUMN IF NOT EXISTS "focus_box" jsonb;--> statement-breakpoint
ALTER TABLE "club_photos" ADD COLUMN IF NOT EXISTS "off_shapes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_photos" DROP CONSTRAINT IF EXISTS "club_photos_off_shapes_check";--> statement-breakpoint
ALTER TABLE "club_photos" ADD CONSTRAINT "club_photos_off_shapes_check" CHECK ("off_shapes" <@ ARRAY['tall', 'square', 'wide']::text[]);--> statement-breakpoint
ALTER TABLE "club_photo_players" ADD COLUMN IF NOT EXISTS "area" jsonb;--> statement-breakpoint
ALTER TABLE "junior_photos" ADD COLUMN IF NOT EXISTS "focus_box" jsonb;--> statement-breakpoint
ALTER TABLE "junior_photos" ADD COLUMN IF NOT EXISTS "off_shapes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "junior_photos" DROP CONSTRAINT IF EXISTS "junior_photos_off_shapes_check";--> statement-breakpoint
ALTER TABLE "junior_photos" ADD CONSTRAINT "junior_photos_off_shapes_check" CHECK ("off_shapes" <@ ARRAY['tall', 'square', 'wide']::text[]);--> statement-breakpoint
ALTER TABLE "junior_photo_participants" ADD COLUMN IF NOT EXISTS "area" jsonb;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "photo_focus" jsonb;
