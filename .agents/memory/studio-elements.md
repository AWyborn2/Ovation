---
name: Club Kit pack + Studio element library
description: How the Club Kit pack (club-kit-v1) and the Studio element library share one set of parts, and the rules that keep them safe.
---

# Club Kit + element library

- **Club Kit** (`pack-templates/club-kit/`) is authored in CARD cqmin, not skeleton body cqmin: the body box sets `container-type:normal`. Each format has its own markup (`{story, portrait, square, landscape}`): side photo frame on square/landscape, top frame on portrait/story.
- Colours are `--ck-*` vars from `pack-render/club-kit-vars.ts` (primary = resolved accent, secondary = brand `backgroundColour`, juniors = `juniorsColour`), emitted via the manifest's `rootVars` hook. `colourMode: "club-only"` makes `packColourModeFor` always return "club" and hides the Design packs switch.
- Field keys still come from Broadcast Dark's reference design (`design()` in `designs.ts` filters the reference fields by what the markup uses). Extras are allowlisted in `pack-lint.test.ts` (`club-kit-v1/*`). Club Kit-only kinds (`roundFixtures`, `tradingCard`, `juniorHighlights`) use `own` fields and are listed in `PACK_ONLY_KINDS`.
- `resolvePackIdForKind` (web) falls back to the first pack that renders a kind, so Club Kit-only kinds never resolve to a pack that renders nothing.
- **Elements** (`lib/studio-elements/registry.ts`) call the SAME part functions as the pack, via a unit function `u` that scales into the layer box. A free layer `kind:"element"` stores `{id, props}`; props resolve edited > live card value (`bind`) / live rows (`liveRows`) > sample, and are escaped in `renderElement`. The overlay gets `--ck-*` only when an element layer exists (plain cards stay byte-identical).
- Junior rows always print first name + initial (`juniorName` / bind's `juniorDisplayName`). The sponsor-strip element obeys `sponsorLock` (no delete/hide).
- Adding an element: add an `ElementDef` (design size in card cqmin, `defaultBox` per format); `registry.test.ts` renders every element on blank + other packs and checks escaping.
