# Every card element editable, and a shared element library

Asked by Ash on 22 Oct 2026: "every single element that is on every single card [should] be an
element or graphic that can be used in the editor." Ash chose all three of the following:

- **Everything editable:** on any card opened in the editor, every piece can be selected, moved,
  resized, recoloured and deleted.
- **An element library:** every graphic from all ten looks (seven converted looks and three
  starters) can be inserted from the Elements panel.
- **Public club elements:** a club can save layers as an element, and it then becomes public,
  available to every club.

It ships in the same release as the template library. It's built on the integration branch
`wyborn21/social-template-library-pm` and lands with #411. Nothing goes to `main` until Ash has
tested it and merges #411.

## What the audit found (22 Oct 2026)

- **The Elements panel is hard-coded.** It has 5 basic shapes plus 29 `ck.*` Club Kit pieces
  (`lib/studio-elements/registry.ts:180-650`), rendered as v1 HTML. Each one inserts as a single
  `kind:"element"` box that can't be taken apart.
- **Converted looks keep everything as layers.** There are no locked, hidden or rasterised
  layers, and every image is a `{{token}}`. These gaps block editing:
  1. Group and stack children can't be selected on the canvas (`canvas.tsx:139`). The Layers
     drawer has no icon for `vector` or `group` (`layers-drawer.tsx:22-32`), which is a likely
     crash.
  2. Row backdrops and cells (badges, highlights) can only be reached through the rows panel
     (`map.ts:1618-1690`).
  3. There's no UI for radial or multi-stop gradients, `clip` polygons (555 in Club Kit, 60 in
     Bold Type), `overlay`, or glows and shadows (`layer-design-panel.tsx:214-226`).
  4. Vectors are opaque SVG blobs; only their colours can be swapped. Gold Foil's stripes are
     84 whole-card SVGs, and Broadcast's slashes are polygon SVGs.
  5. About half of all decorations are duplicated per size (Club Kit 887 of 1,820 layers), so
     editing one size leaves its copies on the other sizes unchanged.
  6. The converter loses some styles: dashed borders become solid, outlined text becomes a
     faint fill, skew is drawn as a polygon, `backdrop-filter: blur` and drop-shadow glows
     are dropped (in Neon Night and Sunset's reports).
- **There's nowhere to store a reusable element.** Migration 0059 has no element table, the
  format has no symbol or definition concept, and library assets are uuid files only. The
  converter does compute signatures that can identify duplicate pieces (`vector:${hash}`,
  `shape:edge:…`), but they aren't saved.

## Streams (one PR at a time each, all targeting the integration branch)

| Stream                      | Slices, in order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owns                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **A. Editor reach**         | A1: Layers drawer supports `vector` and `group`, with a fallback icon (P0, ship first). A2: drill-in selection on the canvas (double-click into a group or stack; Esc goes up) and a nested Layers tree. A3: row cells and backdrops as selectable sub-layers, where editing one row edits the row template. A4: multi-select and group transform work on nested layers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `components/studio-editor/canvas.tsx`, `layers-drawer.tsx`, `template-ops.ts`, `document.ts`                                |
| **B. Style controls**       | B1: gradient editor for linear or radial fills, any number of stops, and angle. B2: polygon clip editor (drag points, presets for slash, chevron and band). B3: shadow and glow controls (box and text shadow, several of each). B4: format and renderer support for what the converter drops: dashed or dotted borders, text stroke, skew transform, backdrop blur and drop-shadow filters. Additive v2 fields, validated in `validate.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `layer-design-panel.tsx`, `pack-render/layer-style.ts`, `kind-templates/format.ts` style fields, `validate.ts` style checks |
| **C. Converter and format** | C1: simple SVGs (rect, polygon, line, circle, single-path) convert to native shapes with `clip`; complex SVGs stay vectors with a colour per path. C2: one decoration across sizes, either a layer with geometry per size or a link id the editor updates together; the converter merges duplicates by signature. C3: `ck.*` element layers in the starters split into native layers. C4: re-run the converter for all seven looks with B4's styles, and re-check the fit for every listed kind                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `scripts/src/lib/pack-convert/*`, `lib/template-bundles/*` (re-generated), format per-size geometry                         |
| **D. Element library**      | D1: migration **0061** `library_elements` (id, slug, name, category, tags, look_id null, origin `bundle`, `club` or `console`, author_tenant_id, document jsonb (a layer fragment), thumbnail asset, listed, unlisted_by, unlist_reason, created_at), plus OpenAPI, codegen and routes (list, search, insert, save, unlist). D2: an extraction script that pulls every distinct decoration from all ten looks, deduplicated by signature, auto-named and categorised (frames, bands and slashes, badges and chips, rules and dividers, glows and textures, crest frames, sponsor strips, data blocks), and writes `lib/template-bundles/elements/*.json` to sync on start. D3: the Elements panel becomes data-driven: tabs by look and category, search, previews in the club's colours, and inserting as native layers (not `kind:"element"`). The 29 `ck.*` entries are replaced by their native versions. D4: "Save as element" on a selection, published publicly. D5: platform console moderation: unlist, report and attribution | migration 0061, Drizzle schema, `template-library` API, `lib/studio-elements/*`, Elements panel                             |

Order and dependencies:

- A1 ships first.
- B4 and C1–C2 change the format. B owns `format.ts` style fields, and C owns per-size geometry and link ids.
- C4 runs after B4.
- D3 needs C1, so elements insert as native shapes. D2 can start on today's bundles and re-run after C4.

## Decisions made for this work

- **E1, public club elements (Ash).** These safeguards are recommended, since the same element is
  shown to every club:
  - Saving strips club-specific content. Image layers become token or slot placeholders (no
    club logo, photo or sponsor art is published). Text becomes sample or token text. Colours
    map to brand tokens (`accent`, `panel`, `ink` and so on) where they match, so the element
    takes on each club's colours.
  - Each element shows its author club. Platform admins can unlist one, and any admin can
    report one.
  - Elements live in the shared `library_elements` table, not a tenant table, which follows
    ADR-011's rule that shared and private data live in different tables.
- **E2, native layers on insert.** Inserting an element copies native layers into the document,
  with no live reference, consistent with ADR-002 and ADR-011's copy rule. Updating an element
  later doesn't change cards already made.
- **E3, migration 0061.** It's the next free number (0058 is on `main`; 0059 and 0060 are on the
  integration branch).

## Done means

On the dev stack, for each of the seven looks and three starters:

- Every visible piece of every card kind can be selected on the canvas or in the Layers tree,
  and moved, resized, recoloured and deleted.
- The Elements panel lists the extracted decorations from every look, and each inserts as
  editable layers in the club's colours.
- A club can save a selection as a public element, and another club sees it.
- Renders of untouched templates are unchanged, apart from the intended fixes. The 318 v1
  hashes stay byte-identical.
- CI is green and the fit check passes for every listed kind.
