---
title: Brand Leaks (Phase 2) - Plan
type: fix
date: 2026-07-01
topic: brand-leaks
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan
execution: code
origin: docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md
---

# Brand Leaks (Phase 2) - Plan

Implements **Phase 2** of the origin contract (docs/plans/2026-07-01-001-fix-ovation-platform-hardening-plan.md), advancing origin R5–R8. Product Contract unchanged. Depends on nothing in Phase 1 — safe to build in parallel with Phase 1 verification.

---

## Goal Capsule

- **Objective:** No Halls Head asset ever renders for another club. Every club looks fully its own — logo, background, cards, favicon, page title — and a brand-less club gets a neutral Ovation placeholder, never Halls Head.
- **Product authority:** Ash (reviews outcomes, approves phases).
- **Execution profile:** Deep. Six units. Theming is already token-based; this removes the remaining hard-coded Halls Head bleed and neutralises the fallback.
- **Stop conditions:** A change that alters Halls Head's own appearance (tenant #1 must look identical after this) is a hard stop — surface it.

---

## Product Contract

### Summary

Replace the Halls Head fallback and hard-coded Halls Head assets with a neutral Ovation default, seed Halls Head's real brand into its own tenant record so it's unaffected, and drive the site background, card rendering, favicon, and page/social metadata from the tenant brand. Social-preview (OG) tags need a small server-side injection layer, which is this phase's one infrastructure decision.

### Problem Frame

Per-tenant colours and logo already swap correctly at runtime, but several Halls Head specifics still leak onto other clubs' sites: the brand resolver falls back to the Halls Head logo/name/colours when a tenant has none (`tenant-brand.ts` `buildTenantBrand`), a Halls Head background texture is hard-coded for every club (`index.css`), social cards default to Halls Head brand constants, and `index.html` serves static Halls-Head-neutral-but-generic title/OG tags with a favicon that never varies by club. A club that sees a rival's logo or a generic "Ovation" share preview doesn't feel like its own — this is the launch-readiness blocker after stats correctness.

### Key Decisions

- **Neutral default, Halls Head seeded into its own record.** The ultimate brand fallback becomes a neutral Ovation placeholder (logo + neutral colours), not Halls Head. Halls Head's real brand is seeded into its tenant/clubs row so tenant #1 looks identical — its appearance must not depend on a code default any more.
- **Background becomes a per-tenant brand value.** The hard-coded Halls Head texture is removed; the body background reads a CSS variable set by the brand provider, defaulting to a neutral treatment, with Halls Head's texture stored as its own tenant value.
- **Cards read the resolved tenant brand, not constants.** Card renderers already accept a brand; the remaining direct `HALLS_HEAD_BRAND` references become the passed-in tenant brand (neutral default when none).
- **Favicon + title are client-side; social-preview (OG) tags are server-side.** Title and favicon can be set at runtime by the brand provider. OG/Twitter tags are read by social scrapers that don't run JavaScript, so per-tenant previews require injecting tags into the served `index.html` per request host — and the web app is not server-rendered today, so a small injection layer is new work (see Outstanding Questions).

### Actors

- A1. Club viewer — sees the club's site and its shared-link previews.
- A2. Platform super-admin — provisions clubs; each arrives with a neutral brand until the club sets its own.
- A3. Club admin — uploads the club's logo, colours, background, and favicon.

### Requirements

- R5. No Halls Head asset renders for another club; the resolver never falls back to the Halls Head logo — a brand-less club gets a neutral placeholder. Halls Head itself is unchanged.
- R6. The site background is per-tenant or a neutral default, replacing the hard-coded Halls Head texture.
- R7. Card rendering (trading, milestone, match-result) defaults to the current tenant's brand, not Halls Head constants.
- R8. Per-tenant favicon and page title are served from the tenant brand; per-tenant social-preview (OG/Twitter) tags are served for link previews.

### Acceptance Examples

- AE1. Covers R5. Given a newly provisioned club with no logo set, when any page or card renders, then a neutral Ovation placeholder shows — never the Halls Head logo. Given Halls Head, then its own logo shows unchanged.
- AE2. Covers R6. Given a non-Halls-Head tenant, when the site loads, then the Halls Head background texture is absent (neutral or the club's own background).
- AE3. Covers R8. Given a club with a favicon and name set, when its site is opened, then the browser tab shows that favicon and name; when its link is shared, the preview shows that club's title/description (not a generic "Ovation").

---

## Implementation Units

### U1. Neutral default brand + seed Halls Head into its own record

- **Goal:** Make the ultimate brand fallback a neutral Ovation placeholder and ensure Halls Head's appearance comes from its own record, not the code default.
- **Requirements:** R5
- **Dependencies:** none
- **Files:** `lib/scorecard/src/brand.ts` (introduce a neutral `DEFAULT_BRAND`; keep the Halls Head values as a separate named constant used only for seeding); `artifacts/api-server/src/lib/tenant-brand.ts` (`buildTenantBrand` falls back to the neutral default); a neutral placeholder logo asset under the web app's public assets; `scripts/src/seed-halls-head-brand.ts` (new — write Halls Head's name/logo/colours into tenant #1's row so it no longer relies on the fallback).
- **Approach:** Neutralise the shared default brand; thread Halls Head's real values into the DB via a one-time seed script; every brand-less resolution now yields the neutral default.
- **Patterns to follow:** existing `buildTenantBrand` precedence chain (`tenant-brand.ts:42-71`); `scripts/src/seed-mandurah-tenant.ts` for script shape.
- **Test scenarios:**
  - Covers AE1. `buildTenantBrand(null, null)` returns the neutral default (no Halls Head logo/name/colours).
  - `buildTenantBrand` with Halls Head's seeded tenant row returns Halls Head's brand unchanged.
  - A tenant with a primary colour but no logo gets the neutral placeholder logo, its own colours.
- **Verification:** A brand-less tenant renders the neutral placeholder; Halls Head is visually identical to before.

### U2. Per-tenant background (remove the hard-coded texture)

- **Goal:** Remove the hard-coded Halls Head background and drive it from the tenant brand with a neutral default.
- **Requirements:** R6
- **Dependencies:** U1
- **Files:** `artifacts/cricket-club/src/index.css` (replace the fixed `@assets/HHCC-…` background with a `var(--app-bg-image)` defaulting to a neutral treatment); `artifacts/cricket-club/src/lib/brand-context.tsx` (set `--app-bg-image` from the brand); `lib/db/src/schema/tenants.ts` (+ `backgroundUrl` column); `artifacts/api-server/src/lib/tenant-brand.ts` + `artifacts/api-server/src/routes/tenant.ts` (expose `backgroundUrl` on `TenantBrand`); seed Halls Head's texture as its own `backgroundUrl` (extend U1's seed).
- **Approach:** CSS variable for the background image, set per-tenant on mount; Halls Head's texture becomes its own stored value rather than a global default.
- **Patterns to follow:** `applyBrandTheme()` CSS-variable injection in `brand-context.tsx`; the `faviconUrl`/colour columns already on `tenants`.
- **Test scenarios:**
  - Covers AE2. A non-Halls-Head tenant renders with no Halls Head texture (neutral default).
  - A tenant with a `backgroundUrl` renders that image.
  - Halls Head still shows its texture (from its seeded value).
- **Verification:** Halls Head texture no longer appears for other tenants; Halls Head unchanged.

### U3. Card rendering + social-create defaults read the tenant brand

- **Goal:** Replace direct Halls Head brand constants in card rendering with the resolved tenant brand (neutral default when none).
- **Requirements:** R7
- **Dependencies:** U1
- **Files:** `artifacts/cricket-club/src/components/trading-card/constants.ts`, `artifacts/cricket-club/src/lib/share-card.ts`, `artifacts/cricket-club/src/lib/milestone-share.ts` (use the passed-in brand / neutral default instead of `HALLS_HEAD_BRAND`); `artifacts/cricket-club/src/pages/admin-social-create.tsx` (replace hard-coded `"Halls Head"` / `"HHCC"` fallbacks with the tenant brand).
- **Approach:** Thread the tenant brand (already available via `useTenantBrand`) into the card constants/renderers; drop the Halls Head literals.
- **Patterns to follow:** `useBrand()` / `useTenantBrand()` hooks; how `layout.tsx` already consumes the brand.
- **Test scenarios:**
  - Covers AE1 (cards). A card rendered for a non-Halls-Head tenant uses that tenant's logo/colours; a brand-less tenant uses the neutral placeholder.
  - The social-create form defaults to the current tenant's name, not "Halls Head".
  - A Halls Head card is unchanged.
- **Verification:** No card shows Halls Head branding for another club; Halls Head cards unchanged.

### U4. Per-tenant favicon and page title (client-side)

- **Goal:** Set the browser favicon and document title from the tenant brand at runtime, with a neutral default.
- **Requirements:** R8 (favicon + title)
- **Dependencies:** U1
- **Files:** `artifacts/api-server/src/lib/tenant-brand.ts` + `lib/api-zod`/`lib/api-client-react` via `lib/api-spec/openapi.yaml` (expose `faviconUrl` on `TenantBrand` — the column already exists on `tenants`; **run codegen**); `artifacts/cricket-club/src/lib/brand-context.tsx` (set `<link rel="icon">` and `document.title` from the brand); `artifacts/cricket-club/index.html` (neutral default favicon + title, already generic).
- **Approach:** Add `faviconUrl` to the brand contract (spec → codegen), then update the favicon link element and title in the brand provider (title is already set there).
- **Patterns to follow:** `BrandProvider` already sets `document.title`; OpenAPI-first codegen flow.
- **Test scenarios:**
  - Covers AE3 (favicon/title). A tenant with a favicon + name sets both at runtime; a brand-less tenant gets the neutral default favicon.
  - Halls Head tab shows its favicon/name.
- **Verification:** Browser tab reflects the club; no Halls Head favicon leak.

### U5. Per-tenant social-preview (OG/Twitter) tags — server-side injection

- **Goal:** Serve per-tenant OG/Twitter tags so shared links preview as the club, not generic "Ovation".
- **Requirements:** R8 (social preview)
- **Dependencies:** U1; **the serving decision in Outstanding Questions**
- **Files:** a new `index.html`-serving path that injects per-host tenant tags (candidate: an Express handler in `artifacts/api-server` that serves the built `dist/public/index.html` with injected `<title>`/OG/Twitter/favicon tags resolved from the request host → tenant brand), plus the deploy/proxy config that routes the document request through it.
- **Approach:** On the document request, resolve the tenant from the host (reuse `tenant-context` resolution), read the tenant brand, and inject the tags into the served HTML. Social scrapers don't run JS, so this must happen server-side.
- **Patterns to follow:** `middlewares/tenant-context.ts` host→tenant resolution; `getTenantBrand`.
- **Execution note:** Confirm the serving/hosting approach (Outstanding Questions) before building; this unit may reduce to config if the host already fronts the SPA.
- **Test scenarios:**
  - Covers AE3 (preview). A document request for a club's host returns HTML whose OG/title tags carry that club's name/description.
  - The platform/apex host returns neutral Ovation tags.
  - No JS execution required for the tags to be present (assert on the raw HTML response).
- **Verification:** A link-preview debugger (or raw `curl` of the host) shows the club's title/description/image.

### U6. Brand-leak regression tests

- **Goal:** Guard that no Halls Head asset resolves for a non-Halls-Head tenant.
- **Requirements:** R5, R7
- **Dependencies:** U1, U3
- **Files:** `artifacts/api-server/src/lib/tenant-brand.test.ts` (new — unit tests for `buildTenantBrand` fallback); optionally extend a web smoke test.
- **Approach:** Assert the neutral fallback and Halls-Head-seeded cases; assert no Halls Head logo URL appears in a resolved brand for a brand-less tenant.
- **Patterns to follow:** existing vitest suites in `api-server`.
- **Test scenarios:** the fallback matrix from U1 plus an explicit "no Halls Head asset URL for a non-HH tenant" assertion.
- **Verification:** Suite passes; a reintroduced Halls Head fallback fails it.

---

## Verification Contract

- Typecheck: `pnpm run typecheck`.
- After the `openapi.yaml` change (U4): `pnpm --filter @workspace/api-spec run codegen`, then typecheck.
- After the `tenants` column add (U2): `pnpm --filter @workspace/db run push`.
- Tests: `pnpm --filter @workspace/api-server run test` (incl. new `tenant-brand.test.ts`).
- Seed: `pnpm --filter @workspace/scripts run seed-halls-head-brand` (writes Halls Head's brand into tenant #1).
- Manual: on a non-Halls-Head tenant — no Halls Head logo/background/favicon anywhere, cards on-brand, tab + share preview reflect the club; Halls Head visually identical to before.

## Definition of Done

- Origin R5–R8 satisfied; Halls Head (tenant #1) is visually unchanged.
- The brand fallback is neutral Ovation, never Halls Head; Halls Head's brand lives in its own record.
- No hard-coded Halls Head background, card default, or favicon leaks to another club.
- Per-tenant favicon/title work; per-tenant OG tags serve for link previews (or U5's serving decision is explicitly deferred with the reason recorded).
- Brand-leak regression test passes; full API suite green; typecheck clean.

## Outstanding Questions

**Resolve before planning U5**

- How is the built web app served in production (Replit static host, a reverse proxy, or could the api-server serve it)? This decides whether per-tenant OG injection is a small Express handler in front of `dist/public/index.html`, a hosting-layer/edge change, or a deferred follow-up. U1–U4 do not depend on this and can proceed regardless.

## Scope Boundaries

**Deferred to Follow-Up Work**

- A full admin UI for uploading background/favicon (the columns + brand plumbing land here; a polished upload screen can follow, reusing the existing logo-upload pattern).
- Phases 3–5 of the origin contract.
