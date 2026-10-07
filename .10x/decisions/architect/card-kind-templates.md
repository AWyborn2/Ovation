# Architect — card-kind-templates

## Current architecture [DISCOVERED]

- Cards render from code-built HTML pack templates (`artifacts/cricket-club/src/lib/pack-templates/`, six packs) bound to card data by `bindInput` and tenant data by `applyPackData` (`lib/pack-render/bind.ts`).
- The Studio editor stores per-draft `adjustments` (field overrides, hidden slots, photo transform, free layers with per-size geometry) applied over the pack at render (`lib/pack-render/adjustments.ts`).
- A "blank" base (`BLANK_PACK_ID`) already renders a card made only of free layers.
- Server images are produced by driving the same React renderer in headless Chromium through `/__card-render` (`card-render-harness.tsx`, `api-server/src/lib/card-video-renderer.ts`, `draft-render.ts`); renders are serialised.
- Automated drafts get only a pack id (`resolvePackIdForKind`, `source = 'pack'` rows); `draft.adjustments` is the only design overlay applied server-side, and `theme` is always null.
- List cards split into slides by `lib/scorecard/src/card-sets.ts` (`SET_CAPS` for roundFixtures 5, weekendWrap 4, teamListRound 1); ladder and leaderboards truncate.
- Server renders happen only at publish (`prepare-media.ts`, one size) and for post packs — not at draft creation.

## Proposed (from plan, pending ADR)

- Template = layer document on the blank base; draft holds a copy; versioned per tenant and kind; lazy creation from current pack; warnings persisted and blocking automation. See plan KTD1–KTD17 and open review items in the spec.
