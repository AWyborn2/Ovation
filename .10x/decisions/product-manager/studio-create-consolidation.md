# Studio create consolidation

**Status:** Scoping with Ash, 29 Oct 2026. Two prototypes are awaiting his pick.
**Prototypes:** https://claude.ai/artifact/Y6FvEh49DAB7bDa5ny62YN (Option A: One Create flow; Option B: Studio
rebuild). **Next:** Ash picks an option or a mix of them, then it goes to the Principal Architect.

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

## Not decided yet

The option, MVP scope (P0/P1) and the release split wait for Ash's review of the prototypes.
