# Card Kind Templates — Design Spec

**Date:** 2026-10-07
**Feature:** card-kind-templates
**Authoritative document:** `docs/plans/2026-10-07-002-feat-card-kind-templates-plan.md`. This spec does not duplicate it; it records the approval state and the open review items.

## Summary

Every Social Studio card kind (21 kinds) gets one club template made of editable elements, Canva-style: every element can be moved, resized, restyled, deleted, layered and locked; text boxes carry live data fields; any Google Font; each size (square, portrait, Story, landscape) is its own canvas. Automated drafts render from the club's template. Club Kit and Broadcast become the two starter designs; Bold Type, Gold Foil, Neon Night and Sunset retire.

## Approval state

- Requirements (Product Contract): approved by Ash, 2026-10-07.
- Implementation plan scope: approved by Ash, 2026-10-07.
- Headless document review: 0 fixes applied; 11 proposed fixes, 3 decisions and 4 FYI observations open.

## Open review items

### Proposed fixes (concrete fix, needs confirmation)

1. [P0] Needs-a-look is never computed before auto-promotion or auto-publish — render every enabled size at draft creation, refresh and apply; unrendered templated drafts are ineligible; publish worker aborts on warnings. (feasibility, adversarial)
2. [P1] Kind templates must not use `defaultForKinds`/`clearDefaultKinds` — that strips pack claims and confuses the share-card modal. Key on `base_kind` with a partial unique index; exclude `source = 'kind'` from layout lists. (feasibility, adversarial)
3. [P1] Template document types, size/capacity helpers and the field catalogue belong in `lib/scorecard`, not the web app, because the server and set planner need them. (feasibility)
4. [P1] Broadcast Dark has no design for roundFixtures, tradingCard, juniorHighlights — catalogue those from Club Kit; design their Broadcast starters from scratch. (feasibility)
5. [P1] Apply must not clear `editedAt`, which protects hand-written captions; use a separate design-edited marker. (adversarial)
6. [P1] Add a kind-templates switch, off by default, flipped only after the starter contract passes with no skips. (adversarial)
7. [P2] Shrink-to-fit uses an injected measurer for jsdom unit tests plus a real-browser smoke test. (feasibility)
8. [P2] Shrink-to-fit and warnings also apply to text cells in list rows. (adversarial)
9. [P2] Queue: "Needs a look" filter, drawer reason with "Edit design" and "Mark ready anyway" (confirmed), tests. (design-lens)
10. [P2] Apply dialog: count, warns tweaks reset, defaults to "Don't apply", skipped at zero, in-progress and failure states. (design-lens)
11. [P2] One owner for add-to-sizes and per-size presence helpers (U1's module). (scope-guardian)

### Decisions (need user judgment)

A. Per-slide tweaks on templated carousels — proposal: one document at the root, every slide renders it, a tweak applies to all slides.
B. Do colour modes and background templates retire in this release (U9 removes them; R20 does not mention them)?
C. Template editor accessibility and narrow screens — keyboard/tablet support, or desktop-only?

### FYI

- Starter chooser should preview each starter; retired-pack notice as a banner on the Templates section.
- Editor loading/empty/error states not enumerated.
- U6 contract test and U10 template lint overlap.
- U7 and U10 are built against fixture templates until U6 content lands.
