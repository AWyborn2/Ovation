-- Read-only: the pages admins added to set drafts (Add page: a blank page, a
-- copy, a page from a template), what is on each, and each page's history in
-- the draft's saved revisions (retest 5, item 5: set 972's "Page 1" read as
-- blank). Changes nothing; safe to run anywhere, any number of times.
--
-- An added page is a fixed design page (slot `page`) of a set draft's design
-- (`social_drafts.adjustments`, a set document) that no live slide maps to as
-- its own layout (`arrangement.pageFor`). For each one it shows:
--   layers_now          how many layers it holds now (0 = blank);
--   at_risk_as_layout   true when it matches the "let-go slide layout" rule
--                       (name ends in "layout", same kind page as a repeating
--                       slot, no live pageFor): opening, saving, Change look
--                       and migration 0079 remove such a page;
--   slide_stored        whether the queued carousel holds its slide (page:<id>);
--   revisions_with_layers / last_revision_with_layers
--                       the saved revisions (every admin save, look switch and
--                       template apply records one) in which this page held
--                       layers, so a blank page that once had content can be
--                       restored from Queue -> the draft -> Revisions.
-- Set :draft_id below to one draft (972), or leave it NULL for every set draft.

WITH params AS (
  SELECT NULL::int AS draft_id   -- e.g. 972
),
sets AS (
  SELECT
    d.id,
    d.tenant_id,
    d.status,
    d.adjustments AS doc,
    d.card_input AS input,
    CASE WHEN jsonb_typeof(d.adjustments -> 'arrangement' -> 'removed') = 'array'
      THEN d.adjustments -> 'arrangement' -> 'removed' ELSE '[]'::jsonb END AS removed,
    CASE WHEN jsonb_typeof(d.adjustments -> 'arrangement' -> 'pageFor') = 'object'
      THEN d.adjustments -> 'arrangement' -> 'pageFor' ELSE '{}'::jsonb END AS page_for
  FROM "social_drafts" d, params
  WHERE jsonb_typeof(d.adjustments) = 'object'
    AND d.adjustments ->> 'formatVersion' = '2'
    AND jsonb_typeof(d.adjustments -> 'set') = 'string'
    AND jsonb_typeof(d.adjustments -> 'pages') = 'array'
    AND (params.draft_id IS NULL OR d.id = params.draft_id)
),
added AS (
  SELECT
    s.id AS draft_id,
    s.tenant_id,
    s.status,
    s.doc ->> 'set' AS set_type,
    p ->> 'id' AS page_id,
    p ->> 'name' AS page_name,
    p ->> 'kind' AS kind,
    p ->> 'page' AS kind_page,
    CASE WHEN jsonb_typeof(p -> 'layers') = 'array' THEN jsonb_array_length(p -> 'layers') ELSE 0 END
      AS layers_now,
    (
      btrim(COALESCE(p ->> 'name', '')) ~* '\slayout$'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.doc -> 'pages') AS r
        WHERE r ->> 'slot' IN ('team', 'fixture', 'result', 'day')
          AND r ->> 'kind' = p ->> 'kind'
          AND r ->> 'page' = p ->> 'page'
      )
    ) AS at_risk_as_layout,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.input -> 'weekendCarousel' -> 'slides') = 'array'
          THEN s.input -> 'weekendCarousel' -> 'slides' ELSE '[]'::jsonb END
      ) AS sl
      WHERE sl ->> 'pageId' = p ->> 'id'
    ) AS slide_stored,
    s.input ? 'weekendCarousel' AS queued_carousel
  FROM sets s
  CROSS JOIN LATERAL jsonb_array_elements(s.doc -> 'pages') AS p
  WHERE p ->> 'slot' = 'page'
    AND p ->> 'role' = 'fixed'
    -- Not a live slide's own layout.
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(s.page_for) AS f
      WHERE f.value = p ->> 'id' AND NOT (s.removed ? f.key)
    )
),
history AS (
  SELECT
    a.draft_id,
    a.page_id,
    count(*) FILTER (WHERE jsonb_array_length(rp -> 'layers') > 0) AS revisions_with_layers,
    max(r.created_at) FILTER (WHERE jsonb_array_length(rp -> 'layers') > 0)
      AS last_revision_with_layers,
    (array_agg(r.id ORDER BY r.created_at DESC, r.id DESC)
      FILTER (WHERE jsonb_array_length(rp -> 'layers') > 0))[1] AS last_revision_id_with_layers
  FROM added a
  JOIN "social_draft_revisions" r ON r.draft_id = a.draft_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r.adjustments -> 'pages') = 'array'
      THEN r.adjustments -> 'pages' ELSE '[]'::jsonb END
  ) AS rp
  WHERE rp ->> 'id' = a.page_id
    AND jsonb_typeof(rp -> 'layers') = 'array'
  GROUP BY a.draft_id, a.page_id
)
SELECT
  a.draft_id,
  a.tenant_id,
  a.status,
  a.set_type,
  a.queued_carousel,
  a.page_id,
  a.page_name,
  a.kind,
  a.kind_page,
  a.layers_now,
  a.at_risk_as_layout,
  a.slide_stored,
  COALESCE(h.revisions_with_layers, 0) AS revisions_with_layers,
  h.last_revision_with_layers,
  h.last_revision_id_with_layers
FROM added a
LEFT JOIN history h ON h.draft_id = a.draft_id AND h.page_id = a.page_id
ORDER BY (a.layers_now = 0 AND COALESCE(h.revisions_with_layers, 0) > 0) DESC,
  a.at_risk_as_layout DESC, a.draft_id, a.page_id;
