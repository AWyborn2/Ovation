# Two sizes: Portrait and Story

Asked by Ash on 19 Nov 2026:

- New designs come in two sizes only: **Portrait 4:5 (1080 × 1350)** for the feed and **Story 9:16
  (1080 × 1920)**.
- **Landscape (1.91:1, 1200 × 630) and Square (1:1, 1080 × 1080) are retired for new designs.**
- Existing square or landscape sets and cards must keep opening, downloading and posting exactly as
  they do today. They must not break.

Built in stages, each its own PR to `main` (no integration branch). Each stage is complete and safe
on its own, because `main` is what Ash publishes. This document is the plan only: no code changes.

## What we found

### The sizes already exist, all four of them

- **One size list per layer.** `lib/scorecard/src/kind-templates/document.ts` defines
  `TEMPLATE_SIZES` (square, portrait, story, landscape) and `TEMPLATE_SIZE_ORDER`. The web renderer's
  `SIZES` in `artifacts/cricket-club/src/lib/share-card/types.ts` mirrors it (`CardSize`), and
  `packNativeSize()` in `artifacts/cricket-club/src/lib/pack-render/tokens.ts` gives the pixels.
  Portrait and Story are already first-class: every bundle in `lib/template-bundles/*` and every
  starter designs them.
- **A design is multi-size.** Each layer has a box per size (`geometry`) and an optional `sizes`
  list. A layer with no `sizes` is on **every** size in `TEMPLATE_SIZE_ORDER`, and
  `addLayerToSizes` deletes `sizes` once a layer covers all four. So **`TEMPLATE_SIZE_ORDER` must
  not lose square or landscape**: every stored layer without `sizes` would silently drop off those
  sizes, and the v1 byte-identical test iterates that list. Retiring is about what we _offer_, not
  what we _understand_.
- **Landscape special cases** all serve legacy and stay: `letterboxLandscape()` and the
  no-landscape-format fallback in `lib/pack-render/render.ts` (line 300), `selectFormatHtml()` in
  `lib/pack-render/templates.ts`, `renderLandscapeLetterbox` in `lib/share-card/export.ts`,
  `landscapeSummary()` in `lib/scorecard/src/card-sets.ts` (used by `draft-render.ts` and
  `lib/card-sets/plan.ts`), and the `fmt === "landscape"` branches in every pack template.

### Where each size is offered today

| Surface                       | File                                                                                                                                                                                                           | Offers today                                  | Default   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| Create picker (Studio home)   | `components/studio-home/create-picker.tsx` `CREATE_SIZES`                                                                                                                                                      | Square, Portrait, Story, Landscape            | none      |
| Create wizard, look step      | `components/studio-create/create-wizard.tsx` (uses `CREATE_SIZES`)                                                                                                                                             | all four                                      | square    |
| Create, carousel look step    | `components/studio-create/carousel-flow.tsx` `CAROUSEL_SIZES`                                                                                                                                                  | Square, Portrait, Story                       | square    |
| Make a carousel set (library) | `components/template-library/make-set-dialog.tsx` `SET_SIZES`                                                                                                                                                  | Square, Portrait, Story                       | square    |
| Draft's Make a carousel set   | `components/studio-editor/draft-set-dialog.tsx` (opens the set editor at the draft's size)                                                                                                                     | follows the editor                            | square    |
| Editor Format menu            | `components/studio-editor/editor-shell.tsx` `FORMATS`, used by `EditorTopBar` (`format`, `onFormat`, `formatLabel`) in `pages/admin-template-editor.tsx`                                                       | all four                                      | see below |
| Blank starters                | `components/social-studio/editor-starters.tsx` `STARTER_SIZES`, `kind-templates/placeholder.ts`                                                                                                                | geometry on all four                          |           |
| Look previews                 | `components/social-studio/design-packs-section.tsx` `PACK_PREVIEW_FORMATS`, `template-library/looks-panel.tsx`                                                                                                 | all four                                      | square    |
| Download                      | `components/studio-editor/export/download-menu.tsx`, `download.ts` `PLATFORM_HINT`                                                                                                                             | the size shown in the editor                  |           |
| Club social settings          | `components/admin-social/constants.ts` `SIZE_KEYS`, `settings-card.tsx`; columns `size_square`, `size_portrait`, `size_story` (default on), `size_landscape` (default off, migration 0011)                     | four switches                                 |           |
| Older surfaces                | `pages/admin-social-create.tsx` `SIZE_OPTIONS`, `components/share-card-modal/index.tsx`, `components/social-sets/use-set-editor.ts` (`card_sets.platform_size`), `pages/admin-studio-editor.tsx` (pack drafts) | square, portrait, story (+ landscape when on) | mixed     |

### What the server renders, per size

| Path                 | File                                                                           | Size used today                                                                       |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Club's sizes         | `api-server/src/lib/draft-render.ts` `enabledSizes()`                          | square, portrait, story, landscape as switched on; square if none                     |
| Layout check (sweep) | `draft-render.ts` `checkDraftLayout()`                                         | every enabled size                                                                    |
| Meta feed post       | `lib/publishing/prepare-media.ts` `prepareMedia()`                             | portrait when the club has portrait on, else square. **Landscape is never published** |
| Meta Story           | `prepareMedia()`                                                               | story, no caption                                                                     |
| Auto-post            | `lib/posting-slots.ts` (line 149), `lib/publishing/auto-publish.ts` (line 102) | feed only (`postTypes: ["feed"]`)                                                     |
| Post pack            | `routes/post-pack.ts`                                                          | a queued carousel's own `size`, else every enabled size                               |
| Email outbox         | `lib/email-outbox.ts` `renderCardPngs()`                                       | the first enabled size                                                                |

### Format is not saved (Round 7)

Confirmed in the code:

- **Single drafts:** the size lives only in the URL. `useStartDesign()` in `create-picker.tsx`
  navigates to `/admin/social/editor/:id?format=<size>`, and `admin-draft-design-editor.tsx`
  (line 76) reads `?format=` with a fallback to square. Every other way in drops it:
  `draft-drawer.tsx` (lines 186, 261, 292), `open-in-editor.tsx`, `editor-starters.tsx` and Studio
  home's Continue designing all open `/admin/social/editor/:id` with no size, so a Story design
  reopens at Square. Changing Format in the editor (`setFormat` in `admin-template-editor.tsx`
  line 1086) is local state only. `social_drafts` has no size column, and the revisions table
  (`social_draft_revisions`) has none either.
- **Club templates:** `admin-template-editor.tsx` (line 340) reads `?size=` (portrait, story or
  landscape), else square. Nothing is stored, but a template's sizes can be read from its document
  (`documentCoverage()` in `api-server/src/lib/template-library/coverage.ts`).
- **Queued carousels:** saved. `cardInput.weekendCarousel.size` (`QueuedCarousel.size`,
  `lib/scorecard/src/queued-carousel.ts`) is written by `saveDraftSetDesign()` in
  `api-server/src/lib/template-library/set-design.ts` (line 347) when the set editor's
  `slidesMode.onSize` fires.
- **Page sets (a card made into pages):** not saved. `DraftSetDesign.size` is null for them
  (openapi `DraftSetDesign.size`), and `admin-set-draft-editor.tsx` (line 172) starts at square.

The size matters beyond reopening: edits in the editor move a layer's box **on the size shown**, so
a card edited at Story and then posted to the feed goes out at portrait with the portrait boxes it
had before. Today that is hidden because nothing remembers which size the admin worked on.

### Templates must cover every size today (KTD15)

- `emptySizes()` (`document.ts`) and `validateDocument()` in `api-server/src/lib/kind-templates.ts`
  (line 140) refuse to save a template with an empty size: "Add at least one element to every size".
  The editor warns the same way (`template-ops.ts` line 261). A new Portrait and Story design could
  not be saved today.
- `documentCoverage()` lists the sizes every page designs; the Create picker filters templates on
  it (`create-picker.tsx` line 168) and the library shows it (`library-browser.tsx`).

### Bundle fit check

- `scripts/src/check-template-bundles.ts` and `check-template-bundles-core.ts` fit-check every
  listed bundle in CI (`.github/workflows/ci.yml`, job `template-bundles`), on every page × size ×
  preset × photo × sponsor variant from `fitMatrix()` (`kind-templates/fit-matrix.ts`).
- The sizes come from `pageSizes()`: the sizes a page has layers on. So a look with no square or
  landscape layers is already not checked there. Every current bundle covers all four.
- `check-template-bundles.known-failures.json` lists 10 templates (ladder, premiership,
  roundFixtures, weekendWrap starters). It is per template, not per size.

### Meta publishing

- `lib/publishing/destination.ts`: `PostType = "feed" | "story"`. `meta-adapter.ts` sends Instagram
  feed images as single containers or a `CAROUSEL`, Instagram Stories as `media_type: "STORIES"`,
  and Facebook photos unpublished first, then a feed post or Page story.
- `prepare-media.ts` already sends 1080 × 1350 JPEGs for the feed at most clubs (portrait defaults
  on) and 1080 × 1920 for Stories. Square is sent only where a club switched portrait off.
- **Assumptions (no new web research):** Instagram feed takes images from 4:5 to 1.91:1, so 4:5 is
  its tallest feed shape; an Instagram carousel crops every image to the first one's shape (ours are
  all one size); Facebook feed takes 4:5; Stories on both take 9:16. `docs/runbooks/meta-publishing.md`
  says nothing about sizes and only needs a line.
- So **Meta publishing needs almost no change.** The risk is the other way: a new design with no
  square boxes, at a club with portrait switched off, would post a blank square. Stage 1 closes that.

## The approach

Two lists, kept apart:

- **Understood sizes** (`TEMPLATE_SIZE_ORDER`, `SIZES`): all four, unchanged. Everything stored keeps
  rendering, downloading and posting the way it does now.
- **Offered sizes** (new, `OFFERED_SIZES = ["portrait", "story"]` in `kind-templates/document.ts`):
  what Create, the Format menu, set dialogs, starters and previews show for a new design. A design
  that already has square or landscape layers also offers those, labelled "Square (older size)" and
  "Landscape (older size)", so legacy cards stay fully editable.

A design's sizes are read from its document (`sizesWithLayers` / `documentCoverage`), never guessed.
A pack-based draft (before the template library) is treated as covering all four.

## Stages

| Stage                                                                          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Done means                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Safe rendering for designs that lack a size** (server only, no UI change) | New `draftSizes(draft, settings)` in `draft-render.ts`: the club's enabled sizes **narrowed to the sizes the draft's design covers**, never empty. Feed size: portrait when the design covers portrait and either the club has portrait on or the design has no square; otherwise square (today's rule, unchanged for every stored design, because they all cover all four). Used by `checkDraftLayout`, `prepareMedia`, `post-pack.ts` and `email-outbox.ts`. A Story on a design without story boxes is refused with a clear message                                                                                       | A portrait-and-story design never renders a blank square or landscape anywhere. Every existing draft renders at exactly the sizes it does today (tests pin it)     |
| **2. Save the size** (migration 0081)                                          | `social_drafts.design_size` (null = older draft). Set on create (`CreateSocialDraftRequest.designSize`), saved when Format changes in the editor (`PATCH /social-drafts/:id` top-level `designSize`, not inside `adjustments`, so the Zod strip in #515 can't drop it), recorded on revisions and restored with them. Page sets save it the same way; queued carousels keep `weekendCarousel.size`. The editor opens at: URL `?format=` if given, else `design_size`, else the carousel's size, else **square** (today's default, so older drafts open as they do now). The queue and Continue designing show the saved size | Pick Story at Create, leave, reopen from the queue: it opens at Story. An older draft opens at Square, as now                                                      |
| **3. Offer Portrait and Story only** (web only)                                | `CREATE_SIZES`, `CAROUSEL_SIZES`, `SET_SIZES`, `FORMATS`, `PACK_PREVIEW_FORMATS`, `SIZE_OPTIONS` become Portrait and Story, default **Portrait**. The Format menu adds an older size only when the design has layers on it, labelled "(older size)". Blank starters and placeholders get portrait and story boxes only (with `sizes` set, so they don't fall back to all four). "Add to the other sizes" (`template-ops.ts` line 56) adds to the design's own sizes, not all four. Download keeps offering whatever the editor shows. `PLATFORM_HINT` for square and landscape reads "Older size"                            | A new design can't be started, or grown, at Square or Landscape. A landscape draft from October still opens, edits and downloads at Landscape from its Format menu |
| **4. Templates and the library**                                               | KTD15 relaxed: a document must have layers on **portrait and story**, and on any older size **its previous version covered** (so an existing four-size template keeps its strictness). New club copies and console designs need only portrait and story. `documentCoverage` unchanged. Create picker keeps filtering by size, so four-size templates still appear under Portrait and Story. Library chips show older sizes as "older"                                                                                                                                                                                        | A Portrait and Story template saves, lists and drafts. Editing an existing four-size template still can't empty its square or landscape by accident                |
| **5. Bundle fit check**                                                        | `look.json` gets an optional `sizes` (new looks: `["portrait", "story"]`). `check-template-bundles-core.ts` adds two pure checks: a look with `sizes` must cover exactly those on every page (no square or landscape layers); a look without it (every current look) must still cover all four. `fitMatrix` already checks only covered sizes, so new looks skip retired sizes and existing looks keep their full check, retired sizes included. Known-failures file unchanged                                                                                                                                               | CI fails if a new look draws square or landscape, or if an existing look loses one. Existing looks are still fit-checked at all four sizes                         |
| **6. Club settings**                                                           | Settings card shows Portrait and Story switches. Square and Landscape switches show only while a club has them on, labelled "Older size: kept for your existing cards". No club's stored switches change (see D3). Runbook gets a short "Sizes" section                                                                                                                                                                                                                                                                                                                                                                      | Settings can't switch an older size back on once it's off; nothing a club has on today changes                                                                     |

Stages 1 and 2 go first, in that order: 1 makes every later stage safe, 2 fixes the Round 7 bug
whatever Ash decides about the rest. Stage 3 needs 2 (so a new design's size sticks). Stages 4 and 5
are independent of each other and need 3. Stage 6 can go any time after 1.

## What happens to existing work, per size

"Unchanged" means the same behaviour and, where `v1-byte-identical.test.ts` pins it, the same HTML.

| Stored design                               | Open                                                                   | Edit                                     | Download              | Post (feed)                            | Post (Story) | Auto-post        | Revisions                             |
| ------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | --------------------- | -------------------------------------- | ------------ | ---------------- | ------------------------------------- |
| Square draft (any age)                      | At Square as now (null size); Format menu offers Square "(older size)" | Unchanged, at every size it covers       | Unchanged             | Unchanged: portrait if on, else square | Unchanged    | Unchanged        | Unchanged; size null restores as null |
| Landscape draft                             | At Square as now unless `?format=landscape`; Landscape in Format menu  | Unchanged                                | Unchanged, 1200 × 630 | Unchanged (landscape is never posted)  | Unchanged    | Unchanged        | Unchanged                             |
| Portrait draft (made before Stage 2)        | At Square as now (nothing was saved); Portrait one click away          | Unchanged                                | Unchanged             | Unchanged                              | Unchanged    | Unchanged        | Unchanged                             |
| Story draft (made before Stage 2)           | As above                                                               | Unchanged                                | Unchanged             | Unchanged                              | Unchanged    | Unchanged        | Unchanged                             |
| Queued carousel, square or landscape `size` | At its saved size, as now                                              | Unchanged; older size in Format menu     | Unchanged             | Unchanged                              | Unchanged    | Unchanged        | Unchanged                             |
| Four-size club template                     | At Square as now                                                       | Unchanged; can't empty a size it covered | n/a                   | Drafts from it: unchanged              | Unchanged    | Unchanged        | Template versions unchanged           |
| Pack-based draft (old editor)               | `admin-studio-editor.tsx`, unchanged                                   | Unchanged                                | Unchanged             | Unchanged                              | Unchanged    | Unchanged        | Unchanged                             |
| **New** design (after Stage 3)              | At its saved Portrait or Story                                         | Portrait and Story only                  | Portrait or Story     | Portrait, always                       | Story        | Feed at portrait | Size saved and restored               |

The byte-identical fixture (`pack-render/__fixtures__/v1-render-hashes.json`) must not be refreshed
by any stage. A PR that needs `UPDATE_V1_RENDER_HASHES=1` has changed legacy output and is wrong.

## Decisions for Ash

- **D1, proposed:** New designs cover both Portrait and Story; Format switches between them. Feed
  posts always use Portrait, Stories always use Story, whatever the saved size. (Instagram's feed
  can't take 9:16, so a Story design can't post to the feed at its own size.)
- **D2, proposed:** The saved size picks where the editor opens, the queue thumbnail, and which post
  type the Schedule panel ticks first (a Story design ticks Story). It doesn't change what renders.
- **D3, proposed:** Don't change any club's stored size switches. Clubs with Square on keep getting
  square layout checks and post packs for their older designs. Only the default for **new** clubs
  changes: `size_square` defaults to off (SQL below), so a new club posts portrait from day one.
- **D4, proposed:** Keep all landscape code (letterbox, `landscapeSummary`, pack branches) while any
  landscape draft, carousel or club switch exists. Removing it is a later, separate cleanup, only
  after the read-only counts below reach zero.
- **D5, proposed:** Older drafts get no backfill: their size was never stored, so any guess could
  open a card at a size the admin didn't use. They open at Square, as now.

## Migration

**0081_draft_design_size.sql** (Stage 2). Additive only, safe to run while live. Apply **before**
republishing Stage 2: Drizzle selects every column, so the new code fails on a database without them.

```sql
-- Portrait and Story sizes (plan 2026-11-19): remember the size a draft was
-- designed at. Null = a draft from before this change; it opens at Square as
-- before. Additive only:
--   social_drafts.design_size           text, null: square | portrait | story | landscape
--   social_draft_revisions.design_size  text, null: the size, restored with the revision
-- Apply BEFORE republishing: the new code selects these columns.
--
-- Idempotent (production was push-built and baselined at 0000).

ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "design_size" text;--> statement-breakpoint
ALTER TABLE "social_draft_revisions" ADD COLUMN IF NOT EXISTS "design_size" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_drafts_design_size_check') THEN
    ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_design_size_check"
      CHECK ("design_size" IS NULL OR "design_size" IN ('square', 'portrait', 'story', 'landscape'));
  END IF;
END $$;
```

The check allows the older sizes on purpose: the server refuses a **new** square or landscape value
in code (only a draft that already covers that size may save it), so a legacy draft can still save
"Landscape" when an admin edits it there.

**0082_new_clubs_portrait_feed.sql** (Stage 6, only if Ash agrees D3). Changes the default for rows
inserted later; no existing row changes. Safe while live, and safe to run twice.

```sql
-- New clubs start without the retired Square size (plan 2026-11-19, D3).
-- Existing clubs' switches are untouched.
ALTER TABLE "social_settings" ALTER COLUMN "size_square" SET DEFAULT false;
```

Drizzle: `sizeSquare` default in `lib/db/src/schema/social_cards.ts` follows, plus `_journal.json`
and snapshots, as with 0080.

**Backfill: none needed** (D5). Queued carousels already hold their size.

**Read-only counts for Ash** (Production SQL runner, any time; they decide D4's cleanup later):

```sql
select card_input->'weekendCarousel'->>'size' as size, count(*)
  from social_drafts
 where card_input ? 'weekendCarousel' and status not in ('posted', 'dismissed')
 group by 1;
select count(*) filter (where size_landscape) as landscape_on,
       count(*) filter (where size_square)    as square_on,
       count(*) filter (where not size_portrait) as portrait_off
  from social_settings;
```

## Test plan

- **Legacy pinned:** `v1-byte-identical.test.ts` passes with its fixture untouched, every stage.
  `landscape.test.ts`, `skeleton-contract.ts` and the pack template tests keep landscape passing.
- **Stage 1:** `draft-render` unit tests for `draftSizes`: a four-size design returns exactly
  today's sizes for every combination of the four switches; a portrait-and-story design never
  returns square or landscape. `prepare-media.test.ts`: the existing "portrait" and "falls back to
  square when portrait is off" cases unchanged; new: a portrait-and-story design at a portrait-off
  club posts a 1080 × 1350 JPEG; Story is 1080 × 1920. Layout check stores no warnings for sizes the
  design lacks, so automation isn't blocked by a blank size.
- **Stage 2:** API tests: create with `designSize`, PATCH it, a revision records and restores it,
  a new draft can't save square or landscape, a landscape draft can. Web tests: the editor opens at
  `?format`, then `designSize`, then the carousel size, then square; reopening from the queue keeps
  Story (the Round 7 case). `admin-social-studio.test.tsx` landscape URL case moves to a legacy test.
- **Stage 3:** Create, wizard, carousel flow and make-set tests offer Portrait and Story, Portrait
  first. Format menu: a four-size design lists the older sizes as "(older size)"; a new design
  doesn't. Starters and "add to the other sizes" put boxes on portrait and story only.
- **Stage 4:** `validateDocument` accepts portrait and story only; refuses a four-size template
  whose edit empties square; coverage tests for both shapes.
- **Stage 5:** `check-template-bundles-core.test.ts`: a `sizes` look with a square layer fails; a
  look without `sizes` that loses landscape fails; current bundles all pass. One full CI run of the
  `template-bundles` job on `main`.
- **Manual retest for Ash** (dev, then production after each publish): start a Portrait card and a
  Story card from Create, reopen both from the queue, download both, post one of each to the test
  Page and Instagram (feed and Story). Open an October landscape draft and a square carousel: they
  open, download and post as before.

## Open questions for Ash

1. **D3:** Leave every club's Square switch as it is (proposed), or switch Square off for all clubs
   now? Off means older square cards post at portrait, which they can, but it changes their output.
2. **D1:** Is "every new design is both Portrait and Story" right, or should a new design be one
   size only (Portrait **or** Story), with the other size added on request?
3. Should auto-post also post a Story for Story designs? Today it posts feed only.
4. **D4:** Once the counts reach zero, do you want the landscape code removed, or kept for a club
   that later asks for link-preview images?
5. The older surfaces (the old Create page, the share card modal, the Card Sets editor): retire
   their Square option too, or leave them alone until they're removed?
