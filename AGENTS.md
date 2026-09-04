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
lib/                  ← shared toolkits
  api-spec/           ← openapi.yaml (single 10.4k-line contract, ~215 operations) — SOURCE OF TRUTH for the API
  api-client-react/   ← GENERATED from openapi.yaml (React Query hooks) — do not hand-edit
  api-zod/            ← GENERATED from openapi.yaml (Zod validators) — do not hand-edit
  db/                 ← Drizzle schema (47 tables) + central DB connection/queries
  scorecard/          ← shared match→scorecard view-model, used by web AND mobile
  object-storage-web/ ← image/file upload helpers
scripts/              ← maintenance / data scripts (incl. central-DB compare & seed)
docs/                 ← playcricket-ingestion.md; solutions/ = documented learnings
                        (bugs, patterns, conventions; frontmatter: module, tags, problem_type)
.agents/memory/       ← 60+ assistant-facing knowledge notes (rich but not human-facing)
CONCEPTS.md           ← shared domain vocabulary (entities, processes, status concepts) —
                        relevant when orienting to the codebase or discussing domain terms
```

Architecture in one line: **contract-first design — one OpenAPI spec generates the
glue between a React website, a React Native app, and an Express+Postgres backend —
now reading shared stats from a central association DB filtered per tenant.**

## How to run / build (commands)

- Package manager is **pnpm only** (preinstall hook blocks npm/yarn); Node 22 (`.nvmrc`).
- Typecheck everything: `pnpm run typecheck` (strict TypeScript: `strict`,
  `noUnusedLocals`, `noImplicitOverride` in `tsconfig.base.json`)
- Lint / format: `pnpm run lint`, `pnpm run format:check` (ESLint flat config + Prettier
  at the root)
- Build everything: `pnpm run build` (typechecks first)
- Database: `pnpm --filter @workspace/db run migrate` applies `lib/db/migrations`
  (baselines a database that was built with `push`); after editing
  `lib/db/src/schema`, run `... run generate` and commit the migration. CI fails on a
  schema edit without its migration. `push` is for local experiments only.
- API server: `pnpm --filter @workspace/api-server run dev` · tests: `... run test`
  (vitest, real Postgres — see README for the env vars)
- Website: `pnpm --filter @workspace/cricket-club run dev` · tests: `... test`
- Mobile: `pnpm --filter @workspace/cricket-mobile run start` (plain `expo start`; the
  `dev` script is the Replit-proxied variant)
- Library unit tests: `pnpm run test:libs`
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
- **TypeScript** with most strict flags on (see `tsconfig.base.json`; `strict: true` is a
  plan.md follow-up), explicit return types, `import type`, ESLint enforced in CI, functional React +
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
- **Central DB is READ-ONLY from the app.** Never write to it. The proxy blocks
  insert/update/delete/transaction/$client; point `CENTRAL_DATABASE_URL` at a
  SELECT-only role (plan.md §2.6).
- **Stats reads fail closed.** Only tenant #1 may read the native stats tables; any
  other tenant is served from central or gets a 409, and `CENTRAL_READS=0` makes
  central tenants 503 rather than falling back to Halls Head's data.
- **Data governance:** deep scorecards were scraped for the pilot. Keep ingest behind
  a clean adapter boundary. Do NOT commercialise on scraped data; pilot/non-commercial
  framing until partner/licence access (PlayHQ partner / Fixtura) is secured.

## Known gaps / watch-outs

- **Test coverage is uneven.** ~70 API suites (real Postgres), ~30 web suites (hermetic
  smoke + logic), lib/db + lib/scorecard + scripts unit suites (mocked), and **no mobile
  tests**. The `*-consistency.test.ts` and `honour-display-kiosk.test.ts` suites still
  need the demo club's full history and are skipped in CI (`CI_SKIP_DATA_TESTS`).
- **CI** (`.github/workflows/ci.yml`): Typecheck (+ codegen drift + migration drift),
  Lint, Build (api-server + website), Library unit tests, Web smoke tests, API
  integration tests. The API job builds its throwaway Postgres from the migrations
  (`migrate` → `ensure-constraints` verifier → `migrate` again for idempotency), seeds
  tenant #1, and gives the same database an empty `central` schema plus a small fixture
  (`seed-ci-central-fixture.ts`) — no live central-DB secret is used in CI.
- **Per-process state assumes ONE api-server instance.** Tenant config, brand, host
  directory, central-query and milestone caches, the card-video job map and the
  rate-limit store are all in-memory; `invalidateTenantConfigCache` only reaches the
  local process. Every cache is TTL-bounded (≤ 10 min) so a second instance would be
  *eventually* consistent, but do not autoscale beyond one instance without moving
  invalidation to Postgres `LISTEN/NOTIFY` and the job map to a table (plan.md §5.12).
- **Dormant code rots.** Billing + entitlements are inert in a live server; treat with
  care, they aren't exercised by normal use.
- **Dual-read boundary (local vs central DB)** is the highest-risk area for *silent*
  data disagreement. Funnel all central reads through `central-queries.ts`; guard with
  consistency tests (`*-consistency.test.ts` already exist — extend per flipped read).
- **Roadmap docs lag the code** — reconcile before relying on them for sequencing.

## Where things live (quick index)

- Tenant/brand resolution: `api-server/src/lib/tenant-brand.ts`, `lib/tenant.ts`
  (`dataSource(req)` = the ONE fail-closed decision every stats read goes through;
  `isCentralTenant` is the raw flag for tenant-scoped surfaces such as juniors),
  `middlewares/tenant-context.ts`
- Environment: `api-server/src/config.ts` — every variable is an `env.*()` accessor,
  validated at boot; ESLint forbids `process.env` elsewhere in the server.
  `.env.example` lists them all.
- Central DB: `lib/db/src/central.ts` (lazy, read-only proxy, verified TLS via
  `CENTRAL_DB_SSL`), `central-queries.ts` (barrel over `lib/db/src/central/*`),
  `provision.ts`. Both pools connect on first use (`getDb`/`getCentralDb`,
  `closeDb`/`closeCentralDb` for shutdown).
- Schema + migrations: `lib/db/src/schema/*` (constraints, indexes and CHECKs are
  declared here), `lib/db/migrations/*` (generated; `0001_reconcile_pushed_databases`
  is hand-written), `lib/db/src/migrate.ts` (runner + baseline),
  `scripts/src/ensure-constraints.ts` (read-only verifier).
- Knowledge stores — three, with distinct audiences: `.agents/memory/` is
  **agent-only** working notes (may lag; this file wins on conflict), `docs/` is
  **human-facing** (plans, follow-ups, product review), `CONCEPTS.md` is the shared
  **vocabulary**. `plan.md` is the improvement plan this codebase is being worked
  through. Tooling metadata you can ignore unless you are changing it: `.design-sync/`
  (design-token sync config), `.mcp.json` (MCP servers for assistants),
  `skills-lock.json` (installed assistant skills).
- Replit-only pieces: `.replit`, `replit.nix`, `scripts/post-merge.sh` (runs migrate +
  verifier + reconcile/backfill scripts after each pull), mobile `scripts/build.js` +
  `server/serve.js` (static Expo web build served behind Replit's proxy).
- Auth/seeding: `api-server/src/lib/auth.ts` (seeds demo admin + platform super-admin;
  sessions carry a `session_epoch` so password changes and `POST /auth/logout-all`
  revoke them)
- Scripts: `scripts/README.md` (inventory + `--tenant` / `--dry-run` guard rails)
- Billing (inert): `api-server/src/routes/billing.ts`, `lib/billing.ts`,
  `lib/entitlements.ts`
- Player identity crosswalk (app int id ↔ PlayHQ GUID): `schema/player_id_map.ts`
- App entry: `api-server/src/app.ts` (middleware wiring) → `index.ts`
