# A full editor for drafts

Asked by Ash on 26 Oct 2026, with screenshots of the draft editor (`/admin/social/editor/:id`, which
Studio home's Create and Continue designing open):

- Every part of a card should be a layer he can place, move, resize, delete and restyle (fonts and
  everything else), the way a full editor allows.
- A blank design offers only a few live stats, and there's no way to add a page to build a carousel
  set.
- He wants to add any live data field, and choose what shows. For a result: both teams' scores, then
  performances, showing all of them, one, or only the best Halls Head performances and not the
  opposition's.

Ash's call on 26 Oct 2026: build it in stages, each its own PR to `main`, with no integration branch.
Each stage is complete and safe on its own, because `main` is what Ash publishes.

## What we found

- **Two editors.** The template editor (`admin-template-editor.tsx`) got everything from the
  editable-elements and carousel-set work: step into groups, nested selection, the Layers tree,
  pages and the layout check. The draft editor (`admin-studio-editor.tsx`) got none of it.
  - It draws the template's own design but can't select its parts in a page-based (format v2)
    design.
  - The layers it adds to a v2 design go to the document's root, which v2 never draws.
  - It has no pages.
- **Saving a templated draft wiped its design.** `PATCH /social-drafts/:id` parsed `adjustments`
  with a schema listing only the first editor's keys, and Zod dropped `formatVersion` and `pages`.
  Fixed in #515. Production had no affected drafts (Replit agent, read-only check, 26 Oct 2026).
- **Inserted elements doubled their pieces** ("48 48"): inserting dropped each layer's `sizes`.
  Fixed in #513.
- **Live fields:** both editors' field lists read `kindFields(kind)`, so the per-page tokens and
  lists in `pageTokens` aren't offered. These include the innings scores and the batting, bowling
  and pairs rows.
- **Lists split onto extra slides by capacity:** `planTemplateSlides` reads only `doc.layers`, so a
  v2 draft's list doesn't split (server and editor).

## Stages

| Stage                    | What                                                                                                                                                                                                                                                                                                                                                                                                                                              | Done means                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. One editor**        | A templated draft (not a carousel set) opens in the template editor's engine, editing its own copy of the design and drawn with its real card (`TemplateEditorV2` `draftMode`). The draft editor's Cricket, Players, Photos, Uploads, Live stats and Brand panels and Download come with it. Layers read by field label, not token. Stray root layers from the old editor move onto the primary page. Older pack-based drafts keep the old editor | Open a draft from Create or Continue designing: every part can be selected on the canvas or in Layers, stepped into, moved, resized, restyled and deleted, and the save keeps the design |
| **2. Pages**             | Add, duplicate, reorder and delete pages in a draft, using the page strip. A single design can become a carousel set; it posts as several slides                                                                                                                                                                                                                                                                                                  | A blank design grows into a three-page carousel and posts as three slides                                                                                                                |
| **3. Every live field**  | The Fields and Live stats panels list `pageTokens` for the card's kind and page: both teams' names, crests, scores, overs, result, margin, venue, competition, round and date. `planTemplateSlides` plans from the document's page, so v2 lists split                                                                                                                                                                                             | Any field the card's data has can be added as a live text box                                                                                                                            |
| **4. Performance lists** | A list layer with settings: whose (club, opposition, both), what (batting, bowling, both), how many (all, top N, best), sort (runs, wickets, figures). One row design repeats                                                                                                                                                                                                                                                                     | "Best Halls Head performances only" is one setting on a result card                                                                                                                      |

## Decisions (gone through with Ash, 26 Oct 2026)

- **D1, agreed:** Editing a draft never changes the library template or the club's copy (ADR-002's
  copy rule). "Save as my template" can come later.
- **D2, agreed:** Pack-based drafts from before the template library keep the old editor until
  they're gone from the queue.
- **D3, agreed:** The old Content panel (field overrides) isn't carried over. In the full editor,
  text is edited on the layer itself.
- **D4, changed:** Lists give clubs maximum flexibility, not a default.
  - A new performance list starts unfiltered: both teams, every performance, in scorecard order.
  - Adding one asks straight away for whose, how many and sort.
  - There are more ways to sort (runs, balls, strike rate, wickets, economy, figures) and to filter
    (a minimum of runs or wickets).
  - Junior cards keep their privacy rules.
  - **Built (stage 5a):** the Fields panel's add chooser, sorts by balls, strike rate and economy,
    and minimum runs or wickets and "not outs only" filters (`rows-pick.ts`).
- **D5, agreed:** Applying a changed template to waiting drafts skips drafts whose design was
  edited by hand, and says how many it skipped. **Built (stage 5b):** `applyTemplateToDrafts`
  skips drafts with `design_edited_at` set and reports them as `edited`.
- **D6, agreed:** Performances come as two lists, batting and bowling, not one "both" list: one row
  design can't show runs and figures in the same cells.
- **D7, agreed:** A list's "whose" setting appears on performance lists only. Single-innings lists
  are one side's already, so only "how many" and "sort" apply to them.
- **D8, changed:** A performance list's rows that don't fit its box continue on extra slides with
  the same design, as the older lists do. **Built (stage 5a):** `planTemplateSlides` splits a
  performance list's chosen rows by its box, and each slide carries its share (`performanceRows`).
- **D9, changed:** "Make a carousel set" offers the look's matching pages to start the set from
  (cover, per-team, sponsors), as the template library's "Make a carousel set" does, instead of
  only the design and a copy. **Built (stage 5b):** the draft's "Make a carousel set" opens on
  the look its design came from, with the look's cover and sponsors page ticked and its version
  of the card to tick. Every page is a design page of a free set drawing the card's own data
  (`freeSetFromLook`). A card no set draws (a player card) offers the design and a copy.
