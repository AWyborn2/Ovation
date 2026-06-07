---
name: HHCC brand single source of truth
description: Where the club's official logo/colours live and how renderers consume them
---

The club's official brand (logo + navy `#333F48` + gold `#FBAC27` + tertiary `#42342B`)
has ONE source: the clubs register DB record **id 2**. It is surfaced to clients via the API:
- match detail DTO `hallsHead` (drives the scorecard's HH innings colours + logo)
- social-settings bundle `brand` (default theme/logo for share cards)

`@workspace/scorecard`'s `HALLS_HEAD_BRAND` constant mirrors id 2 and is the last-resort
fallback so the official look always shows when the DB value is missing. `colors.ts`
`HALLS_HEAD_COLORS` and `deriveHallsHeadColors()` derive from the brand.

**Why:** before this, every renderer carried its own divergent HHCC hexes/logo copies
(e.g. milestone card used `#322F3D`/`#FBD039`, share-card default theme was purple-ish,
trading card had a near-miss `#41342B` tertiary, and several imported a local PNG logo).

**How to apply:** any new card/tile/export/scorecard surface must read colours/logo from
the brand — `opts.brand`/`bundle.brand` when the bundle is available, else the shared
`HALLS_HEAD_BRAND` constant. Never hardcode HHCC hexes or import a local logo PNG in a
renderer. Selectable `card_themes` still override colours (expected). Page chrome
(navbar/page-header logos in layout/honour-boards/premierships) is intentionally left
on the local asset import — not a card surface.

**Server gotcha:** import the brand in the non-DOM API server via the subpath
`@workspace/scorecard/brand`, NOT the barrel `@workspace/scorecard`. The barrel's
`index.ts` re-exports `mapping.ts`, which type-imports `@workspace/api-client-react`
whose `custom-fetch.ts` uses DOM lib types (`RequestInfo`, `HeadersInit`). api-server's
tsconfig has `types: ["node"]` and no DOM lib, so pulling the barrel breaks its
typecheck. `brand.ts` only depends on `./types`, so the `./brand` export is DOM-free.
The server helper (`artifacts/api-server/src/lib/halls-head-brand.ts`) reads clubs id 2
with a short in-memory cache and falls back to `HALLS_HEAD_BRAND`.
