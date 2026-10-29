-- Sponsors per slide (Halls Head, Oct 2026): the most sponsors one match day
-- sponsors slide holds before the Weekend Carousel shares them evenly over
-- more slides. A club default; a single design can change it for itself.
-- Additive only:
--   social_settings.sponsors_per_slide  integer, default 12 (the value every
--       club had), kept within 3..16 by the API.
-- Apply BEFORE republishing: the new code selects this column.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS.

ALTER TABLE "social_settings" ADD COLUMN IF NOT EXISTS "sponsors_per_slide" integer DEFAULT 12 NOT NULL;
