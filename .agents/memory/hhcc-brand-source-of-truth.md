---
name: Brand single source of truth (per tenant)
description: Where a club's official logo/colours live and how renderers consume them
---

A club's brand (logo + colours + tagline) has ONE source: its **tenant record**
(`tenants` table — `logo_url`, `primary_colour`, `background_colour`, `juniors_colour`,
`tagline`, `theme_overrides`, …), resolved per request by
`artifacts/api-server/src/lib/tenant-brand.ts` (`getTenantBrand(tenantId)`, short
in-memory cache) and surfaced to clients via the API:
- `GET /tenant-brand` (web `brand-context.tsx`, mobile `TenantBrandProvider`)
- match detail DTO `club` (drives the scorecard's innings colours + logo)
- social-settings bundle `brand` (default theme/logo for share cards)

`@workspace/scorecard`'s `DEFAULT_BRAND` (`lib/scorecard/src/brand.ts`) is the
last-resort fallback when a tenant has no brand: a **neutral** Ovation look (Ovation
wordmark + slate colours), never another club's. `HALLS_HEAD_BRAND` in the same file
holds Halls Head's real values but is used ONLY to seed tenant #1's record
(`scripts/seed-tenants`); it is deliberately not the runtime fallback, which is what
stops Halls Head's brand leaking onto other clubs.

**Why:** before this, every renderer carried its own divergent HHCC hexes/logo copies
and the fallback everywhere was Halls Head's brand, so a brand-less tenant rendered as
Halls Head.

**How to apply:** any new card/tile/export/scorecard surface must read colours/logo from
the brand — `opts.brand`/`bundle.brand` when the bundle is available, else
`DEFAULT_BRAND`. Never hardcode a club's hexes or import a local logo PNG in a renderer.
Selectable `card_themes` still override colours (expected).

**Server gotcha:** import the brand in the non-DOM API server via the subpath
`@workspace/scorecard/brand`, NOT the barrel `@workspace/scorecard`. The barrel's
`index.ts` re-exports `mapping.ts`, which type-imports `@workspace/api-client-react`
whose `custom-fetch.ts` uses DOM lib types. api-server's tsconfig has `types: ["node"]`
and no DOM lib, so pulling the barrel breaks its typecheck. `brand.ts` only depends on
`./types`, so the `./brand` export is DOM-free.
