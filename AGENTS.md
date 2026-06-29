# AGENTS.md — Ovation

> Source-of-truth orientation file for anyone (human or AI) working on this repo.
> Created from a full codebase audit, 29 Jun 2026. Pairs with `CLAUDE.md`
> (strategy/white-label plan), `replit.md` (inherited data model + gotchas), and
> the `.agents/memory/` knowledge base. **If those three disagree with each other,
> trust the code, then this file, then update whichever doc was wrong.**

## What this is

White-label cricket stats-and-history platform. Any club brands it as their own and
gets their full history (stats, records, honour boards, milestones) from a shared
association database (the **central PCA DB**) that stays current automatically.
Halls Head Cricket Club is tenant #1 / the demo. Pilot tenants: Peel Cricket
Association clubs.

The repo is a fork of the original single-club Halls Head app, mid-transformation
into multi-tenant SaaS.

## Repo shape (pnpm monorepo)

```
artifacts/            ← the runnable apps
  cricket-club/       ← React + Vite + Tailwind website (~50k LOC, 58 pages) — the main product
  api-server/         ← Express 5 + Drizzle + Postgres backend (~23k LOC, ~48 route modules)
  cricket-mobile/     ← Expo / React Native phone app (~7.6k LOC)
  mockup-sandbox/     ← design scratch area — NOT production
lib/                  ← shared toolkits
  api-spec/           ← openapi.yaml (single 10.4k-line contract, ~215 operations) — SOURCE OF TRUTH for the API
  api-client-react/   ← GENERATED from openapi.yaml (React Query hooks) — do not hand-edit
  api-zod/            ← GENERATED from openapi.yaml (Zod validators) — do not hand-edit
  db/                 ← Drizzle schema (35 tables) + central DB connection/queries
  scorecard/          ← shared match→scorecard view-model, used by web AND mobile
  object-storage-web/ ← image/file upload helpers
scripts/              ← maintenance / data scripts (incl. central-DB compare & seed)
docs/                 ← playcricket-ingestion.md (data ingest notes)
.agents/memory/       ← 60+ assistant-facing knowledge notes (rich but not human-facing)
```

Architecture in one line: **contract-first design — one OpenAPI spec generates the
glue between a React website, a React Native app, and an Express+Postgres backend —
now reading shared stats from a central association DB filtered per tenant.**

## How to run / build (commands)

- Package manager is **pnpm only** (preinstall hook blocks npm/yarn).
- Typecheck everything: `pnpm run typecheck`
- Build everything: `pnpm run build` (typechecks first)
- API server: `pnpm --filter @workspace/api-server run dev` · tests: `... run test` (vitest)
- Website: `pnpm --filter @workspace/cricket-club run dev`
- **Regenerate API glue after spec changes:** edit `lib/api-spec/openapi.yaml`, then
  `pnpm --filter @workspace/api-spec run codegen`. Never hand-edit generated files.
- Full original run instructions + data model live in `replit.md`.

## Core patterns (follow these)

- **OpenAPI-first.** All frontend↔backend types flow from `openapi.yaml`. Change the
  spec, regenerate, then implement. `api-client-react` and `api-zod` are generated.
- **Feature-sliced routes.** One file per domain in `api-server/src/routes/`, wired in
  `index.ts`. Naming is by intent and consistent.
- **Intent-named middleware guards** in `api-server/src/middlewares/`:
  `tenant-context`, `require-admin`, `require-captain`, `require-platform-admin`,
  `require-entitlement`, `rate-limit`.
- **Tenant resolved per request** before any route runs (header → env → default);
  handlers read it via `getTenantId(req)`. This is the white-label backbone.
- **Drizzle ORM**, one file per table in `lib/db/src/schema/`, snake_case columns.
  Curated tables carry tenant ownership via the `tenantIdColumn()` helper
  (`schema/_tenant.ts` — read its comment block; it documents what is tenant-scoped
  now, what is deferred, and why).
- **Strict TypeScript** (explicit return types, `import type`), functional React +
  hooks, Tailwind tokens for theming, Radix UI primitives. Doc-comments explain
  intent — keep that habit.
- `@workspace/scorecard` is the SINGLE view-model for web + mobile. Don't fork it.

## Current state (reality, not the roadmap doc)

⚠️ **`CLAUDE.md` says "Phase 0". The code is past that.** Git history shows committed:
Phase 2b self-serve onboarding + tenant-scoped admin auth, Phase 2c plan entitlements
(*dormant*), Phase 2d Stripe billing adapter (*built, inert*), Phase 2e super-admin
console. The central-DB integration that CLAUDE.md lists as a future Phase 0 step
already exists: `lib/db/src/central.ts`, `lib/db/src/central-queries.ts`,
`lib/db/src/provision.ts`, and a `shouldReadCentral` feature flag in
`api-server/src/lib/tenant.ts`. Halls Head literals are down to ~48 files (from 77).

So: **billing and entitlements are live in the server but switched off; stats reads
are mid-migration from local tables to central-DB-filtered-by-club_id behind a flag.**

## Hard constraints — do not break

- **OpenAPI-first** workflow (above). Never hand-edit generated files.
- **Juniors isolation:** junior_* tables, `/api/juniors/*` only, never blended with
  seniors. Holds per-tenant. (See `replit.md`.)
- **Fill-in exclusion:** `player_id >= 90000` = fill-in player, excluded from all
  derivations.
- **One ingestion method per (grade, season).** No mixing.
- **Curated club content is the moat** (honour boards, life members, awards, ToD,
  caps, committee, social cards). Tenant-scope it; NEVER replace it with central data.
- **Tenant isolation is the catastrophic-bug surface.** One tenant must never read
  another's data. Tests exist (`tenant-isolation.test.ts`, `admins-isolation.test.ts`,
  `platform-admin-*.test.ts`) — extend them whenever you touch a read path.
- **Central DB is READ-ONLY from the app.** Never write to it.
- **Data governance:** deep scorecards were scraped for the pilot. Keep ingest behind
  a clean adapter boundary. Do NOT commercialise on scraped data; pilot/non-commercial
  framing until partner/licence access (PlayHQ partner / Fixtura) is secured.

## Known gaps / watch-outs

- **No frontend or mobile tests.** ~58k LOC of UI is unguarded. All 22 test files are
  backend. A thin smoke-test layer on critical pages is the cheapest win.
- **No README.** Knowledge is split across CLAUDE.md / replit.md / `.agents/memory/`.
- **Dormant code rots.** Billing + entitlements are inert in a live server; treat with
  care, they aren't exercised by normal use.
- **Dual-read boundary (local vs central DB)** is the highest-risk area for *silent*
  data disagreement. Funnel all central reads through `central-queries.ts`; guard with
  consistency tests (`*-consistency.test.ts` already exist — extend per flipped read).
- **Roadmap docs lag the code** — reconcile before relying on them for sequencing.

## Where things live (quick index)

- Tenant/brand resolution: `api-server/src/lib/tenant-brand.ts`, `lib/tenant.ts`,
  `middlewares/tenant-context.ts`
- Central DB: `lib/db/src/central.ts`, `central-queries.ts`, `provision.ts`
- Auth/seeding: `api-server/src/lib/auth.ts` (seeds demo admin + platform super-admin)
- Billing (inert): `api-server/src/routes/billing.ts`, `lib/billing.ts`,
  `lib/entitlements.ts`
- Player identity crosswalk (app int id ↔ PlayHQ GUID): `schema/player_id_map.ts`
- App entry: `api-server/src/app.ts` (middleware wiring) → `index.ts`
