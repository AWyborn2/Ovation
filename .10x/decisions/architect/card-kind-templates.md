# Architect — card-kind-templates

## Current architecture [CONFIRMED 2026-10-07]

- Cards render from code-built HTML pack templates (`artifacts/cricket-club/src/lib/pack-templates/`, six packs) bound to card data by `bindInput` and tenant data by `applyPackData` (`lib/pack-render/bind.ts`).
- The Studio editor stores per-draft `adjustments` (field overrides, hidden slots, photo transform, free layers with per-size geometry) applied over the pack at render (`lib/pack-render/adjustments.ts`).
- A "blank" base (`BLANK_PACK_ID`) already renders a card made only of free layers.
- Server images are produced by driving the same React renderer in headless Chromium through `/__card-render` (`card-render-harness.tsx`, `api-server/src/lib/card-video-renderer.ts`, `draft-render.ts`); renders are serialised.
- Automated drafts get only a pack id (`resolvePackIdForKind`, `source = 'pack'` rows); `draft.adjustments` is the only design overlay applied server-side, and `theme` is always null.
- List cards split into slides by `lib/scorecard/src/card-sets.ts` (`SET_CAPS` for roundFixtures 5, weekendWrap 4, teamListRound 1); ladder and leaderboards truncate.
- Server renders happen only at publish (`prepare-media.ts`, one size) and for post packs — not at draft creation.

## Proposed (from plan, pending ADR)

- Template = layer document on the blank base; draft holds a copy; versioned per tenant and kind; lazy creation from current pack; warnings persisted and blocking automation. See plan KTD1–KTD17 and open review items in the spec.

## Phase 2 design (2026-10-07) — ADR-001, ADR-002, ADR-003

**Components and boundaries**

- `lib/scorecard/src/kind-templates/` (shared): document types and helpers, per-kind field catalogue, starters and pack-to-starter map, rows capacity. No DOM, no DB.
- Web renderer (`artifacts/cricket-club/src/lib/pack-render/`): renders documents on the blank base; `layer-fit.ts` shrinks and reports warnings with an injected measurer.
- Render harness (`/__card-render`): loads fonts explicitly, renders, runs fit, returns image plus warnings.
- API (`artifacts/api-server`): `lib/kind-templates.ts` (switch, get-or-create, versioned save, apply), `routes/kind-templates.ts`; draft pipeline (`draft-upsert`, `draft-render`, `draft-sweep`, `publishing/*`) copies documents, computes warnings before promotion, and gates automation.
- Editor (web): template mode route `/admin/social/templates/:kind`, reusing the Studio editor shell; Studio Templates section; queue "Needs a look".

**Data flow:** starter → lazy kind template (versioned) → copied into draft at creation or apply → rendered at every enabled size → warnings per size → promotion/publish gate → post or share by hand.

**Failure modes**

| Failure                           | Effect                     | Handling                                                                             |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| Starter missing for a kind        | Draft can't get a design   | Switch stays off until contract passes; with switch on, contract guarantees coverage |
| Lazy-create race                  | Duplicate templates        | Partial unique index + insert-or-ignore                                              |
| Concurrent template saves         | Overwritten work           | Version check; conflict message                                                      |
| Font fails to load                | Wrong metrics, wrong image | Fallback stack + warning; automation blocked                                         |
| Render harness error during sweep | No warnings computed       | Draft stays unrendered → ineligible for automation; retried next sweep               |
| Apply races publish               | Posted card changed        | Status re-check inside transaction; skipped count                                    |
| Over 10 slides                    | Meta rejects carousel      | Rows after slide 10 not posted; warning                                              |
