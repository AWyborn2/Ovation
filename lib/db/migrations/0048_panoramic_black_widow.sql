-- Club stock photos for junior weekend-carousel cards (junior_stock flag on club_photos).
-- Idempotent: ADD COLUMN IF NOT EXISTS, so it is safe to re-run and to paste into the
-- Production SQL runner before republishing.
ALTER TABLE "club_photos" ADD COLUMN IF NOT EXISTS "junior_stock" boolean DEFAULT false NOT NULL;
