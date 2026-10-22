# Figma import (template library)

The platform console's **Template library → Import from Figma** turns a Figma design into an
unlisted console template (ADR-011 §9, L8). This page covers the token it uses and how a design
file should be set up.

## The token

- `FIGMA_ACCESS_TOKEN` is a **personal access token** from Ovation's Figma designer account, with
  one scope: **File content: read**. It lives in Replit secrets (and the dev stack's `env.local`);
  never commit or print it.
- Personal access tokens expire after **at most 90 days**. When this one expires or is revoked,
  every import fails with: "Figma refused the access token: it has expired or been revoked…". To
  renew:
  1. Figma → Settings → Security → Personal access tokens → **Generate new token**, scope File
     content: read only, the longest expiry offered.
  2. Replace `FIGMA_ACCESS_TOKEN` in Replit secrets (and the dev stack), then restart or republish.
  3. Write the new expiry date below, and set a reminder a week before it.

| Token created | Expires | By  |
| ------------- | ------- | --- |
| _not yet set_ |         |     |

- Without the token the import says it's off; nothing else changes.
- Variables need Figma Enterprise (`file_variables:read`), which this account doesn't have, so
  colours come from **styles** (decision O7).

## Setting up a design file

- **Frames are pages × sizes.** Name each frame `<page>/<size>`: `card/square`, `fixture/story`,
  `title/portrait`, `sponsors/landscape`. A frame sized like a card (1080×1080, 1080×1350,
  1080×1920, 1200×630, or the same shape at any scale) is read by its shape when the name has no
  size. A size with no frame is placed from the nearest one, and the report says so.
- **Text.** `{{tokens}}` in a text layer become live fields (only fields the page has). Fonts
  outside the Google Fonts catalogue get the nearest one, listed in the report.
- **Colours.** Fills and strokes using colour styles named `ovation/accent` (or `ovation/gold`),
  `ovation/panel`, `ovation/panel-2`, `ovation/ink` and `ovation/accent-ink` follow the club's
  colours. Any other colour is kept as it is.
- **Photo and crest.** A layer with an image fill named `{{photo}}` is the card's photo (never on
  junior cards); one named `{{clubLogo}}` is the club's crest. Any other image is copied into the
  library as it looks in Figma.
- **Vectors** (paths, boolean operations, stars, polygons, arcs) come in as SVG. Effects on them
  (drop shadows) are left out; anything the format can't draw is reported.
- **Auto layout** frames inside a page become stacks: blocks close up when a field is empty.
  Nest them at most four deep. The page frame's own auto layout is ignored.
- **Lists.** A frame named `rows:<list>` (`rows:rows` on a ladder, `rows:players`,
  `rows:dayRows`) is a list. Its first child is the row: texts showing one `{{field}}` of the list,
  and image-filled layers named `{{field}}`, become the cells. Leave a gap before the second row
  to set the spacing.
- **Not imported:** masks, clipping, italic, mixed text styles within one layer. The report lists
  each one with its layer.

The result is unlisted. Open it from the report, polish it in the editor, and list it once its
layout check has passed.
