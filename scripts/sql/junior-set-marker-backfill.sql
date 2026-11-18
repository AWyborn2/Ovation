-- Junior set marker backfill (round 3 retest, #7). Data only; no schema change.
-- Safe before or after republishing. Idempotent: a draft already marked is
-- never touched again, so running it twice changes nothing the second time.
--
-- Carousel sets made from junior data (Create -> Juniors) were saved without
-- social_drafts.source_match_is_junior, so the Queue's Teams filter listed
-- them under Seniors with no JUNIOR tag. A set is junior when it has a junior
-- slide and no senior game slide (a senior slide that is not a cover,
-- sponsors or design page), the server's isJuniorCarousel rule.
--
-- A blank "Pick by hand" set carries no junior slide, so nothing here can
-- tell a junior one from a senior one; those keep their current marker.

-- 1. Count first (read only).
SELECT count(*) AS junior_sets_to_mark, array_agg(d.id ORDER BY d.id) AS draft_ids
FROM social_drafts d
WHERE d.source_match_is_junior = false
  AND jsonb_typeof(d.card_input -> 'weekendCarousel' -> 'slides') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(d.card_input -> 'weekendCarousel' -> 'slides') s
    WHERE (s ->> 'junior')::boolean IS TRUE
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(d.card_input -> 'weekendCarousel' -> 'slides') s
    WHERE (s ->> 'junior')::boolean IS NOT TRUE
      AND coalesce(s ->> 'id', '') NOT LIKE 'page:%'
      -- A cover or sponsors slide. Version 3 sets keep these as content, with
      -- no input.carouselPage, so their ids say what they are.
      AND coalesce(s ->> 'id', '') !~ '^(title|sponsors(-[0-9]+)?)$'
      AND coalesce(s -> 'input' -> 'carouselPage' ->> 'page', '') NOT IN ('title', 'sponsors')
  );

-- 2. Mark them.
UPDATE social_drafts d
SET source_match_is_junior = true
WHERE d.source_match_is_junior = false
  AND jsonb_typeof(d.card_input -> 'weekendCarousel' -> 'slides') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(d.card_input -> 'weekendCarousel' -> 'slides') s
    WHERE (s ->> 'junior')::boolean IS TRUE
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(d.card_input -> 'weekendCarousel' -> 'slides') s
    WHERE (s ->> 'junior')::boolean IS NOT TRUE
      AND coalesce(s ->> 'id', '') NOT LIKE 'page:%'
      -- A cover or sponsors slide. Version 3 sets keep these as content, with
      -- no input.carouselPage, so their ids say what they are.
      AND coalesce(s ->> 'id', '') !~ '^(title|sponsors(-[0-9]+)?)$'
      AND coalesce(s -> 'input' -> 'carouselPage' ->> 'page', '') NOT IN ('title', 'sponsors')
  );
