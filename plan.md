# Ovation — Codebase Improvement Plan

> Produced from a read-only review of the whole repository on 3 Sep 2026.
> No code was changed. Every finding below was verified by reading the referenced
> file; line numbers refer to `main` at commit `6cb41ee`.
>
> Companion docs: `AGENTS.md` (orientation), `CLAUDE.md` (white-label strategy),
> `replit.md` (inherited data model). This plan does not restate the product roadmap;
> it lists engineering debt and risk, ordered so that the most dangerous items are
> fixed first and each later phase builds on the earlier ones.

---

## 0. Snapshot

| Area | Size | Tests |
|---|---|---|
| `artifacts/api-server` | 177 files, 41.6k lines, 93 route modules | 70 test files (real Postgres) |
| `artifacts/cricket-club` | 379 files, 85.4k lines, 66 page files | 30 test files (hermetic) |
| `artifacts/cricket-mobile` | 41 files, 7.7k lines | 0 |
| `artifacts/mockup-sandbox` | 63 files, 6.4k lines | 0 (empty scaffold) |
| `lib/db` | 65 files, 7.8k lines (`central-queries.ts` alone is 3,646) | 2 files, **never run in CI** |
| `lib/scorecard` | 11 files, 2.0k lines | 1 file, **never run in CI** |
| `lib/api-spec` | `openapi.yaml` 12,917 lines, 258 operations | – |
| `scripts` | 30 TS files, 11 SQL files | 1 file, **never run in CI** |
| `attached_assets` | 287 MB tracked (13 SQL dumps, 10 SQLite DBs) | – |
| `docs/product-review/evidence` | 185 MB tracked (37 `.webm` recordings) | – |

Cross-cutting facts:

- No ESLint, Biome, Prettier config, `.editorconfig`, or lint job exists anywhere.
  18 `eslint-disable` comments in the web app are decorative.
- No Drizzle migrations directory; schema is applied with `drizzle-kit push` plus a
  hand-written `ensure-constraints` script.
- ~35 distinct `process.env.*` variables are read across ~25 files. There is no
  `.env.example` and no validated config module.
- Only three CI jobs run (typecheck, web smoke tests, API integration tests). No build,
  lint, lib-test, or audit job.
- Overall quality is good: Express 5 async errors, pino with redaction, zod-from-OpenAPI
  on nearly every body, bcrypt, timing-safe HMAC sessions, bounded pools, a proxied
  read-only central DB, tenant fail-closed resolution. The items below are the gaps.

---

## 1. Executive summary — the ten things to do first

| # | Item | Why | Effort |
|---|---|---|---|
| 1 | Centralise the native-stats fail-closed guard (§2.1) | `CENTRAL_READS=0` or a mis-set tenant row serves Halls Head data under another club's brand | S |
| 2 | Purge club database dumps (incl. 693 named junior participants) from git history (§2.2) | Children's names and `is_private` flags are in a public-ish repo; 256 MB of dead weight | M |
| 3 | Neutralise tenant-blind destructive scripts (§2.3) | `seed.ts` truncates the stats core; `seed-committee.ts` deletes every tenant's committee | S |
| 4 | Auth-gate `GET /imports` and throttle `POST /tracked-links` (§2.4, §2.5) | Unauthenticated data exposure and unbounded inserts | S |
| 5 | Make the central connection truly read-only (§2.6) | Proxy blocks `insert/update/delete` but not `execute`/`transaction`; DB role is a superuser | S |
| 6 | Run every test in CI, including the skipped provisioning suites (§3.1) | `lib/db`, `lib/scorecard`, `scripts` tests never run; signup path is green-washed | S–M |
| 7 | Stop passing the live Supabase URL to PR runs; make pools lazy (§3.2) | Secret exposure and fork PRs always fail | S |
| 8 | Session revocation (§3.3) | Password change or admin removal leaves 30-day cookies valid | S–M |
| 9 | Add a build job, lint, Prettier, `.env.example`, version pins (§4) | The deploy bundle is never exercised before Replit; no style enforcement | S |
| 10 | Replace `xlsx@0.18.5` in the server (§3.5) | Known CVEs, parses admin uploads | S–M |

---

## 2. P0 — safety, privacy, and tenant isolation

### 2.1 Native-stats fallback leaks Halls Head data to other tenants

**Where.** `artifacts/api-server/src/lib/tenant.ts:59-68` defines
`NativeStatsUnavailableError`, but it is thrown only in
`routes/milestones.ts:119-120`. The other 60 `shouldReadCentral(req)` branches
(`grades.ts:47,54`, `players.ts`, `stats.ts`, `matches.ts`, `records.ts`,
`historical.ts`, `juniors*.ts`, `lib/honour-display-builders.ts:1736`) fall through to
the native, tenant-1-only tables.

**Why it matters.** `tenants.reads_from_central` defaults to `false`
(`lib/db/src/schema/tenants.ts:53`). `provisionTenant` sets it true, but a hand-inserted
row, a future "mode", or the `CENTRAL_READS=0` kill switch
(`tenant.ts:159,184`) flips every tenant to native reads. The kill switch is currently a
leak switch: it reproduces the documented "Mandurah leak" for all central tenants at once.

**Fix.**
1. In `shouldReadCentral` and `tenantReadsFromCentral`, throw
   `NativeStatsUnavailableError` when `!readsFromCentral && tenantId !== NATIVE_STATS_TENANT_ID`.
2. Make `CENTRAL_READS=0` return 503 for central tenants instead of native reads.
3. Add a case to `routes/central-leakage.test.ts` for a tenant with
   `reads_from_central=false`, and one for `CENTRAL_READS=0`.
4. Follow-up (§5.2): replace the ~60 copy-pasted branches with one `dataSource(req)`
   helper so the guard lives in a single place.

**Effort** S. **Acceptance:** leak test fails on `main`, passes after; all 61 branch
sites route through the guard.

### 2.2 Club database dumps with junior participant data are committed

**Where.** `attached_assets/` holds seven generations of
`halls_head_cricket_postgres_*.sql` (14–22 MB each), three
`halls_head_juniors_postgres_*.sql` (~25 MB each), and ten `.db` SQLite files. The
juniors dump defines `junior_participants(display_name, is_private, …)` with 693 named
children, six flagged private. `.git` is 193 MB, mostly these.

**Why it matters.** Privacy obligation under the data-governance constraint in
`CLAUDE.md`, plus clone time and CI checkout cost.

**Fix.**
1. Move the dumps to object storage or the Supabase project; document the location in
   `scripts/README.md` (§6.4).
2. Move the two xlsx fixtures used by `api-server/src/routes/imports-batch.test.ts:12-13`
   to `artifacts/api-server/src/test/fixtures/`.
3. Rewrite history with `git filter-repo` to drop `attached_assets/*.{sql,db,zip}`;
   coordinate with all clone holders (force-push, re-clone).
4. Add `attached_assets/*.sql`, `*.db`, `*.zip` and root `.env*` to `.gitignore`.
5. Same treatment for `docs/product-review/evidence/*.webm` (154 MB): Git LFS or
   external links.

**Effort** M (mostly coordination). **Acceptance:** fresh clone under 40 MB; no
`junior_participants` rows anywhere in history.

### 2.3 Tenant-blind destructive scripts

**Where.**
- `scripts/src/seed.ts:11` — `TRUNCATE player_grade_stats, grade_summaries, players
  RESTART IDENTITY CASCADE`, no confirmation, exposed as `pnpm --filter
  @workspace/scripts run seed` (`scripts/package.json:8`).
- `scripts/src/seed-committee.ts:150` — `db.delete(clubRolesTable)` with no tenant
  filter on a tenant-scoped table.
- `scripts/src/seed-awards.ts`, `seed-nav-items.ts`, `seed-card-audio.ts`,
  `load-award-history.ts` — zero `tenantId` references; rely on `DEFAULT 1`.
- `scripts/sql/master-etl.sql:86-418`, `juniors-etl.sql:74-80`,
  `matches-etl.sql:131-142,456,523`, `pack-a-standard-migration.sql:25-29` — wholesale
  `DELETE FROM` on curated tables with no tenant predicate.
- `fix-a-grade-cap-duplicates.ts:195,264`, `remove-a-grade-2025-26.ts:385,452` —
  grade-wide deletes on the stats core.

**Fix.**
1. Delete `seed.ts` and its npm script.
2. Move the single-tenant ETLs and one-offs to `scripts/legacy/` with a banner
   comment stating they assume a one-club database and must not run against the shared DB.
3. Add `scripts/src/lib/cli.ts` providing a required `--tenant=<id>`, `--dry-run`, and
   a host echo plus confirmation when `DATABASE_URL` is not localhost. Adopt it in every
   remaining seed script; filter every `delete` by tenant.

**Effort** S. **Acceptance:** no script in `scripts/src` performs a delete/truncate
without a tenant predicate; `grep -L tenant scripts/src/seed-*.ts` is empty.

### 2.4 `GET /imports` is unauthenticated and unscoped

**Where.** `artifacts/api-server/src/routes/imports.ts:112-130` selects from
`importsTable` (a native, tenant-1-only table) with no `requireAdmin`, no
`shouldReadCentral` guard, and no tenant filter. Any visitor on another tenant's host
sees Halls Head's import filenames, grades, seasons.

**Fix.** Add `requireAdmin` and the §2.1 guard. Add a tenant-isolation test.
**Effort** S.

### 2.5 `POST /tracked-links` is public, unthrottled, unbounded

**Where.** `routes/social-drafts.ts:229-246`: no auth, no rate limiter, inserts one row
per call with caller-controlled `label/engine/platform` strings of unbounded length.

**Fix.** Rate-limit by IP, cap string lengths with a zod schema from the spec, dedupe on
`(tenant_id, target_url, engine, platform)`, or require an admin/captain session if the
share flow permits it. **Effort** S.

### 2.6 Central DB is read-only by convention only

**Where.** `lib/db/src/central.ts:59,78-88` blocks `insert|update|delete` on the Drizzle
proxy but passes `execute`, `transaction`, and `$client` through (raw `execute` is used
at `central-queries.ts:537,1084`). The connection string documented in `CLAUDE.md` uses
the `postgres.<ref>` superuser role; no read-only role exists.

**Fix.**
1. Create a `central_ro` Postgres role: `GRANT USAGE ON SCHEMA central`, `GRANT SELECT
   ON ALL TABLES IN SCHEMA central`, `ALTER ROLE central_ro SET
   default_transaction_read_only = on`. Point `CENTRAL_DATABASE_URL` at it.
2. Extend `BLOCKED_WRITE_METHODS` with `transaction`, `$client`,
   `refreshMaterializedView`; expose a `centralExecuteReadOnly` wrapper for the two raw
   reads.
3. Add `pool.on("error", …)` handlers to both pools (`index.ts`, `central.ts`) — an idle
   client error from the remote pooler is currently an unhandled event.

**Effort** S. **Acceptance:** a test proves `centralDb.execute(sql\`insert …\`)` is
rejected by Postgres, not just by the proxy.

### 2.7 Schema guarantees for tenant identity

**Where.** `lib/db/src/schema/`:
- `admins.tenantId` (`admins.ts:113`) and `admin_password_resets.tenantId` (`:27`) are
  bare integers without an FK to `tenants.id`.
- `tenants.centralClubId` (`tenants.ts:51`) and `tenants.customDomain` (`:71`) are not
  unique, yet `tenant-context.ts:121` builds a `Map(customDomain → id)` (last write wins)
  and `provision.ts:144-153` uses check-then-insert to detect "club already claimed".
- `grade_summaries.grade` is globally unique (`grade_summaries.ts:7`) — physically
  cannot hold two tenants.

**Fix.** Add the FKs; add a partial unique index on `custom_domain WHERE custom_domain
IS NOT NULL` and a unique on `central_club_id`; register both in `ensure-constraints.ts`
until migrations exist (§5.4). **Effort** S.

---

## 3. P1 — correctness, CI integrity, and security hardening

### 3.1 Tests that never run

**Where.**
- `lib/db/src/central-queries.test.ts` (starts with `// @ts-nocheck`),
  `lib/db/src/provision.test.ts`, `lib/scorecard/src/match-summary-input.test.ts`,
  `scripts/src/topup-clubs.test.ts` — no `test` script or vitest dependency in those
  packages; CI runs only `cricket-club` and `api-server`.
- `artifacts/api-server/vitest.config.ts:15-20` excludes `platform-signup`,
  `platform-admin-tenants`, `platform-admin-available-clubs`,
  `provisioning-exclusions` under `CI_SKIP_DATA_TESTS` because provisioning "returns 500
  in CI (a known provisioning bug to investigate)". The self-serve signup path has zero
  CI coverage.
- The `*-consistency.test.ts` suites (the local-vs-central drift guard called out in
  `CLAUDE.md` as the top correctness risk) are also in the skip list.

**Fix.**
1. Root `vitest.workspace.ts` covering `lib/**` and `scripts/**`; add `vitest` to those
   packages; CI job `pnpm -r --if-present test`.
2. Remove `@ts-nocheck` by excluding `*.test.ts` from lib declaration builds
   (`lib/*/tsconfig.json` currently `include: ["src"]`) or adding vitest types.
3. Root-cause the provisioning 500 in CI. Most likely cause: the suites need a
   `central` schema. Seed a minimal `central` schema fixture (a handful of clubs, players,
   matches) into the CI Postgres so those suites and the consistency suites can run
   against a deterministic dataset. Track as a GitHub issue until closed.
4. Nightly workflow running the data-dependent suites against a populated snapshot.

**Effort** S for 1–2, M for 3–4.

### 3.2 CI secret exposure and connect-on-import

**Where.** `.github/workflows/ci.yml:104-106` passes `secrets.CENTRAL_DATABASE_URL`
(live Supabase URL with password) into every `pull_request` run because
`lib/db/src/central.ts:27-35` and `lib/db/src/index.ts:8-12` throw at import when the
variable is unset. Fork PRs receive an empty secret and the API job always fails.

**Fix.**
1. Lazy pool creation: `getDb()` / `getCentralDb()` memoised on first use; keep the
   named `db` export as a lazy getter proxy to avoid touching 100+ call sites.
2. Point CI's `CENTRAL_DATABASE_URL` at the local service Postgres with the §3.1 fixture
   schema. Remove the secret from PR runs entirely.
3. Add `permissions: contents: read` and `timeout-minutes` to the workflow.

**Effort** S. Unblocks §3.1 and fork contributions.

### 3.3 Session revocation

**Where.** `lib/auth.ts:34-37,78` — sessions are HMAC(payload with `issuedAt`) valid
30 days. Password change (`routes/admins.ts:87-91`), platform reset
(`platform-admin.ts:598`), self-service reset (`routes/auth.ts:164-167`), and tenant
suspension only clear the browser cookie or the local cache.

**Fix.** Add `admins.session_epoch` (and the same for captains and platform admins);
bump it on password change, reset, removal, and suspension; reject tokens whose
`issuedAt` predates it in `middlewares/require-admin.ts:23-32`. Add "log out
everywhere". Collapse the three near-identical encode/decode pairs in `lib/auth.ts`
(L58-83, L194-222, L297-325) into one generic `signToken<T>()`. **Effort** S–M.

### 3.4 Host and proxy header trust

**Where.** `middlewares/tenant-context.ts` `hostOf()` prefers the left-most
`X-Forwarded-Host` from any client; safety rests on Replit's edge rewriting it.
`x-ovation-proxy-key` is compared with `===`. `x-tenant-id` is honoured on published
`*.replit.app` hosts (~L214-217).

**Fix.** Honour `X-Forwarded-Host` only when `PROXY_SHARED_SECRET` matches or behind an
explicit `TRUST_FORWARDED_HOST=1`; use `crypto.timingSafeEqual`; restrict the dev tenant
switcher to `.replit.dev` / localhost. **Effort** S.

### 3.5 `xlsx@0.18.5`

**Where.** Root `package.json:29` (dead, nothing at root imports it),
`artifacts/api-server/package.json:31` (used by `lib/match-scorecard.ts:239` on admin
uploads), `scripts/package.json:41`. The npm line is abandoned; CVE-2023-30533 and
CVE-2024-22363 are fixed only on the vendor CDN.

**Fix.** Remove the root dependency. In the server, switch to `exceljs` or pin the
vendor tarball (≥0.20.2) by URL with integrity. Scripts may keep it (offline use).
**Effort** S–M.

### 3.6 Provisioning is not transactional and clobbers branding

**Where.** `lib/db/src/provision.ts:174-186` inserts the tenant and mints the crosswalk
in separate statements; `onConflictDoUpdate({ set: values })` at `:180` rewrites
`logoUrl`, `primaryColour: null`, `faviconUrl: null`, `customDomain: null`, `plan` on
every concierge re-run.

**Fix.** Wrap in `db.transaction`; restrict the upsert `set` to identity columns.
Rely on the §2.7 uniques instead of check-then-insert. **Effort** S.

### 3.7 OpenAPI-first drift

**Where.** Five routes have no spec entry: `/player-curation` GET/PUT/DELETE
(`routes/player-curation.ts:28,40,83`), `/social-recaps` (`social-drafts.ts:159`),
`/social-drafts/:id/posted` (`:82`), `/billing/checkout` (`billing.ts:22`). The web app
calls them with raw `fetch` (`pages/admin-social-queue.tsx:80,88`,
`components/share-card-modal/use-captions.ts:47`). `routes/imports.ts` (13 `req.body`
reads) and `routes/social-drafts.ts` (12) use hand-rolled parsing instead of generated
zod. `pages/admin-import.tsx:414-657` re-implements four flows that already have
generated hooks.

**Fix.** Add the missing operations and the import/social-draft bodies to
`openapi.yaml`, regenerate, replace raw fetches with generated hooks, delete
`lib/import-body-parsers.ts` where superseded. Add a CI step that runs codegen and
fails on `git diff --exit-code` so stale generated output cannot merge. **Effort** S–M.

### 3.8 Build job and lint gate

**Where.** `pnpm run build` (esbuild bundle of api-server + `vite build`) never runs in
CI; `build.mjs` externals and `vite.config.ts` env requirements are exercised only on
Replit deploy.

**Fix.** Add a `build` job (`BASE_PATH=/ pnpm run build`). Add a `lint` job once §4.1
lands. Consider a shared composite action for the repeated install steps. **Effort** S.

### 3.9 Web app: error boundary and zoom

- No `ErrorBoundary` anywhere in `artifacts/cricket-club/src`; a render throw in any
  lazy page blanks the app. Add one per `Suspense` in `App.tsx`. **S**
- `index.html:5` sets `maximum-scale=1`, disabling pinch-zoom (WCAG 1.4.4). Remove. **S**
- Pages with no error state (`compare.tsx:18-19`, `honours-kiosk.tsx:142-145`,
  `admin.tsx`, `admin-social-create.tsx`, `platform-admin/branding-card.tsx`,
  `platform-admin/platform-brand.tsx`): add `isError → <QueryError onRetry>`. **S**

### 3.10 Mobile app is single-tenant by construction

**Where.** `artifacts/cricket-mobile` sends no `x-tenant-id`, never calls
`GET /tenant-brand`; `constants/brand.ts:12-18` and `app.json:3` (`"HHCC Mobile"`)
hard-code Halls Head; `constants/colors.ts` hard-codes the amber/navy palette.

**Fix.** Add `setTenantId()` / default-header support to
`lib/api-client-react/src/custom-fetch.ts` (currently `window.localStorage`-only at
`:56-80`); read `EXPO_PUBLIC_TENANT_SLUG` at build time or fetch `/tenant-brand` on boot
and drive `BRAND`/`colors` from it; convert `app.json` to `app.config.ts` parameterised
per tenant (bundle id, package, EAS project). **Effort** M.

### 3.11 Delete `artifacts/mockup-sandbox`

An empty Replit mockup scaffold: `App.tsx:39` loads from `src/components/mockups/`,
which does not exist. What remains is 55 shadcn `ui/*` files (17 identical to, 38
diverged from, `cricket-club/src/components/ui`) and 17 dependencies nothing else uses.
It is typechecked in CI on every run. Delete it; if a scratch area is wanted,
re-scaffold inside `cricket-club` behind a dev route that uses the real primitives.
**Effort** S.

---

## 4. P1 — developer experience foundations

These are cheap and unblock the rest of the plan.

### 4.1 Linting and formatting

Add ESLint flat config at root (`typescript-eslint` recommended-type-checked with
`projectService`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`,
`eslint-plugin-import-x` for `no-cycle` and `no-extraneous-dependencies`; ignore
`**/generated/**`, `dist`). Add `.prettierrc`, `.editorconfig`, `lint`, `format:check`
scripts, and a CI job. Optional `lint-staged` via `simple-git-hooks`.

Two project-specific rules are worth writing:
- `no-restricted-imports` banning `@workspace/db/central` outside
  `lib/db/src/central-queries.ts` (and its future split, §5.1) — mechanically enforces the
  "funnel all central reads" constraint.
- A local rule flagging `db.select()/update()/delete()` chains in
  `api-server/src/routes/**` whose `.where()` does not reference `tenantId` for tables
  listed as tenant-scoped in `lib/db/src/schema/_tenant.ts`.

### 4.2 Config module and `.env.example`

Add `artifacts/api-server/src/config.ts` with a zod schema parsed once at boot, and a
root `.env.example` grouped as: required (`DATABASE_URL`, `CENTRAL_DATABASE_URL`,
`SESSION_SECRET`), tenancy (`PLATFORM_HOSTS`, `PLATFORM_BASE_DOMAIN`,
`DEFAULT_TENANT_ID`, `PROXY_SHARED_SECRET`, `SIGNUP_MODE`), central (`CENTRAL_READS`,
`CENTRAL_CACHE_TTL_MS`, `CENTRAL_POOL_*`), billing (`BILLING_ENABLED`,
`STRIPE_SECRET_KEY`), storage (`PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`),
rendering (`RENDER_HARNESS_URL`, `CHROMIUM_PATH`, `PUPPETEER_EXECUTABLE_PATH`),
seeding (`ADMIN_PASSWORD`, `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`),
Replit-only, scripts (`SEED_TENANT_ID`, `DRY_RUN`). Add a `no-restricted-syntax` rule
forbidding `process.env` outside the config module.

### 4.3 Toolchain pins

Add `"packageManager": "pnpm@10.x"`, `"engines": {"node": ">=22"}`, and `.nvmrc`.
Reconcile README (says pnpm 9), CI (pnpm 10, Node 22), and `.replit` (nodejs-24).

### 4.4 TypeScript strictness

`tsconfig.base.json` sets `strictFunctionTypes: false`, `noImplicitOverride: false`,
`noUnusedLocals: false`, and lacks `noUncheckedIndexedAccess`, while `AGENTS.md`
advertises strict TypeScript and the mobile app already uses `strict: true`. Flip
`strict: true` and `noUnusedLocals` first, fix fallout package by package, then trial
`noUncheckedIndexedAccess` on `lib/*`. Add the missing `scorecard` project reference in
`api-server`, `cricket-club`, and `cricket-mobile` tsconfigs. Unify the test-file
exclusion in `cricket-club/tsconfig.json:4` (currently excludes `*.test.ts` but not
`*.test.tsx`).

### 4.5 Repository hygiene

`.github/dependabot.yml` (pnpm, weekly, grouped minor/patch), `CODEOWNERS`, a PR
template, `SECURITY.md`; `cancel-in-progress` only for pull requests; non-blocking
`pnpm audit --audit-level=high`. Remove the dangling `lib/integrations/*` entry from
`pnpm-workspace.yaml`, the unreferenced `exports/` and `screenshots/` directories,
`scripts/src/hello.ts`, and `maintenance/reset-owner-password.ts` (self-described as
"delete or ignore after testing").

---

## 5. P2 — structure and maintainability

### 5.1 Split `lib/db/src/central-queries.ts` (3,646 lines)

Proposed layout under `lib/db/src/central/`, keeping `central-queries.ts` as a barrel so
the 25 dynamic-import call sites are unchanged:

| Module | Contents (current line ranges) |
|---|---|
| `cache.ts` | `withCentralCache`, TTL, single-flight (307-431) |
| `grades.ts` | `classifyCentralGrade`, `appGradeFromCentral`, season parsing (64-235) |
| `privacy.ts` | one `isPrivateRow()` and one documented masking policy |
| `club-matches.ts` | `getClubMatchRows`, `centralClubMatches`, `centralMatchScorecard`, `centralWeekendWrap` |
| `leaderboards.ts` | `centralGradeLeaderboard`, `centralSeasonLeaders`, `centralAllTimeLeaders`, `centralClubTotalsBySeason` |
| `players.ts` | `centralPlayerCareers/Detail/Seasons/MatchLog`, `centralClubParticipants` |
| `records.ts` | `centralClubRecords`, `centralCenturies`, `centralFiveWicketHauls`, `centralMilestones` |
| `summaries.ts` | `centralGradeSummaries`, `centralClubTotals`, `centralDashboard`, `centralLadder` |

While splitting:
- Replace the nine hand-written `or(eq(homeClubId, clubId), eq(awayClubId, clubId))`
  fragments with `clubInvolvedWhere(clubId)`; the eleven `(p?.isPrivate ?? 0) === 1`
  checks with `isPrivateRow(p)`.
- Standardise on `= any(sql.param(ids))` instead of `inArray` (36 sites) — a club has
  800–1,500 match ids and `inArray` expands to N bind parameters.
- Wrap the eight uncached reads (`listCentralGradesForClub`, `centralClubParticipants`,
  `centralPlayerDetail`, `centralPlayerSeasons`, `centralPlayerMatchLog`,
  `centralMatchScorecard`, `centralClubSeasons`, `centralGradesForSeason`) in
  `withCentralCache`; cache `getClubMatchRows` itself with one key per club.
- Update the stale comment at 397-398 ("no secondary indexes") — indexes were added
  2026-07-09 per `central-schema/matches.ts:106-110`; verify they exist on the live
  Supabase schema and add `match_batting(club_id)` / `match_bowling(club_id)` if missing.
- Document one privacy rule (mask vs omit vs flag; today three patterns coexist).

### 5.2 Collapse the central/native branch in api-server

`if (await shouldReadCentral(req)) { … }` appears ~60 times (14× `juniors.ts`, 13×
`juniors-admin.ts`, 6× `grades.ts`, 5× `stats.ts`, 4× `players.ts`, …). Introduce a
`dataSource(req)` helper returning a discriminated union (`{kind:"central", clubId,
tenantId}` | `{kind:"native"}`) plus a `nativeOnly(emptyShape)` middleware for juniors
endpoints that have no central equivalent. This is where the §2.1 guard should live
permanently.

### 5.3 Split the api-server mega-modules

| File | Lines | Split |
|---|---|---|
| `routes/imports.ts` | 1,787 (handlers of 474, 436, 220 lines) | `imports-csv.ts`, `imports-scorecard.ts`, `imports-batch.ts` sharing `lib/import-commit.ts` (the five commit paths at L401, 569, 1044, 1429, 1705 all do transaction → `recomputeAggregates` → `syncCapsFromStats` → `runPostCommitSocial`) |
| `routes/juniors.ts` | 1,637 | players / matches / leaderboards |
| `routes/juniors-admin.ts` | 1,419 | mirror the juniors split |
| `routes/social-cards.ts` | 1,138 | move `listRoundMatchIds`, `loadMatchDetailForRequest`, `loadGradeLeaderboard` from `routes/matches.ts` and `routes/grades.ts` into `lib/` (routes should not import routes) |
| `lib/honour-display-builders.ts` | 1,951, 66 exports | by board family; pass `tenantId`/`central` explicitly instead of `req` so builders are unit-testable |

Also dedupe: `isEmail`/`slugTaken` (`platform.ts:42-47` vs `platform-admin.ts:62-67`),
`serialize(admin)` vs `serializeAdmin`, `normaliseGrades` (`captains.ts:46` vs
`award-voting.ts:97`). Move `runPostCommitSocial` off the request path into a job table
with a worker (imports currently run whole-grade delete+insert, cap sync, and social
generation inside one 30-second `statement_timeout`).

### 5.4 Migrations instead of `drizzle-kit push`

No `migrations/` directory exists; CI runs `push-force`; composite uniques are kept out
of the Drizzle schema to dodge a drizzle-kit 0.31 introspection bug (`matches.ts:21-25`,
`admins.ts:106-110`, `cap_register.ts`) and re-applied by `ensure-constraints.ts`, so
schema-as-code is intentionally incomplete and drift is undetectable.

**Fix.** Upgrade `drizzle-kit` (1.x fixes composite unique introspection), run
`drizzle-kit generate` to produce migration 0000 from the current schema, fold
`ensure-constraints.ts` into 0001, and switch CI and `post-merge.sh` to `migrate()`.
Add `index("<t>_tenant_idx").on(t.tenantId)` to every tenant-scoped curated table
(today only two junior tables have one) and indexes on the unindexed FK columns
(`premiership_players.premiership_id`, `junior_match_*.match_id`,
`player_images.player_id`, `cap_register.player_id`). Convert comment-only value sets
(`tenants.plan`, `imports.kind/status`, `social_drafts.status`, `awards.mechanism`,
`nav_items.surface`, `card_layouts.card_kind`, `clubs.type/role`) to `CHECK` constraints.

### 5.5 Web app bundle and code-splitting

- `pages/admin-groups.tsx:5-35` statically imports all 31 admin pages and all four
  `lazyNamed` calls in `App.tsx:64-79` point at that one module, so any admin tab
  downloads every admin page plus `share-card.ts`, `card-layout-editor`, jszip. Make each
  `TabsContent` lazy or split admin-groups into four files.
- Public pages (`records.tsx:21`, `grade-leaderboard.tsx:11`, `match-detail.tsx:16`,
  `player-detail.tsx:23-25`, `components/honour-boards/milestone-cards.tsx:7-8`) import
  `share-card-modal` eagerly, which pulls the whole canvas renderer. Keep `ShareButton`
  tiny and `React.lazy` the modal behind the click; same for `TradingCardModal`.
- `lib/sticker-library.ts` calls `react-dom/server` `renderToStaticMarkup` at module
  init; lazy-import it from the editor.
- Remove the duplicate Google Fonts load (`index.html:39` link and `src/index.css:1`
  `@import` — the import is render-blocking).
- Add `loading="lazy" decoding="async"` and intrinsic sizes to the 64 `<img>` tags.
- Add `rollup-plugin-visualizer` output as a CI artifact and a `chunkSizeWarningLimit`.
- Default `BASE_PATH="/"` in `vite.config.ts:12-32` so local `vite build` works.

### 5.6 Split the giant web files

| File | Lines | Split |
|---|---|---|
| `lib/share-card.ts` | 4,311 (68 exports, 35 importers) | `share-card/{types,theme,draw-primitives,layers,renderers/*,compose,export,animation-consts}.ts` with a barrel |
| `pages/admin-honours-display.tsx` | 2,479 (`SettingsForm` 950 lines, 18 `useState`) | editors to `components/honours-display/editors/*.tsx`; `useHonoursDisplaySettings` hook |
| `components/card-layout-editor.tsx` | 2,055 | one file per component under `components/card-layout-editor/` |
| `pages/admin-import.tsx` | 1,829 (16 `useState`, 7 `key={index}` on editable rows) | `use-csv-import`, `use-xlsx-import`, `use-batch-import` hooks; rows to `components/admin-import/` |
| `components/share-card-modal.tsx` | 1,431 (25 `useState`, 12 `useEffect`) | finish the existing `share-card-modal/` hooks dir |
| `pages/admin-social-sets.tsx` | 1,365 | `components/social-sets/{set-list,set-editor,sources/*}` |
| `lib/pack-render.ts` | 1,358 | `pack-render/{html-utils,bind,tokens,render}.ts` |
| `pages/admin-junior-stats.tsx` | 1,221 (42 `useState`) | generic `InningsTable<T>`; `components/junior-stats/` |

Junior/senior page pairs are copy-paste (`admin-committee` vs `admin-junior-committee`
share 346 identical lines; `admin-match-display` pair 192; `premierships` pair 187).
Juniors isolation is an API invariant, not a reason for duplicate UI: parameterise the
page component by hooks and types.

### 5.7 Shared logic between web and mobile

`cricket-mobile/lib/honour-boards.ts` (257 lines) is a fork of
`cricket-club/src/lib/honour-boards.ts` (843) and has already drifted (board rename,
subtitles); `cricket-mobile/lib/use-nav.ts` mirrors the web's `use-nav.ts` by its own
comment. Tier thresholds are club policy and will diverge silently. Move the pure
honour-board maths and nav resolution into `@workspace/scorecard` (or a new
`lib/honours`) and import from both. Also export `FILL_IN_THRESHOLD = 90000` from one
place (duplicated in `lib/scorecard/src/mapping.ts:21` and the server).

### 5.8 Finish the brand sweep

User-visible remnants:
- `pages/admin-junior-stats.tsx:323,350,708,1007,1064` — "Result (Halls Head)",
  "Halls Head batted first", "Halls Head roster" shown to every tenant admin.
- `pages/admin-import.tsx:1079` header "Halls Head".
- Cookie names `hhcc_session` / `hhcc_captain_session` (`api-server/src/lib/auth.ts:24-25`).
- MP4 download filenames `hhcc-<kind>-<size>.mp4` (`lib/card-video-jobs.ts:70`).
- `components/scorecard/player-stats-modal.tsx:79-168` — 14 inline hex colours from the
  old HHCC scheme, ignoring dark mode and tenant brand.
- `pages/juniors-players.tsx:257-354` — `text-[#bc8c6b]` ×13 → `var(--juniors-accent)`.
- `components/card-layout-editor.tsx:81-83` — Gold/Cream/Brown swatches → from `useBrand()`.
- `openapi.yaml:6` `info.description: Halls Head Cricket Club Stats API` (propagates
  into every generated file header); `hhccScore`/`hhBattedFirst` fields (11 occurrences)
  → `clubScore`/`clubBattedFirst` with a one-line column rename
  (`matches.ts:61,69`).
- `lib/scorecard/src/types.ts:27` `ScorecardTeam.isHallsHead` → `isTenantClub`; drop the
  deprecated `HALLS_HEAD_*` exports from `index.ts:22-30` after the sweep.
- Per-tenant OG/social meta (`index.html:6-8` TODO): link previews show "Ovation" for
  every club. Needs a server-side HTML rewrite in the API static handler.
- Mobile: `constants/brand.ts`, `app.json`, `lib/onboarding.ts:6` storage key.

### 5.9 Accessibility

- Five hand-rolled modals (`plaque-lightbox.tsx:140`,
  `scorecard/player-stats-modal.tsx:85`, `junior-senior-link-dialog.tsx:61`,
  `admin-players.tsx:529`, `admin-junior-players.tsx`) have no `role="dialog"`,
  `aria-modal`, focus trap, or Escape handling. Replace with the Radix `ui/dialog`.
- 102 of 120 raw `<select>` and most of 92 raw `<input>` elements lack `id`/`aria-label`
  linkage; 35 of 73 icon-only buttons lack a name (14 in `admin-honours-display.tsx`).
- `pages/player-detail.tsx:618` uses `<tr onClick={() => window.location.href = …}>`
  (not keyboard reachable, forces a full reload). Use `<Link>`.
- Add `vitest-axe` to the smoke suite so regressions are caught automatically.

### 5.10 Web test coverage

Existing infrastructure (`test/render.tsx`, `mock-api.ts`, `setup.ts`) is solid. Gaps:
`player-detail`, `match-detail`, `grade-leaderboard`, `stat-detail`, every `juniors-*`
page, `compare`, the `App` router (auth gating, `KioskGate`, the 20 legacy `/admin/*`
redirects at `App.tsx:130-190`), and the `admin-import` CSV/XLSX/batch → revalidate →
commit flow — the highest-risk data-mutation UI has no tests. Add
`brand-context.applyBrandTheme` tests and a dark-mode anti-flash parity test against
`index.html:15-30`.

### 5.11 API test coverage

Route modules with no test referencing their paths: `/admins` CRUD, `/caps`,
`/team-of-decade`, `/records-leaderboards`, `/tour-content`, `/social-prefill`,
`/platform/storage`, `/imports/batch`, `/trading-card-settings`. Minimum: one
tenant-isolation test per curated table following the `tenant-isolation.test.ts`
pattern. Move the repeated `process.env.SESSION_SECRET` setup into a shared
`test/setup.ts`.

### 5.12 Operations

- `/readyz` that runs `SELECT 1` on both pools with a 2 s timeout
  (`routes/health.ts:6-9` is static today).
- `SIGTERM`/`SIGINT` handler in `index.ts`: `server.close()`, `pool.end()` for both
  pools, `closeBrowser()` (exported from `card-video-renderer.ts:350`, never called).
- Attach `tenantId` to the request logger after `tenantContext`.
- Per-process state under autoscale: tenant config cache (`tenant.ts:77`), brand cache,
  host directory, central cache, milestones cache, `card-video-jobs.ts:24` job map,
  rate-limit store. `invalidateTenantConfigCache` on suspend only reaches the local
  instance. Either pin to a single instance and document it, or move config invalidation
  to Postgres `LISTEN/NOTIFY` and the job map to a table.
- Make `getBillingProvider()` throw when `BILLING_ENABLED=true` and no real provider is
  configured; return 404 from `/billing/webhook` while disabled (today it returns 200 to
  any unauthenticated POST). Remove the unused `express.urlencoded` parser.
- Explicit `ssl: { rejectUnauthorized: true }` on the central pool instead of relying on
  `?sslmode=require` in the secret.

### 5.13 Documentation

- `AGENTS.md:96-98` says "No frontend or mobile tests… All 22 test files are backend";
  reality is 30 web, 70 API, 3 lib, 1 scripts. `AGENTS.md` says 35 tables, `CLAUDE.md`
  says 33. README says pnpm 9. `.agents/memory/hhcc-brand-source-of-truth.md`
  contradicts `lib/scorecard/src/brand.ts:79-109`. Reconcile and make `AGENTS.md` the
  single "current state" document.
- Add `scripts/README.md` with the inventory (recurring post-merge, central tooling,
  legacy single-tenant seeds, ad-hoc SQL) and the §2.3 safety rules.
- State the rule for the three knowledge stores: `.agents/memory` = agent-only,
  `docs/solutions` = human-facing, `CONCEPTS.md` = vocabulary. Mention `.design-sync/`,
  `.impeccable/`, `.mcp.json`, `skills-lock.json` in `AGENTS.md`.
- Document the Replit-only pieces (`.replit`, `replit.nix`, `scripts/post-merge.sh`,
  mobile `scripts/build.js` + `server/serve.js`) and add a plain `expo start` script.

---

## 6. P3 — tidy-ups

- **Dependencies.** Unused in `cricket-club`: `framer-motion`, `date-fns`, `zod`,
  `@hookform/resolvers`, `@testing-library/dom`, `@uppy/*` (belong to
  `lib/object-storage-web`), plus `recharts`, `react-hook-form`, `embla`, `vaul`, `cmdk`,
  `input-otp`, `react-day-picker`, `react-resizable-panels`, `next-themes`, `sonner`
  reachable only through 20 unused `components/ui/*` files (`sidebar.tsx` alone is 727
  lines). Unused in `api-server`: `google-auth-library`, `@types/bcryptjs` (stub).
  Unused in `cricket-mobile`: ~16 Expo template packages (`expo-blur`, `expo-haptics`,
  `expo-image-picker`, `expo-location`, `expo-symbols`, `zod`, …). Move `wouter`, `pg`,
  `@types/pg`, `drizzle-zod`, `drizzle-kit`, `orval`, `@uppy/*`, `@types/react*` and the
  duplicated Radix set into the pnpm catalog.
- **React types mismatch.** Catalog pins `react 19.1.0` but `pnpm.overrides` forces
  `@types/react 19.2.14`; RN 0.81 expects 19.1. Either bump the runtime or drop the
  override to `~19.1.x`.
- **Zod v3/v4.** `lib/db` schemas import `zod/v4`; generated `api-zod` imports `zod`
  (v3 API). Two runtimes in one process; plan a v4 cut-over (orval 8 supports it).
- **esbuild 0.18.20** remains in the tree via `@esbuild-kit/core-utils` (drizzle-kit);
  the `esbuild: 0.27.3` override does not reach it. Add
  `'@esbuild-kit/core-utils>esbuild': 0.27.3` or upgrade drizzle-kit (§5.4).
- **Expo SDK 54** is three majors behind (57 is latest); plan `npx expo install --fix`
  to 56/57 and add a smoke test per screen with react-native-testing-library. 28
  `as never` casts on `Link href` indicate typed routes are not resolving because
  `expo-env.d.ts` and `.expo/types` are gitignored.
- **OpenAPI file organisation.** Split `openapi.yaml` (12,917 lines) into
  `paths/*.yaml` + `components/*.yaml` bundled with `@redocly/cli` before codegen.
  Replace the hand-maintained ~50 type re-exports in `lib/api-zod/src/index.ts` (there
  to dodge one orval name collision) with orval's `override.operationName`.
- **Naming.** `components/honours-display/{BoardRenderer,SponsorAds,useApproachingBoard}`
  are PascalCase/camelCase in a kebab-case tree; `share-card-modal.tsx` +
  `share-card-modal/` and `trading-card.tsx` + `trading-card/` collide for the
  design-sync alias resolver — move the files to `index.tsx` inside the directories.
- **Misc.** `pages/match-detail.tsx:86,108` hard-codes `["/api/matches"]` as a query key;
  `pages/stat-detail.tsx:22,32` uses `useState<any>`; `pages/juniors-players.tsx` and
  `pack-templates/**` have 20+ lines over 140 chars (Prettier will fix); `player_images`
  and other private objects in `routes/storage.ts:150-195` are served by UUID obscurity
  only (document or add a tenant prefix check); `players.total_*` denormalised columns and
  `player_grade_stats.surname/given_name` duplicate `players` (drift-prone).

---

## 7. Sequencing

### Phase A — same week (all S, no design decisions)

1. §2.1 native-stats guard + leak tests.
2. §2.4 `GET /imports` auth; §2.5 `/tracked-links` throttle.
3. §2.3 delete `seed.ts`, move legacy ETLs, add `--tenant`/`--dry-run` CLI guard.
4. §2.6 `central_ro` role + proxy hardening + `pool.on("error")`.
5. §3.4 timing-safe proxy key; restrict dev tenant switcher.
6. §3.9 error boundary, `maximum-scale`, missing error states.
7. §5.8 user-visible Halls Head labels in `admin-junior-stats`/`admin-import`, cookie
   names, MP4 filenames.
8. §4.3 toolchain pins; §4.5 workflow `permissions`/timeouts; remove `express.urlencoded`.

### Phase B — sprint 1 (CI integrity and hardening)

1. §3.2 lazy pools; drop the Supabase secret from PR runs.
2. §3.1 lib/scripts tests in CI; seed a minimal `central` fixture; re-enable the
   provisioning suites; fix the provisioning 500.
3. §3.8 build job; §4.1 ESLint + Prettier + lint job; §4.2 config module +
   `.env.example`.
4. §3.3 session epoch; §3.6 transactional provisioning; §2.7 FKs and uniques.
5. §3.5 replace `xlsx`; §3.11 delete `mockup-sandbox`; §4.5 Dependabot, CODEOWNERS,
   PR template.
6. §2.2 dump relocation and history rewrite (schedule the force-push with all
   contributors).

### Phase C — sprint 2–3 (structure)

1. §3.7 spec drift: add missing operations, spec-first bodies for imports and social
   drafts, codegen diff check.
2. §5.2 `dataSource(req)` helper (moves the §2.1 guard to its permanent home).
3. §5.1 split `central-queries.ts`; cache and `any()` standardisation.
4. §5.5 web code-splitting (admin groups, share-card modal, fonts).
5. §5.9 Radix dialogs + label sweep + `vitest-axe`.
6. §5.10 / §5.11 test coverage for the untested pages and routes.
7. §3.10 mobile tenant awareness.

### Phase D — quarter (deep refactors)

1. §5.4 migrations, drizzle-kit upgrade, index sweep, CHECK constraints.
2. §5.3 api-server module splits; background post-commit job.
3. §5.6 web giant-file splits; junior/senior page unification.
4. §5.7 shared honour-board logic for web + mobile.
5. §5.12 readiness, graceful shutdown, autoscale-safe caches.
6. §4.4 `strict: true` fallout; §6 dependency pruning, Zod v4, Expo upgrade, spec split.
7. §5.13 documentation reconciliation (do incrementally as each phase lands).

---

## 8. Explicitly deferred

- **Stats-core `tenant_id` columns.** `_tenant.ts:62-68` defers these because the
  native tables are slated for replacement by central reads. This plan keeps that
  decision but closes the leak with the §2.1 guard instead.
- **Row-level security in Postgres.** Still listed as TODO in `CLAUDE.md` Phase 2. It
  depends on §5.4 (migrations) and on a per-request role switch; sequence after Phase D.
- **Billing/Stripe activation.** Out of scope; only the fail-safe in §5.12 is included.
- **Renaming `hhcc_*` columns** beyond the two API-visible fields; the native tables
  may be retired.

---

## 9. Corrections to existing docs (apply when touching them)

| Doc | Says | Reality |
|---|---|---|
| `AGENTS.md` | "No frontend or mobile tests… 22 test files, all backend" | 30 web, 70 API, 3 lib, 1 scripts; CI has a web-tests job |
| `AGENTS.md` | "35 tables" | count when §5.4 lands; `CLAUDE.md` says 33 |
| `AGENTS.md` | "Strict TypeScript" | `tsconfig.base.json` is not `strict` |
| `README.md` | "pnpm 9" | CI uses pnpm 10; `minimumReleaseAge` needs ≥10.16 |
| `CLAUDE.md` | Phase headings say Phase 0 | STATUS block already corrects; restructure |
| `central-queries.ts:397` | "no secondary indexes" on central | indexes added 2026-07-09 |
| `.agents/memory/hhcc-brand-source-of-truth.md` | fallback brand is Halls Head | `brand.ts:79-109` defaults to the Ovation placeholder |
| `replit.md` | references `post-merge.sh` in project folder | lives at `scripts/post-merge.sh`; uses `--filter db` while CI uses `--filter @workspace/db` |
