# Card Kind Templates — Design Spec

**Date:** 2026-10-07
**Feature:** card-kind-templates
**Authoritative document:** `docs/plans/2026-10-07-002-feat-card-kind-templates-plan.md`. This spec does not duplicate it; it records the approval state and the open review items.

## Summary

Every Social Studio card kind (21 kinds) gets one club template made of editable elements, Canva-style: every element can be moved, resized, restyled, deleted, layered and locked; text boxes carry live data fields; any Google Font; each size (square, portrait, Story, landscape) is its own canvas. Automated drafts render from the club's template. Club Kit and Broadcast become the two starter designs; Bold Type, Gold Foil, Neon Night and Sunset retire.

## Approval state

- Requirements (Product Contract): approved by Ash, 2026-10-07.
- Implementation plan scope: approved by Ash, 2026-10-07.
- Headless document review: 11 proposed fixes accepted by Ash and 3 decisions made (2026-10-07); all folded into the plan.

## Review items — resolved 2026-10-07

All 11 proposed fixes accepted and folded into the plan (KTD4, KTD5, KTD6, KTD9, KTD10, KTD18, KTD19; units U1–U9).

Decisions:

- A. Per-slide tweaks: one design per carousel; a tweak applies to every slide (KTD6).
- B. Colour modes and uploaded-background templates: kept in this release; retiring them is follow-up work.
- C. Editor devices: desktop and tablet with touch (new R23, KTD20).

FYI items folded in: starter chooser thumbnails and retired-pack banner (U8, U9); U6/U10 split into static vs rendered checks; fixture templates for U7/U10 until starters land.

## Spec self-review

- Placeholders: none.
- Consistency: KTD5 no longer uses defaultForKinds; U9 keeps colour modes; DoD references R1–R23 and the switch.
- Scope: one feature behind one switch; starter design is the critical path.
- Ambiguity: needs-a-look timing, caption protection and slide tweaks are now explicit.
