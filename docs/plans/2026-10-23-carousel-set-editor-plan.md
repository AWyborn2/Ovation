# Carousel sets as multi-page designs

Asked by Ash on 23 Oct 2026, with a screenshot of the editor on "Broadcast team list round": picking
a template like Team List only lets him edit the cover page, not the next slide. He also wants to
edit and reformat carousel sets, and to start from a single template and build a new carousel set.

It ships in the same release as the template library, on the integration branch
`wyborn21/social-template-library-pm`.

## Why only the cover is editable today

- A template's document holds the pages of **one card kind**. Broadcast Classic's
  `teamListRound` document has a single `card` page, which is the cover.
- A "Round team lists" carousel is put together at build time from separate kinds: the
  `teamListRound` cover, one `teamList` card per side, and sponsors. Each comes from its own
  template.
- Match Day and Match Summary differ: their kinds carry several pages (title, fixture, day,
  sponsors), so the editor already shows a Page picker for them.
- So no single design holds every slide of a set, and the editor opens one template at a time.

## What we're building

### 1. Set templates: one design, every slide

- Add a **set template**: a document whose pages are the set's slides in order. For example:
  - Team lists: cover, then a per-team slide, then sponsors
  - Results: cover, then a per-grade result, then sponsors
  - Match day: title, then a per-fixture slide, day and sponsors
- A page is either:
  - **fixed** (cover or sponsors, shown once), or
  - **repeating** (one slide per item: team, fixture or grade), bound to the same content slots
    the card kinds use, with ADR-010's builders filling them.
- Each look gains a set template per set type, assembled from its existing kind pages: the
  converter's bundles plus the starters. Existing single-kind templates keep working, and a set
  template can be "unpacked" from them.
- Store set templates in the library and as club copies, the same way as kind templates (copy
  rule, versions, fit check per page).

### 2. Multi-page editor

- The editor shows a **page strip** along the bottom, like Canva's multi-page view, with every
  slide of the set. Click a slide to edit it.
- On each page, every element can be edited as before.
- Page actions:
  - add a page: blank, from another template's page, or a repeating item page
  - duplicate a page
  - delete a page
  - drag to reorder pages
- A repeating page shows sample items: three teams, for example. Editing one edits the
  repeating design.
- The set has one size (square, portrait or story), and every page follows it. Changing the
  size checks every page's fit.
- The page picker on single-kind templates (Match Day's) becomes the same page strip, so there's
  one way of working.

### 3. Edit and reformat a carousel set

- Opening a saved carousel set, or a queued set draft, from Carousel sets, the Queue or Continue
  designing loads it in the multi-page editor with its real data. Then you can:
  - edit any slide
  - reorder, add or delete slides
  - swap the whole set to another look or template, keeping the data
  - change the size
- Saving keeps the set's data snapshot (ADR-010's v2/v3 carousel payload) and its design, and
  the queue then shows the edited set.

### 4. Start a new carousel set from a single template

- From any template's detail dialog, or the editor, add a "Make a carousel set" action. Pick
  the set type (team lists, results, match day, match summary or a free set), and the design
  becomes the cover. The other pages come from the same look's matching pages, or from
  duplicates of the design for a free set.
- From Studio home, the Create → Carousel set tile opens this picker: set type, then look or
  template, then size, then the editor.
- A **free set** (no data binding) is a plain multi-page design for one-off posts. It's
  allowed, and it's saved to Your designs.

## Decisions taken (to confirm with Ash)

- **C1:** Set templates are a new document shape (pages with fixed or repeating roles). Kind
  templates stay as they are, and set templates reuse their pages, so nothing existing breaks.
- **C2:** Repeating pages are designed once and filled per item. Per-item overrides, such as
  one team slide that looks different, are out of scope for this release.
- **C3:** Free sets are allowed, but they can't auto-post from the sweep, because they have no
  data binding.
- **C4:** Junior sets keep the same-day consolidation (P3) and the juniors isolation rules.
  Repeating pages bind only junior data for junior sets.
- **C5:** A migration, if needed, takes the next free number on the integration branch
  (**0063** today).

## Done means

On the dev stack, as Halls Head:

1. Open a Team Lists template, see every slide in the page strip, and edit the per-team slide.
2. Open a queued Round Team Lists set, reorder slides, delete the sponsors slide, switch it to
   another look, save, and see the change in the queue.
3. From a single template, make a new carousel set, edit it and save it.
4. Create → Carousel set works from Studio home.

CI is green, the fit check passes for every page of every listed set template, the juniors
isolation tests pass, and browser screenshots are in the PRs.
