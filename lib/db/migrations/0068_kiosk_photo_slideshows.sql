-- Honours kiosk photo slideshows (kiosk redesign D1,
-- .10x/decisions/architect/kiosk-photo-rotation.md section B).
-- Additive only:
--   honour_display_settings.kiosk_photo_slideshows   photo slideshows placed in the rotation
--                                                    as "photos:<id>" (library, source,
--                                                    order, photos per pass, seconds per
--                                                    photo, captions); the server resolves
--                                                    their photos for the TV
-- '[]' everywhere on deploy: no club has a slideshow until it adds one.
-- Apply BEFORE republishing: the new code selects this column.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "honour_display_settings" ADD COLUMN IF NOT EXISTS "kiosk_photo_slideshows" jsonb DEFAULT '[]'::jsonb NOT NULL;
