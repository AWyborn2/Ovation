# Ovation — White-Label Transition (CLAUDE.md)

> Drop this file at the root of the Ovation repo (github.com/AWyborn2/Ovation). Claude Code
> auto-loads it each session. It merges the OVATION build guide with a concrete code review
> (June 2026) of the forked Halls Head app, plus the PCA-database integration mapping.
> Companion docs: `White Label Cricket App/Docs/OVATION-build-guide.md` (strategy/roadmap),
> inherited `replit.md` (Halls Head data model + Gotchas — still accurate for the club core).

## What Ovation is

White-label cricket stats-and-history platform. Any club signs up, brands it as their own, and
gets their full history — stats, records, honour boards, milestones — from a shared association
database (the PCA DB) that stays current automatically. Pilot tenants: Peel Cricket Association
clubs. Halls Head stays tenant #1 / demo.

## Inherited app (review summary)

Mature pnpm monorepo: React+Vite+Tailwind web (`artifacts/cricket-club`), Expo mobile
(`artifacts/cricket-mobile`), Express 5 + Drizzle + Postgres API (`artifacts/api-server`),
OpenAPI-first (`lib/api-spec/openapi.yaml` → Orval-generated hooks in `lib/api-client-react`
and Zod in `lib/api-zod`), shared scorecard view-model `lib/scorecard`, schema in
`lib/db/src/schema/`. 47 schema tables, ~90 route modules, ~66 web pages. Run commands and the
full data model are in `replit.md`.

### Where Halls Head is baked in (white-label debt inventory)

77 files reference "Halls Head"/"HHCC" (excluding generated code). By area:
`artifacts/cricket-club` 35 · `artifacts/api-server` 12 · `artifacts/cricket-mobile` 9 ·
`scripts` 7 · `lib/scorecard` 5 · `lib/db` 5 · `lib/api-spec` 1. Key hotspots:

- `artifacts/api-server/src/lib/halls-head-brand.ts` — brand resolver hard-coded to
  `HALLS_HEAD_CLUB_ID = 2` with `HALLS_HEAD_BRAND` fallback from `lib/scorecard/src/brand.ts`.
  This is the natural seam: generalise to `getTenantBrand(tenantId)`.
- `lib/db/src/schema/matches.ts` — `hhcc_batted_first` column; whole `matches` model is
  one-club-centric (`opponent_club_id`, opposition as display-only text in
  `match_opposition_lines`).
- `lib/scorecard/src/*` — types/mapping named around HHCC; brand constants.
- `artifacts/cricket-club/src/components/layout.tsx` — club name in header/footer/copyright;
  juniors banner has an intentional hard-coded brown `#42342B`.
- `artifacts/cricket-club/index.html` — title, meta description, OG/twitter tags, favicon.
- `artifacts/cricket-mobile/app.json` + welcome/onboarding screens.
- Fill-in convention: `player_id >= 90000` = fill-in, excluded from all derivations — preserve
  per-tenant or replace with an explicit flag during the central-read refactor.
- Single DB connection: `lib/db/src/index.ts` exports one pool from `DATABASE_URL`. The central
  PCA DB needs a second, read-only connection (e.g. `CENTRAL_DATABASE_URL`) in its own module.
- Theming is already CSS-token based (`--primary` etc. in `src/index.css`) — promote tokens to
  per-tenant runtime values; don't invent a new theming system.

## The central PCA database

Source of truth: `PCA Database/PCA app database/pca_full.db` (SQLite) and
`pca_full_postgres.sql` (loaded into Postgres as schema `central`). Scope: 24
seasons 2002/03–2025/26, 11,604 matches, ~218k batting / ~129k bowling rows, 27 clubs,
170 premiers. A trimmed `pca_pilot.db` / `pca_pilot_postgres.sql` also exists. Builder scripts

- review CSVs sit beside them (`Scripts/`, `Review/`).

Tables: `clubs` (lineage: `parent_club_id`, `lineage_role`, `active_from/to`), `players`
(PlayHQ `participant_id` GUID PK, `display_name`, `is_private`, `current_club_id`), `matches`
(symmetric home/away club ids, scores, toss winner, winner, `playhq_match_id`, grade, round,
venue, status, result text), `match_batting` (order, runs, balls, 4s/6s, SR, dismissal +
type + fielder), `match_bowling` (overs, maidens, runs, wickets, econ, wides, no-balls),
`match_rosters`, `fall_of_wickets`, `fielding`, `ladder`, `premiers` (per season/grade/format,
confidence flags), `club_name_history`. Career views `v_player_batting/bowling/fielding`,
lineage view `v_club_combined`.

### Why this changes the app's shape

The app's `matches` is asymmetric (one club's perspective; opposition display-only). The PCA
`matches` is **symmetric** — every club first-class, every player a career across clubs keyed
on PlayHQ GUIDs. So the white-label transform is NOT "copy PCA into the app schema"; it is
**repoint stats reads at the central DB filtered by the tenant's `club_id`**, and keep the app's
own tables for tenant-curated content only.

### PCA → app concept mapping

| App concept                                                                                | Today                                                 | Central-read replacement                                                                                |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `matches` (per-club)                                                                       | `hhcc_batted_first`, `opponent_club_id`, `source_key` | `central.matches` where `home_club_id = :club OR away_club_id = :club`; batted-first from innings order |
| `match_player_lines`                                                                       | club players only                                     | `central.match_batting/bowling/rosters` where `club_id = :club`                                         |
| `match_opposition_lines`                                                                   | display-only text                                     | other side of the same central match — now real data, same tables                                       |
| `players` + career aggregates                                                              | per-club rows, ints                                   | `central.players` (GUID `participant_id`) + career views filtered to club; respect `is_private`         |
| `player_grade_season_stats` snapshots                                                      | CSV/xlsx imports                                      | derived from central scorecards; import pipeline becomes legacy/fallback                                |
| `clubs` register (branding)                                                                | loaded from master DB                                 | `central.clubs` + `club_name_history` / `v_club_combined` (lineage toggle)                              |
| Premierships honour board                                                                  | curated                                               | seed from `central.premiers` (respect `confidence`; curated overrides stay tenant-side)                 |
| Hand-kept records, honour boards, life members, awards, ToD, caps, committee, social cards | club tables                                           | stay tenant-side, add `tenant_id` (this is the differentiating asset — never discard)                   |

Player identity migration: app `players.id` (int) ↔ PlayHQ `participant_id` (GUID). Halls Head
already links some history by name; build a crosswalk table (`player_id_map`) rather than
rewriting either side.

## Tenancy target

- `tenants` table: `id, slug (subdomain), club_id (→ central.clubs), name, colours, logo,
favicon, custom_domain, plan`. Resolve tenant per-request (subdomain → context middleware);
  thread `tenantId` through every API call.
- Tenant-scope curated tables with `tenant_id`; enforce with Postgres RLS (still TODO).
- Per-tenant theming from the tenant row → CSS tokens + `index.html` metadata served dynamically.
- Auth: per-tenant admins + super-admin; onboarding = "pick your club" → instantly populated.
- Juniors isolation invariant (junior\__ tables, `/api/juniors/_` only, never blended) holds
  per-tenant.

## STATUS (6 Oct 2026) — read this first

### Where the data lives

- **Replit-managed Postgres holds everything**, in development and production: the app's own
  tables (`public`), the shared stats (`central.*`), the raw PlayHQ landing tables
  (`playhq.*`) and Drizzle's bookkeeping. The original Supabase project `ovation-central` was
  **retired after the move and is read-only** — never write to it, and don't point new work at
  it (the Supabase connector in assistant sessions is read-only too).
- Connection variables (values live in Replit secrets; never print or commit them):
  `DATABASE_URL` (app), `CENTRAL_DATABASE_URL` (read-only `central` reads),
  `CENTRAL_PROJECTOR_DATABASE_URL` (the one sanctioned `central` writer, the PlayHQ projector),
  `PLAYHQ_INGEST_DATABASE_URL` (the `playhq_ingest` role: select/insert/update on `playhq.*`
  only, no delete or DDL). Ash confirmed on 6 Oct 2026 that each points at the right database.
- **Production schema changes are applied by hand.** Republishing does not migrate production:
  run the new migration's SQL (`lib/db/migrations/NNNN_*.sql`, written idempotent with
  `IF NOT EXISTS`) in Replit's Production SQL runner **before** republishing. New `playhq.*`
  tables come from `scripts/sql/playhq-schema.sql` and go in the database
  `PLAYHQ_INGEST_DATABASE_URL` points at — check with `select to_regclass('playhq.<table>')`
  first, because the Production Database pane may not be that database. Assistant sessions
  cannot reach production; give Ash the SQL.
- Ops report folders written by scripts run from `scripts/` land in `scripts/exports/`, which is
  git-ignored (they hold player-level data — never commit them).

### PlayHQ sync (live)

- `.github/workflows/playhq-sync.yml` runs the scraper harness
  (`.claude/skills/playcricket-stats-scraper/harness.js`) in headless Chromium and posts each
  dump to `POST /api/internal/playhq/ingest`. The server decides which plans are due
  (`lib/db/src/playhq-ingest/cadence.ts`): weekly, preweekend (Thu/Fri 18:00), matchmorn,
  matchday, dayafter, catchup. Manual catch-up: run the workflow with `manual_org` (PlayHQ org
  GUID) and `manual_since` (YYYY-MM-DD). Halls Head's org is
  `4559f1b9-86d8-eb11-a7ad-2818780da0cc`.
- Ingest loads `playhq.*`, projects fixtures into `public.fixtures`, copies the side a club
  names in PlayHQ into `team_lists` (`source = 'playhq'`; an admin-saved list, `source =
'admin'`, is never overwritten), copies finished and in-progress matches into `central.*`,
  then runs the draft sweep for each tenant it touched.
- A watchdog marks an org overdue when a due plan waits past its grace (weekly 26 h, others
  3 h). GitHub's own scheduler starts the "hourly" job only ~4 times a day, so since 6 Oct
  2026 an hourly cron-job.org job (`ovation-playhq-sync-trigger`, on the hour) starts the workflow
  through `workflow_dispatch` with a fine-grained token (this repo only, Actions read/write,
  expires 30 Sep 2027 — renew it before then). GitHub's schedule stays as a backup; runs queue
  and never overlap.

### Social and caps (live)

- Team List cards draft from a published team list (admin- or PlayHQ-sourced) and feature one
  selected player's library photo, picked at random per fixture. Pack designs name their photo
  slot per kind (`squadPhoto`, `teamPhoto`, `cardPhoto`); `KIND_PHOTO_SLOT` in
  `artifacts/cricket-club/src/lib/pack-render/bind.ts` routes the chosen photo there.
- A Grade debut caps are issued automatically (`api-server/src/lib/debut-caps.ts`) for a club
  that has a cap register, as **pending** caps an admin confirms, reorders or declines in Admin
  → Caps. Public reads show confirmed caps only; declined caps are never re-issued.

### Roadmap phases (status as of 29 Jun 2026, updated where noted)

The roadmap below is the original plan. **Reality has moved ahead of it.** Current state on
`main`:

- **Phase 0 (prove central model): COMPLETE.** `lib/db/src/central.ts` (read-only pool) +
  `central-queries.ts` exist; reads flip to central behind the `shouldReadCentral` flag
  (`api-server/src/lib/tenant.ts`); `scripts/src/compare-central-leaderboard.ts` is the
  proof harness. `tenant-brand.ts`, the `tenants` table, and `tenant-context` middleware are
  in. Brand sweep is well underway — Halls Head literals down to ~48 files (from 77).
- **Phase 1 (friendly clubs on subdomains): in progress** — tenant routing + isolation tests
  committed (`tenant-routing.test.ts`, `tenant-isolation.test.ts`, `admins-isolation.test.ts`).
- **Phase 2 (self-serve + Stripe): partially BUILT BUT DORMANT.** Committed: 2b self-serve
  onboarding + tenant-scoped admin auth (live); 2c plan entitlements (`lib/entitlements.ts`,
  **dormant**); 2d Stripe/billing adapter (`routes/billing.ts`, `lib/billing.ts`, **inert** —
  webhook wired in `app.ts` but disabled); 2e super-admin / platform-admin console (live).

- **Phase 3 (other associations): STARTED (10 Sep 2026).** WA Premier Cricket (16 clubs,
  30,001 matches, ~1.15M stat rows) is loaded as its own raw schema `wa.*` and **projected into
  `central.*`** with offset ids (clubs 101–116, matches 100001+) so the existing central read
  path serves WA clubs unchanged; `central.clubs` is now 43 clubs (27 PCA + 16 WA). The grade
  classifier (`lib/db/src/central/grades.ts`) understands WA labels; WA junior/pathway grades
  are excluded from the senior read (juniors isolation). Builder + design doc live outside the
  repo (`Desktop/OVATION APP/WA Cricket Database/`).

⚠️ Implications: billing + entitlements code is present in a running server but switched off —
treat as unexercised/brittle. The stats core is mid-migration (some reads local, some central),
so the local-vs-central boundary is the top correctness risk; keep all central reads funnelled
through `central-queries.ts` and guarded by the `*-consistency.test.ts` suites.

See `AGENTS.md` for the full current-state map, and `plan.md` (Sep 2026) for the
engineering review and its phased implementation — Phases A–C (fail-closed stats reads,
CI integrity, lint, session revocation, spec drift, code-splitting, mobile tenant
awareness) are implemented; Phase D items are tracked there.

## Phase 0 — prove the central model (✅ COMPLETE — kept for context)

1. ✅ DONE (11 Jun 2026). Supabase project `ovation-central` (ref `sbsrjlozgjoavtmdyqit`).
   Dump loaded into schema `central`; all counts verified (27 clubs, 7,516 players, 11,604
   matches, 218,637 batting / 128,937 bowling, 170 premiers; `v_*` views build). **Superseded:**
   `central` and `playhq` have since moved to Replit-managed Postgres and the Supabase project
   is retired, read-only (see STATUS).
2. New module `lib/db/src/central.ts` (or `lib/central-db`): read-only pool on
   `CENTRAL_DATABASE_URL`, Drizzle schema for the central tables. Never write to it from the app.
3. Behind a feature flag, repoint ONE read (e.g. grade batting leaderboard) to
   `central.match_batting` filtered by `club_id`, compare output against the existing HHCC
   numbers (HHCC = `central.clubs.club_id = 1`). This is the end-to-end proof.
4. Generalise `halls-head-brand.ts` → `tenant-brand.ts`; add `tenants` table with Halls Head
   hard-coded as tenant #1; tenant-context middleware (header or env for now, subdomain later).
5. Sweep the 77-file brand inventory: replace literals with tenant-sourced values (name, logo,
   colours, titles, OG tags). Leave the juniors-banner brown as a tenant theme value.
6. Add tenant-isolation tests early — one tenant must never read another's curated data.

Phase 1: 2–3 friendly PCA clubs on subdomains (concierge) — IN PROGRESS. Phase 2: self-serve
signup, Stripe, RLS, custom domains — PARTIALLY BUILT (onboarding + admin auth live; entitlements
dormant; billing inert; super-admin live; RLS + custom domains still TODO). Phase 3: other
associations as additional central datasets — STARTED (WA Premier Cricket projected into
`central`, Sep 2026).

## Do not break

- **OpenAPI-first**: change `lib/api-spec/openapi.yaml`, then
  `pnpm --filter @workspace/api-spec run codegen`. Never hand-edit generated files.
- **Juniors isolation** (see replit.md), **fill-in exclusion** (`playerId >= 90000`),
  **one ingestion method per (grade, season)**, and every Gotcha in `replit.md`.
- `@workspace/scorecard` stays the single view-model for web + mobile.
- Curated club content is the moat — tenant-scope it, never replace it with central data.

## Data governance (hard constraint)

Deep scorecards were scraped for the pilot. Keep the ingest behind a clean adapter boundary
(scrape → PlayHQ public API for fixtures/results/ladders → partner API for deep scorecards).
**Do not commercialise on scraped data**; pilot/non-commercial framing until partner or licence
access is secured (PlayHQ partner application / Fixtura). Review cricket.com.au Third-Party
Application T&Cs before launch.
