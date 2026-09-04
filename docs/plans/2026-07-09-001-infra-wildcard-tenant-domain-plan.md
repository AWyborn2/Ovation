# Infra: serve tenant subdomains on a custom wildcard domain

**Date:** 2026-07-09
**Status:** Proposed
**Trigger:** `hallshead.ovationcc.replit.app` fails with `ERR_CONNECTION_RESET`.

## Root cause (from debug session)

Replit's `*.replit.app` wildcard DNS resolves any depth of subdomain, but its TLS
certificate covers exactly one label. `hallshead.ovationcc.replit.app` is two labels,
so Replit's edge resets the TLS handshake before the request ever reaches the app.
Nested subdomains under `.replit.app` can never work; the subdomain tenant
architecture needs an apex domain we control.

The app itself is already proxy-ready:

- `app.set("trust proxy", 1)` (`artifacts/api-server/src/app.ts:17`)
- `hostOf()` prefers `X-Forwarded-Host` (`artifacts/api-server/src/middlewares/tenant-context.ts:101`)
- Tenant resolution matches the first host label against `tenants.slug`, then exact
  `tenants.custom_domain` (`tenant-context.ts:113`)
- Tenant URLs are built from `PLATFORM_BASE_DOMAIN` / `PLATFORM_HOSTS`
  (`artifacts/api-server/src/lib/tenant-url.ts`)

## Prerequisite

Own an apex domain (working assumption below: `ovation.app` — substitute the real
one). Register it or move its DNS to Cloudflare (free plan is sufficient).

## Option A — per-subdomain custom domains on Replit (do this first, Phase 1)

Replit deployments support custom domains but **not wildcards**, so each tenant
subdomain is added individually. For 2–3 concierge pilot clubs this is the simplest
path and involves zero extra infrastructure in the request path.

1. In the Replit deployment → Settings → "Link a domain", add each host:
   - `ovation.app` and `www.ovation.app` (platform/marketing surface)
   - `hallshead.ovation.app`, `mandurah.ovation.app`, … (one per tenant)
2. Create the A/CNAME + TXT verification records Replit provides for each host
   (at the DNS provider; if on Cloudflare, set these records to **DNS-only/grey
   cloud** — Replit terminates TLS itself).
3. Replit provisions a certificate per hostname automatically.

Cost: a manual DNS + Replit step per club at onboarding. Acceptable while
onboarding is concierge; revisit at self-serve (Phase 2).

## Option B — Cloudflare Worker wildcard (Phase 2, self-serve)

When tenants self-serve, per-club DNS steps stop scaling. Front the deployment with
a true wildcard:

1. Cloudflare DNS: `*.ovation.app` → proxied (orange cloud) placeholder record.
2. Cloudflare Worker on route `*.ovation.app/*` that forwards to the Replit origin:

   ```js
   export default {
     async fetch(request) {
       const url = new URL(request.url);
       const origin = new URL(request.url);
       origin.hostname = "ovationcc.replit.app"; // Replit edge needs its own SNI/Host
       const fwd = new Request(origin, request);
       fwd.headers.set("X-Forwarded-Host", url.hostname); // app resolves tenant from this
       return fetch(fwd);
     },
   };
   ```

   Note: a plain proxied DNS record is NOT enough — the origin fetch must use
   `ovationcc.replit.app` as SNI/Host or Replit's edge resets it (same failure as
   the bug). Host-header override via Origin Rules is Cloudflare Enterprise-only;
   the Worker is the free-plan mechanism.

3. New tenant subdomains work instantly with no DNS/Replit changes.

Caveats: the Worker sits in every request path (latency + Workers free-tier
request limits); verify WebSocket/SSE passthrough if the app ever uses them.

## App/env changes (both options — env only, no code)

1. Replit deployment secrets:
   - `PLATFORM_BASE_DOMAIN=ovation.app`
   - `PLATFORM_HOSTS=ovation.app,www.ovation.app`
2. Confirm seeded `tenants.slug` values match the intended subdomain labels
   (`hallshead` etc. — slug is the left-most label, lowercased).
3. Sanity-check the CORS allow-list derivation in `app.ts` covers tenant
   subdomains of the new base domain (SPA is same-origin so this should be moot,
   but verify).

## Verification

- `curl -I https://hallshead.ovation.app/` → 200, no TLS errors.
- Homepage on each tenant host shows that tenant's branding (not Halls Head
  fallback) — proves host→tenant resolution, not the `DEFAULT_TENANT_ID` chain.
- `curl -I https://ovation.app/` → platform/marketing surface (platform mode).
- Existing suites still green: `tenant-routing.test.ts`, `host-of.test.ts`,
  `tenant-isolation.test.ts`.
- Negative check: an unknown subdomain (`nosuchclub.ovation.app`) should fall back
  gracefully (currently → default tenant; decide if a 404/landing is wanted later).

## Explicitly out of scope

- Path-based tenant slugs (`/hhcc`) — rejected for now; subdomain architecture
  stays canonical.
- PlayHQ IDs in URLs — rejected; GUIDs are unbrandable, slugs remain the key.
- Per-tenant custom domains (`hallsheadcc.com.au`) — already supported by
  `tenants.custom_domain`; onboarding docs for that are a separate task.
