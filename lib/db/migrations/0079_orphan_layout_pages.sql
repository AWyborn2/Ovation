-- Orphaned slide layouts in set drafts (New Studio dev retest 3, item 4; draft 962).
--
-- A slide's own layout (studio-create S9: "New layout for this slide", "Edit
-- this slide") is a design page in the set draft's design
-- (`social_drafts.adjustments`, a set document) that `arrangement.pageFor`
-- maps to that slide. Before the 17 Nov 2026 fixes (#637, #645), saving or
-- deleting a slide let go of `pageFor` but kept the page, and a queued
-- carousel's save stored a design slide for it (`card_input.weekendCarousel.
-- slides`, id `page:<page id>`), so "A Grade v Waroona layout" posted as a
-- blank extra slide after Sponsors.
--
-- This removes, in every set draft:
-- 1. each orphaned layout page: a fixed design page (slot `page`) named as a
--    slide's layout ("... layout"), drawing the same kind page as one of the
--    set's repeating slots, that no live `pageFor` entry names (an entry of a
--    deleted slide, in `arrangement.removed`, is not live), and every
--    `pageFor` entry naming a page removed here. A page the admin added (Blank
--    page "Page 3", a copy) is named otherwise and stays. Nothing is removed
--    from a set whose every page would go.
-- 2. each stored carousel slide made for a design page (`page:<id>`) that
--    draws no slide of its own: one whose page the design no longer holds, or
--    a layout page `pageFor` names. A carousel is never left without slides.
--
-- The same rule as `withoutStrandedLayouts` and `isOrphanPageSlide`
-- (lib/scorecard/src/kind-templates/set-document.ts), which already hide these
-- on open and drop them on save; this cleans drafts nobody opens again.
-- Data only; no schema change. Safe before or after republishing.
--
-- Idempotent: a second run finds nothing to remove and updates no row.
-- Count the drafts it changes first with scripts/sql/count-orphan-layout-pages.sql.

WITH sets AS (
  SELECT
    d.id,
    d.adjustments AS doc,
    d.card_input AS input,
    CASE WHEN jsonb_typeof(d.adjustments -> 'arrangement' -> 'removed') = 'array'
      THEN d.adjustments -> 'arrangement' -> 'removed' ELSE '[]'::jsonb END AS removed,
    CASE WHEN jsonb_typeof(d.adjustments -> 'arrangement' -> 'pageFor') = 'object'
      THEN d.adjustments -> 'arrangement' -> 'pageFor' ELSE '{}'::jsonb END AS page_for
  FROM "social_drafts" d
  WHERE jsonb_typeof(d.adjustments) = 'object'
    AND d.adjustments ->> 'formatVersion' = '2'
    AND jsonb_typeof(d.adjustments -> 'set') = 'string'
    AND jsonb_typeof(d.adjustments -> 'pages') = 'array'
),
orphans AS (
  SELECT s.id, array_agg(p ->> 'id') AS ids, count(*) AS n
  FROM sets s
  CROSS JOIN LATERAL jsonb_array_elements(s.doc -> 'pages') AS p
  WHERE p ->> 'slot' = 'page'
    AND p ->> 'role' = 'fixed'
    AND btrim(COALESCE(p ->> 'name', '')) ~* '\slayout$'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(s.doc -> 'pages') AS r
      WHERE r ->> 'slot' IN ('team', 'fixture', 'result', 'day')
        AND r ->> 'kind' = p ->> 'kind'
        AND r ->> 'page' = p ->> 'page'
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(s.page_for) AS f
      WHERE f.value = p ->> 'id' AND NOT (s.removed ? f.key)
    )
  GROUP BY s.id
),
shed AS (
  SELECT
    s.id,
    s.input,
    CASE
      WHEN o.id IS NULL OR o.n >= jsonb_array_length(s.doc -> 'pages') THEN s.doc
      ELSE (
        WITH kept AS (
          SELECT jsonb_agg(p ORDER BY i) AS pages
          FROM jsonb_array_elements(s.doc -> 'pages') WITH ORDINALITY AS x (p, i)
          WHERE NOT (p ->> 'id' = ANY (o.ids))
        ),
        page_for AS (
          SELECT COALESCE(jsonb_object_agg(f.key, f.value), '{}'::jsonb) AS map
          FROM jsonb_each(s.page_for) AS f
          WHERE NOT (f.value #>> '{}' = ANY (o.ids))
        )
        SELECT CASE
          WHEN s.doc -> 'arrangement' -> 'pageFor' IS NULL
            THEN jsonb_set(s.doc, '{pages}', kept.pages)
          WHEN page_for.map = '{}'::jsonb
            THEN jsonb_set(s.doc, '{pages}', kept.pages) #- '{arrangement,pageFor}'
          ELSE jsonb_set(jsonb_set(s.doc, '{pages}', kept.pages), '{arrangement,pageFor}', page_for.map)
        END
        FROM kept, page_for
      )
    END AS doc
  FROM sets s
  LEFT JOIN orphans o ON o.id = s.id
),
fixed AS (
  SELECT
    sh.id,
    sh.doc,
    CASE
      WHEN jsonb_typeof(sh.input -> 'weekendCarousel' -> 'slides') IS DISTINCT FROM 'array' THEN sh.input
      ELSE (
        WITH pages AS (
          SELECT array_agg(p ->> 'id') AS ids FROM jsonb_array_elements(sh.doc -> 'pages') AS p
        ),
        layouts AS (
          SELECT COALESCE(array_agg(f.value), '{}') AS ids
          FROM jsonb_each_text(
            CASE WHEN jsonb_typeof(sh.doc -> 'arrangement' -> 'pageFor') = 'object'
              THEN sh.doc -> 'arrangement' -> 'pageFor' ELSE '{}'::jsonb END
          ) AS f
        ),
        kept AS (
          SELECT jsonb_agg(sl ORDER BY i) AS slides
          FROM jsonb_array_elements(sh.input -> 'weekendCarousel' -> 'slides')
            WITH ORDINALITY AS x (sl, i), pages, layouts
          WHERE NOT COALESCE(
            jsonb_typeof(sl -> 'pageId') = 'string'
            AND sl ->> 'id' = 'page:' || (sl ->> 'pageId')
            AND (
              NOT (sl ->> 'pageId' = ANY (COALESCE(pages.ids, '{}')))
              OR sl ->> 'pageId' = ANY (layouts.ids)
            ),
            false
          )
        )
        SELECT CASE
          WHEN kept.slides IS NULL THEN sh.input
          ELSE jsonb_set(sh.input, '{weekendCarousel,slides}', kept.slides)
        END
        FROM kept
      )
    END AS input
  FROM shed sh
)
UPDATE "social_drafts" d
SET "adjustments" = f.doc,
    "card_input" = f.input
FROM fixed f
WHERE d.id = f.id
  AND (d.adjustments IS DISTINCT FROM f.doc OR d.card_input IS DISTINCT FROM f.input);
