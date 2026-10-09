# CTO — card-kind-templates

## Strategy [CONFIRMED 2026-10-07]

- Why: limited template editing is one of the owner's five complaints about Social Studio; club customisations are lost every week because automated cards always use stock pack designs.
- Build vs buy: build. The editor, renderer and server render harness already exist; Canva-style editing extends them. Canva itself has no match-data binding.
- Scope bet: replace six fixed packs with per-kind element templates; two starters (Club Kit, Broadcast); all 21 kinds ship together.
- Cost: about 168 hand-designed starter layouts plus ten implementation units — the largest Social Studio change to date.

## Phase 1 verdict (2026-10-07)

- **Build it, now.** Editable templates are the differentiator a generic scheduler or Canva cannot copy: designs bound to the club's own match data, applied automatically every week.
- **Build vs buy re-checked.** Embedding a third-party editor (e.g. a hosted design SDK) was rejected: it would need a second renderer for server images and would not understand card data fields; the existing editor already does most of the editing.
- **Tech direction.** Extend, don't replace: the editor's layer document on the blank base becomes the template; one renderer for editor, preview and server images (ADR-001).
- **Risk posture.** Ship dark behind a kind-templates switch; production only changes when the starters are complete. The largest schedule risk is the hand-designed starter track, accepted by the owner.
- **Opportunity cost.** Delays the Posting Plan and queue-packaging work (ideas 1 and 2 in the Social Studio review); the owner chose this first.
