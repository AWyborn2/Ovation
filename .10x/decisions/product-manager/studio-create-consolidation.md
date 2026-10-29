# Studio create consolidation

**Status:** Approved by Ash, 29 Oct 2026 (Option A, behind a per-club preview switch). Two P0 additions the same
day (below). Designed and planned 29 Oct 2026.
**Prototypes:** https://claude.ai/artifact/Y6FvEh49DAB7bDa5ny62YN (Option A: One Create flow; Option B: Studio
rebuild). **Next:** build (`decisions/engineering-manager/studio-create-consolidation.md`).

## Problem

A club admin (Halls Head feedback, 29 Oct 2026) has to go to several places to make social assets. Ash agrees
with the club that there are too many options and wants the experience simplified. Today:

- single cards are made in Create a card;
- carousel sets are started from Studio Home's Create row, then edited on a separate Carousel sets page;
- junior cards are made on their own Junior cards page.

Create a card can make a senior team's Team List from a fixture (the published Selection Hub list, else
PlayHQ's), but not a junior team's list, and it can't make a carousel.

## What the club asked for (Ash confirmed all four)

1. Fewer places to go: one place to make any asset.
2. Make carousel sets inside Create, not on a separate page.
3. A single junior team's Team List from Create, prefilled from the Selection Hub or PlayHQ.
4. A simpler, better-looking flow overall.

## Options under review

- **A. One Create flow** (Ash leans this way, for the quickest win). Create replaces Create a card, the Carousel
  sets page and Junior cards' create step. It works in four steps:
  1. What: any card kind, with Seniors / Juniors.
  2. One or many: a single card or a carousel. For a team list, this is one team or the whole round.
  3. Fill from: the team (badged Selection Hub, PlayHQ, Draft or Blank), the round, or a match.
  4. Look and size, then the editor.

  Saved work lives in Your designs and the Queue. The menu drops to Home, Create, Queue, Your designs,
  Templates, Photos and Settings.

- **B. Studio rebuild.** Four places: This week, Make, Queue and Library.
  - "This week" lists the round's assets, already built from fixtures, team lists and results, in lanes:
    before, during and after the game. Each asset is marked Ready, Check, Scheduled, Waiting or Auto.
  - A "Make anything" box with quick picks.
  - A side panel to approve, edit, schedule or dismiss the selected asset.

  This is a bigger change and overlaps the template library work.

## Constraints that hold in either option

- **Juniors isolation.** Junior cards use only junior tables and the `/api/juniors` routes. They are never
  blended with senior data. The photo consent rule stays fail-closed.
- **No regressions.** Existing kinds, prefills, carousel set designs (`set:` templates) and the queue keep
  working. Old routes redirect to the new place.

## Success criteria (proposed)

- Every card kind and carousel set, senior and junior, can be made from one entry point.
- A single team's list, senior or junior, takes at most four steps from Create to the editor.
- No admin goes to Carousel sets or Junior cards to make something; the pages are retired or redirect.
- Pilot clubs report it as simpler.

## Ash's direction (29 Oct 2026)

- **Option A.** Option B felt too thin next to A. Ash asked to see every Option A screen: Home, Create, Queue,
  Your designs, Templates, Photos and Settings. They are now in the prototype, linked to each other.
- **New requirement: edit a carousel set as a set.** Pick a carousel set, then in the editor:
  - reorder, add and remove slides;
  - change one slide's layout, or apply it to every slide;
  - reformat the whole set to Square, Portrait, Story or Landscape, keeping text and photo edits;
  - open any slide in the full card editor.

  The prototype's "Carousel set editor" screen shows this.

## Approved scope (Ash, 29 Oct 2026)

### Hard constraints

- **The editor is unchanged.** The Canva-style card editor, the template editor and the carousel set editor
  (`admin-set-draft-editor`) keep their behaviour. Their documents, and the template library and looks, are
  untouched. Option A changes the screens around the editor, and every route into it opens the same editor.
- **No data migration** of drafts, club templates or carousel sets. Old URLs redirect to their new place.
- **Juniors isolation and the photo consent rule** hold, as above.

### Rollout

- A per-club **"New Studio (preview)" switch**, set from the platform admin console. While it is off, a club
  sees today's Studio exactly as it is. Old and new run side by side, so turning it off is an instant way back.
- Review order:
  1. dev (Replit);
  2. a test tenant on the live site;
  3. Halls Head;
  4. other clubs, as Ash decides.

### P0

1. The per-club preview switch (platform admin console), with the new navigation shown only when it is on.
2. **Create:** one four-step flow for every card kind and carousel set, senior and junior, ending in the existing
   editor:
   1. what to make;
   2. one card or many;
   3. what to fill it from;
   4. look and size.

   Junior kinds read only junior data. A single team's Team List, senior or junior, is prefilled from the
   Selection Hub list or PlayHQ's, with the source shown on each team.

3. **Carousel sets reachable from Create and Your designs,** opening the existing set editor (reorder, add and
   delete slides; switch look; change size).
4. **Home, Queue and Your designs** as in the prototype, over the existing data:
   - Queue gets a Seniors/Juniors filter;
   - Your designs keeps the Dismiss/Delete buttons from #595.
5. **Menu:** Home, Create, Queue, Your designs, Templates, Photos, Settings. Create a card, Carousel sets and
   Junior cards' create step fold into Create.

### P1

- In the set editor:
  - change one slide's layout, or apply a layout to every slide (if the editor can't already);
  - open one slide in the full card editor.
- **Settings regrouped into cards:**
  - posting plan;
  - auto-post;
  - sponsors;
  - what cards show;
  - Facebook/Instagram;
  - Figma;
  - captions;
  - email lists;
  - juniors.

  The existing pages move under these cards; they are not rewritten.

- **Photos** combines senior photos, junior photos, Uploads and Collections as tabs. Junior photos keep their
  own routes and consent rule.

### P0 additions (Ash, 29 Oct 2026)

**Every new design opens straight in the editor, as in Canva.**

- Once the admin picks the kind and the match, team or set, the filled-in design opens directly in the existing
  editor. No form-plus-preview page sits in between.
- **Carousel sets** open in the set editor with its slide strip: reorder, add and remove slides, and edit any
  slide. The format applies to the whole set.
- **Existing tools stay, as editor controls:**
  - photo placement and swap (horizontal, vertical, zoom);
  - "What these cards show" (Minimal / Standard / Full);
  - the sponsors toggle;
  - the size;
  - Send to review / Send to queue.
- **The editor keeps working as it does today.** Add entry points and panels; don't rework its internals.
- **Sponsors per slide:** when the sponsor session's component lands on `main`, it goes in the editor's set or
  format panel.
- **Dev testing:** use the existing dev tenant switcher (`/dev-tenants.html` on the `.replit.dev` preview). The
  preview switch must work for a dev tenant. No impersonation work is needed.

**The set editor shows every slide and can download, as in Canva.**

- **Page strip:** numbered thumbnails under the canvas, an "N / M" counter, and a grid view toggle showing every
  slide, with reordering there too. It uses the existing reorder, add and delete.
- **Share → Download** in the editor header:
  - Pages: All, This page, or Custom.
  - The size for the set's format (for example 1080×1350).
  - PNG by default, and JPG if it costs little.
  - One page downloads one image. Several pages download a zip named after the set, with files numbered in
    slide order (for example `match-day-r5-01.png`).
  - Send to review / Send to queue sits beside it.
  - Downloading never publishes and never bypasses review.
  - Single cards get the same panel with one page.
  - It reuses the existing export code.
- **Rules that still apply on export:**
  - the junior photo consent rule: never put a photo in a download if the card would not show it;
  - fill-in exclusion.

All of this ships behind the same per-club switch.

### Design decision (Ash, 29 Oct 2026)

- **Create's carousel path makes queue-ready set drafts only.** They are filled from real data, or are a blank
  set of the club's own pages ("Pick by hand").
- **The old export-only carousel sets are not started new.** Existing ones still open and export from Your
  designs.

### Build decisions taken while Ash was away (29 Oct 2026, for his return checklist)

Each is the safer, reversible choice. Changing any of them is a small follow-up.

1. **Send to review** in the editors opens the draft in the Queue (`?draft=<id>`) to approve or schedule there.
   It never approves or posts by itself, and unsaved changes must be saved first.
2. **Single card, sponsors:** no new per-card on/off flag. A card's sponsors are its design's sponsor layer,
   shown or hidden in the editor like any layer. Posting still follows the club's sponsor setting.
3. **Single card, "What these cards show":** stays the club's setting per card type (Settings → Cards). A
   carousel gets its own Minimal / Standard / Full in Create's look step, as the Weekend Carousel has.
4. **Sponsors per slide** (#611) is chosen in Create's look step for a carousel, for that carousel only. It
   isn't changed inside the set editor after the set is built, because that would rebuild the sponsor slides.
   It sits in the format step rather than the editor's Set panel.
5. **Share / Download for a single card** is the editor's existing Download menu (PNG, JPG, PDF and clips). The
   new Share panel (All / This page / Custom, numbered zip) is for carousel sets.
6. **Old export-only carousel sets** (Ash, 29 Oct): not started from Create; they still open from Your designs.
7. **Per-slide layout (S9), the arrangement field.** Ash said go without a separate review, so the field is the
   smallest additive one: `arrangement.pageFor`, an optional map of slide → page in a set draft's own design.
   - A slide's own layout is a copy of its page (same card type and page), so only how it is drawn changes,
     never what it shows. A page named in the map draws only the slides mapped to it, so it never posts as an
     extra slide.
   - A set without the map draws exactly as before, and the editor, the queue preview and the server's post all
     read it the same way. A map entry naming a page the set doesn't hold is ignored.
   - "Apply to every slide" copies the slide's layout onto the shared page and clears the map for that slot.
     "Change look" drops the map (the layouts belonged to the old look). Undo covers both.
   - Set templates in the library never hold it, and the template format is unchanged.
   - Built before S8, because "Edit this slide" (S8) saves into the same field.

### Not in this release

- Option B's "This week" board.
- Any change to the editor's tools, the template format or the library.
- Removing the old screens: they stay until every club is on the new Studio.
