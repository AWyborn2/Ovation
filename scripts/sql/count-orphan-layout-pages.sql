-- Read-only: how many set drafts migration 0079_orphan_layout_pages.sql would
-- change (orphaned slide layout pages, and stored carousel slides made for a
-- page that draws no slide of its own), and which. Changes nothing.
-- Run before and after the migration: after it, both counts are 0.

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
SELECT
  count(*) AS drafts_affected,
  coalesce(sum(cardinality(o.ids)), 0) AS orphan_pages,
  coalesce(string_agg(f.id::text, ', ' ORDER BY f.id), '') AS draft_ids
FROM fixed f
JOIN "social_drafts" d ON d.id = f.id
LEFT JOIN orphans o ON o.id = f.id
WHERE d.adjustments IS DISTINCT FROM f.doc OR d.card_input IS DISTINCT FROM f.input;
