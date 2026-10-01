---
title: PlayHQ Scheduled Sync - Plan
type: feat
date: 2026-10-01
topic: playhq-scheduled-sync
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready (M1–M3); gated (M4 on S2, M5 on the API key)
product_contract_source: docs/brainstorms/2026-10-01-playhq-scheduled-sync-requirements.md
execution: code
---

# PlayHQ Scheduled Sync - Plan

## Goal Capsule

- **Objective:** Fixtures, results, ladders and lineups from PlayHQ refresh on their own, on a
  schedule that follows the fixture calendar, for every tenant with a linked PlayHQ organisation.
  Nobody pastes JS, and failures reach Ash and the club.
- **Product authority:** the brainstorm doc above, as amended by Ash's decisions D1–D5 and the
  1 Oct follow-up: "pre-fill is correct if we can determine that they get published"; "lineups generally
  start being published in PlayHQ a day or two before the match".
- **Execution profile:**
  - S1 and S2 are spikes and come first.
  - M1 (ingest) does not depend on any spike, so it can start straight away.
  - M2 (the unattended runner) is gated on S1 passing.
  - M3 is visibility and alerts.
  - M4 is lineup pre-fill, gated on S2.
  - M5 is the PlayHQ public API collector, blocked on the key.
  - Each unit lands as its own PR.
- **Stop conditions:** stop and surface if:
  - S1 fails on both hosts;
  - the ingest role cannot be scoped to `playhq` only;
  - a unit needs a product decision not settled here.
- **Tail ownership:** PRs follow `CLAUDE.local.md`. Migrations merge only after Ash approves
  applying them to prod. Secrets, the Supabase role and the API-key application are Ash's to
  provision (listed under "Ash to provision").

## Status (1 Oct 2026)

Ash's decisions: unattended (D1); apply for the public API key (D2); pre-fill lineups once we can
show they are published (D3); alerts to both Ash and tenant admins (D4); stale doc fixed (D5, in
PR #261).

**S1 (in progress).** Three passing runs on 1 Oct from GitHub-hosted runners: 39/39 calls, no
retries, with both the headless and a desktop user agent. That counts as day 1; the 8, 9 and
10 Oct re-runs complete the "three days" criterion.

**S2 (partly answered).** `/scores/matches/{id}` already carries `teams[].players` (empty 9
days out). The guessed `/lineups`, `/players` and `/teams` paths don't exist. The 8–10 Oct
re-runs will show when the list fills.

**U1–U3: built, on PR #261.** Deviations from the units below:

- The loader lives in `lib/db/src/playhq-ingest/` (export `@workspace/db/playhq-ingest`), not a
  new `lib/playhq-ingest` package. The API server and the projection already depend on
  `@workspace/db`, so this avoids a new workspace package and lockfile change.
- There are no chunked uploads yet (KTD6). The S1 weekly plan exports 69 KB gzipped, so a single
  request with a 50 MB decompressed limit and `Content-Encoding: gzip` covers every planned plan.
  Add chunking if a dump outgrows it.
- U4 (`playhq_sync_enabled`) isn't built. Until it is, ingest projects every tenant linked to an
  organisation in the dump, exactly as the CLI does.
- The junior filter (R3) applies on the endpoint path only. The hand-run CLI keeps its old
  behaviour; the harness already drops juniors by default.

**Ash to provision before the endpoint is live (in order):**

1. Re-apply the schema once: `playhq-load -- --init --yes`. This adds the new `scrape_runs`
   columns; the CLI's next load needs them.
2. Run `scripts/sql/playhq-ingest-role.sql` in the Supabase SQL editor, then
   `alter role playhq_ingest with password '…'`.
3. In Replit secrets, set `PLAYHQ_INGEST_DATABASE_URL` (user `playhq_ingest.<ref>`, session
   pooler) and `PLAYHQ_SYNC_SECRET`.

---

## Product Contract

### Summary

A scheduled runner collects PlayHQ data and posts it to one server-side ingest endpoint. That
endpoint is the single path into `playhq.*`: it loads the data, projects fixtures, pre-fills
lineups, and runs the draft sweep. The server decides what is due and when; the runner only
executes. Each collector (headless browser now, public API later, manual tab as the fallback) is
interchangeable behind the same dump contract.

### Requirements

From the brainstorm (R1–R10), restated where the plan sharpens them:

- **R1.** One ingest path for every collector. `scrape_runs` records the collector, the harness
  version, status and errors.
- **R2.** Ingest is idempotent: sending the same dump twice gives the same database state.
- **R3.** Juniors are excluded at ingest, not only in the harness. The server drops junior and
  pathway grades using the existing grade classifier.
- **R4.** Sync never overwrites admin-curated fixture fields and never deletes fixtures.
- **R5.** Failures are visible. A run that was due and never arrived, a run with errors, or a
  zero-record run raises an alert.
- **R6.** Rate-polite: harness defaults, only what is due, one run per organisation covering
  every tenant on it.
- **R7.** Rows in `fixture_changes` trigger the draft sweep for the affected tenants.
- **R8.** Per-tenant switch: `tenants.playhq_sync_enabled`, plus the existing `playhq_org_id`.
- **R9 (amended).** Lineup pre-fill is evidence-gated.
  - Every lineup sighting is recorded per fixture (`lineup_first_seen_at`, or null).
  - Pre-fill is switched on per grade only once the data shows that grade's lineups are
    published. Initial threshold: ≥ 70% of completed fixtures over the last 3 rounds; tunable.
  - A pre-filled team list is unpublished and marked `source='playhq'`. Admins can edit it.
  - Once an admin edits a team list, sync never touches it again.
- **R10.** Alerts go to both audiences: Ash (email plus the platform console) and the tenant's
  admins (in-app notification, with email optional per tenant).

### Acceptance Examples

- **AE1.** The Monday run picks up a fixture whose start moved from 13:00 to 12:30. Within one
  run, `fixture_changes` holds the change, `public.fixtures` shows 12:30, the draft sweep runs
  for that tenant, and an admin's notes on the fixture are unchanged.
- **AE2.** Saturday's A Grade match ends at about 18:00. The 18:30 run loads the result. The next
  morning's run fills a scorecard that was still `PENDING`. Both runs appear in the console with
  status `ok`.
- **AE3.** The runner doesn't fire for 26 hours during the season. The watchdog emails Ash, and
  every enabled tenant gets a "Fixtures last refreshed 26 h ago" notification. Both clear on the
  next good run.
- **AE4.** PlayHQ publishes the Halls Head B Grade lineup on Thursday, B Grade has met the
  threshold, and no admin team list exists. The Thursday 18:00 run creates an unpublished
  `source='playhq'` team list, in time for the Team List card before the weekend.
  An admin moves a player; a later run's changed lineup doesn't touch it.
- **AE5.** A dump containing a Year 8 grade is sent to ingest. The junior grade, its matches and
  its players are not written.

### Scope Boundaries

Out of scope:

- full-history and ball-by-ball backfills (they stay manual);
- projecting `playhq.*` into `central.*`;
- plan or Stripe gating of sync frequency;
- partner API (Option E).

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Ingest runs on the server and its endpoint is the boundary.**
  - The runner never holds a database credential.
  - The app database (`public.fixtures`, `team_lists`, notifications) is written only by the
    API server, which already owns those credentials.
- **KTD2. A separate role that can write only to `playhq`.**
  - The app pool on `CENTRAL_DATABASE_URL` stays read-only, as CLAUDE.md requires.
  - Ingest uses a new `PLAYHQ_INGEST_DATABASE_URL`: a Supabase role with `USAGE`, `INSERT`,
    `UPDATE` and `SELECT` on schema `playhq` only, and no grants on `central` or `wa`.
  - The pool lives in its own module, `lib/db/src/playhq-ingest.ts`, so it can't be mistaken for
    the central read pool. A boot-time self-check refuses to start ingest if the role can write
    `central`.
- **KTD3. The loader moves into a library.**
  - `rowsFromDump`, `diffFixture`, `upsertSql` and `loadRows` move from
    `scripts/src/playhq-load.ts` into `lib/playhq-ingest` (new workspace package).
  - `projectFixtures` and `requestDraftSweeps` move from `scripts/src/playhq-project-fixtures.ts`
    into the same package.
  - The CLIs become thin wrappers, so their flags and behaviour don't change.
- **KTD4. The server decides what is due; the runner is dumb.**
  - `GET /api/internal/playhq-sync/plans` returns `[{orgId, planName, plan}]`, computed from
    `playhq.matches` start times, the cadence table below, and the last successful `scrape_runs`
    row per (org, planName).
  - Cadence logic is plain functions, testable with fake times. The runner fires hourly and runs
    whatever comes back.
- **KTD5. Runner = GitHub Actions cron + `puppeteer-core`.**
  - `puppeteer-core` is already a dependency of api-server; GitHub's Ubuntu runners ship Chrome.
  - Runner steps: open `play.cricket.com.au` → inject `harness.js` verbatim → `__ov.start(plan)` →
    poll `status()` → `exportInfo()` / `export(i)` → POST the gzip chunks to ingest.
  - If S1 shows GitHub IPs are blocked, the fallback host is a Replit Scheduled Deployment running
    the same script.
- **KTD6. Dump contract stays the harness export.**
  - The format stays `{version, exportedAt, records[]}`, with the harness version in the header.
  - Ingest accepts `Content-Encoding: gzip`, gets its own 25 MB body limit (`app.ts` keeps 100 kb
    globally), and takes chunked uploads keyed by `uploadId` for larger dumps.
  - The M5 API collector emits the same format, so ingest never knows which collector sent it.
- **KTD7. Alerts use what already exists.**
  - Tenant alerts go through `notificationsTable` with a new kind, `playhq_sync_stale`.
  - Email goes through `lib/integrations/email.ts` (Resend).
  - Ash's alerts go to `PLATFORM_ALERT_EMAIL`. There is no platform notifications table, and this
    plan doesn't add one.
  - The watchdog lives on the server, so a dead runner is still noticed.

### Cadence (drives KTD4)

All times AWST, in season (the season is active when `isCurrentSeason` and fixtures fall within
±14 days).

| planName     | Due when                                                              | Harness plan                                                                        |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `weekly`     | Mon 06:00, all year                                                   | `kinds: matches, ladder, gradeTeams, rounds`, `scorecards: none`                    |
| `preweekend` | Thu and Fri 18:00, if the org has fixtures in the next 4 days         | `kinds: matches`, `scorecards: none` (+ lineups after S2): lineups mostly land here |
| `matchmorn`  | 07:00 on match day                                                    | `kinds: matches` (+ lineups): last-minute changes to the XI                         |
| `matchday`   | Hourly from first start −2 h until the last scheduled end +2 h        | `kinds: matches, ladder`, `scorecards: since=today`                                 |
| `dayafter`   | 08:00 and 18:00 the day after a match day                             | `scorecards: since=yesterday`, `resume: true`                                       |
| `catchup`    | 08:00 on day +3 if any fixture from that match day is still `PENDING` | Same as `dayafter`                                                                  |

A plan is due when its slot has passed and there is no successful `scrape_runs` row for
(org, planName) since that slot. This makes a missed hour self-healing.

### Ash to provision

1. A Supabase role for `PLAYHQ_INGEST_DATABASE_URL` (U2 ships the SQL).
2. `PLAYHQ_SYNC_SECRET`, set in both Replit and GitHub Actions secrets.
3. `OVATION_API_URL` as a GitHub Actions variable.
4. `PLATFORM_ALERT_EMAIL`.
5. Apply for the PlayHQ public API key (D2): CA tenant `ca`, read-only, fixtures, results and
   ladders.
6. Run the S2 capture in a browser (see S2).

### Governance

Running the scraper unattended on GitHub's infrastructure is still scraping. It stays within the
pilot/non-commercial framing CLAUDE.md requires. M5 swaps fixtures, results and ladders onto the
sanctioned API as soon as the key exists. After that, the headless collector only does scorecard
enrichment.

---

## Implementation Units

### Spikes

#### S1. Headless collector feasibility (≤1 day)

**Question:** can headless Chromium on a GitHub Actions runner call
`grassrootsapiproxy.cricket.com.au` from a `play.cricket.com.au` page?

**Method:** a throwaway `workflow_dispatch` workflow that:

1. uses `puppeteer-core` with the runner's Chrome to open the Halls Head club page;
2. injects `harness.js` and runs the `weekly` plan for the current season;
3. prints `__ov.status()` and the record count (no ingest).

Run it three times on different days.

**Pass:** all three runs finish with 0 failed calls. **If it fails:** repeat S1 on a Replit
Scheduled Deployment. If that also fails, stop: unattended sync waits for M5, and the manual
fallback (U7) covers the gap.

#### S2. Lineup source and publish rate

**Question:** does PlayHQ expose a team lineup, at which endpoint, and when does it fill?

**Method:**

1. On a Thursday, open the coming weekend's matches in the play.cricket.com.au match centre.
   Ash says lineups generally start appearing a day or two before the match.
2. Record the network calls, looking at `/scores/matches/{id}` (the top-level `teams` field,
   which `references/endpoints.md` doesn't expand yet) and any `lineup` or `players` call.
3. Repeat on Friday evening and Saturday morning for the same matches, to see when each
   grade's lineup appears and whether it changes.

If S1 passed, the runner can do this too. Otherwise it needs Ash's browser (the cloud container
can't reach the site).

**Output:** the lineup endpoint and shape, added to `references/endpoints.md`, and the
`ov.lineups` kind added to the harness. If there is no pre-match lineup endpoint, M4 is dropped. The
"played XI" built from scorecard rows exists only after the match, too late to pre-fill a team
list.

### Milestone 1 — Ingest

#### U1. Extract the loader and projection into `lib/playhq-ingest`

**Goal:** make the existing load and project logic callable from the API server.
**Requirements:** R1, R2; KTD3.
**Dependencies:** none.
**Files:**

- New package: `lib/playhq-ingest/` (`package.json`, `src/load.ts`, `src/project.ts`,
  `src/index.ts`).
- `scripts/src/playhq-load.ts` and `scripts/src/playhq-project-fixtures.ts` become thin CLIs.
- `scripts/sql/playhq-schema.sql`.
- The existing tests move: `scripts/src/playhq-load.test.ts` →
  `lib/playhq-ingest/src/load.test.ts`, and the same for the project tests.

**Approach:**

- Move the exported functions unchanged, then reconnect the CLIs to them.
- Add `scrape_runs` columns (idempotent `alter table … add column if not exists` in
  `playhq-schema.sql`): `collector text`, `plan_name text`, `harness_version text`,
  `status text check (status in ('ok','partial','failed'))`, `errors jsonb`, `duration_ms int`.
- `loadRows` returns per-org counts so callers can tell an empty run from a successful one.

**Test scenarios:**

- Existing loader and projection tests pass unchanged after the move.
- `--file`, `--dir`, `--report` and `--project` give byte-identical output on a fixture dump,
  before and after.
- Loading the same dump twice leaves row counts and `fixture_changes` unchanged.

**Verification:** `pnpm --filter @workspace/scripts test` and the new package's tests pass;
typecheck is clean.

#### U2. Ingest role and pool

**Goal:** a write credential that can only touch `playhq`.
**Requirements:** KTD2.
**Dependencies:** none.
**Files:** `lib/db/src/playhq-ingest.ts`, `scripts/sql/playhq-ingest-role.sql`,
`.env.example`, `artifacts/api-server/src/lib/env.ts`.
**Approach:**

- The SQL creates role `playhq_ingest`, grants `USAGE` plus DML on `playhq.*` (with
  `ALTER DEFAULT PRIVILEGES` for future tables), and revokes everything on `central` and `wa`.
- The pool module exports `getPlayhqIngestPool()`, which throws when the env var is unset.
- `assertIngestScope()` runs `has_schema_privilege(current_user,'central','CREATE')` and
  `has_table_privilege` on a sample `central` table, and refuses to run if either is true.

**Test scenarios:**

- With the env var unset, ingest routes return 503 and the rest of the app boots normally.
- `assertIngestScope` rejects a superuser connection (run in CI against the test Postgres).

**Verification:** the CI central-schema job applies the role SQL and the scope check passes.

#### U3. `POST /api/internal/playhq-ingest`

**Goal:** the single entry point that loads a dump, projects fixtures and sweeps drafts.
**Requirements:** R1–R4, R7; KTD1, KTD6.
**Dependencies:** U1, U2.
**Files:**

- `lib/api-spec/openapi.yaml` (then codegen).
- `artifacts/api-server/src/routes/internal-playhq-ingest.ts`, mounted beside
  `internalDraftSweepRouter` in `app.ts`.
- `artifacts/api-server/src/routes/internal-playhq-ingest.test.ts`.

**Approach:**

- Secret check follows `internal-draft-sweep.ts` (`timingSafeEqual`, header `x-sync-secret`).
- Route-local `express.raw({limit: '25mb'})` with gunzip.
- Chunked mode: `PUT …/uploads/{uploadId}/{i}`, then `POST …/uploads/{uploadId}/commit`. Chunks
  are held in a temp table on the ingest pool and expire after 1 h.
- On commit:
  1. `rowsFromDump`;
  2. drop junior and pathway grades with the grade classifier (R3);
  3. `loadRows` in one transaction;
  4. stamp `scrape_runs` with collector, plan and status;
  5. `projectFixtures` for tenants whose `playhq_org_id` is in the dump and
     `playhq_sync_enabled` is true;
  6. run the draft sweep in-process for touched tenants (call the sweep lib directly, not HTTP).
- Response: `{runId, counts, fixtureChanges, tenantsProjected}`.

**Test scenarios:**

- AE1 end to end, using a fixture dump with one moved start.
- AE5: junior grades in a dump are not written.
- The same dump sent twice gives the same database state, and the second `scrape_runs` row has
  status `ok`.
- A wrong or missing secret returns 401. A body over the limit returns 413.
- A tenant with `playhq_sync_enabled=false` is not projected.
- Two tenants on the same org are both projected from one dump.
- A projection failure is recorded as `partial` and the load is not rolled back.

**Verification:** API integration tests pass; the codegen drift gate is clean.

#### U4. `tenants.playhq_sync_enabled`

**Goal:** per-tenant switch (R8).
**Dependencies:** none.
**Files:** `lib/db/src/schema/tenants.ts`, migration
`lib/db/migrations/0023_tenant_playhq_sync.sql` (+ journal and snapshot), the platform-admin
tenant detail page and route.
**Approach:** the column is `boolean not null default false`, set true for tenants that already
have `playhq_org_id`. Platform admins can toggle it on the tenant detail page.
**Test scenarios:** a platform admin can toggle it; a tenant admin can't.

### Milestone 2 — Unattended runner (gated on S1)

#### U5. Due-plans endpoint

**Goal:** the server computes what the runner should fetch (KTD4 and the cadence table).
**Requirements:** R5, R6.
**Dependencies:** U1, U3, U4.
**Files:**

- `lib/playhq-ingest/src/cadence.ts` and `cadence.test.ts`.
- `GET /api/internal/playhq-sync/plans` in `internal-playhq-ingest.ts`.
- `openapi.yaml`.

**Approach:**

- `duePlans(now, orgs, matches, lastRuns)` is a pure function.
- Orgs are the distinct `playhq_org_id` values of enabled tenants. Association-level runs are
  deduped: when several enabled tenants sit in one association's grades, one association run
  covers them.
- Match-day windows come from `playhq.matches` start times plus a per-format default duration
  (one-day 7 h, T20 3 h).

**Test scenarios:**

- With a fake clock at Mon 06:05, `weekly` is due for each org.
- At 06:05 after a successful run at 06:01, nothing is due.
- At Sat 11:00 with matches starting at 12:30 and ending around 19:30, `matchday` is due hourly
  until 21:30.
- At Sat 07:05 on a match day, `matchmorn` is due; at Sun 08:05, `dayafter` is due.
- Out of season, only `weekly` is due.
- A run missed at 06:00 is still due at 09:00.

#### U6. Runner script and workflow

**Goal:** the unattended collector (KTD5).
**Requirements:** R1, R6.
**Dependencies:** S1 pass, U3, U5.
**Files:** `scripts/src/playhq-sync-runner.ts`, `.github/workflows/playhq-sync.yml`,
`scripts/package.json` (adds `puppeteer-core`).
**Approach:**

- Workflow: `schedule: '7 * * * *'` (hourly, off the hour), plus `workflow_dispatch` with an
  optional `orgId` and `planName`. `concurrency: playhq-sync` with no cancel.
- Runner loop:
  1. Fetch the due plans.
  2. For each plan, open a fresh page, inject `harness.js` read from the repo, `start(plan)`, and
     poll until done or 20 min pass.
  3. Export the chunks and upload them, sending `collector: 'gha-headless'` and the harness
     version.
- A plan that times out still uploads what it collected, marked `partial`. The runner exits
  non-zero if any plan failed, so GitHub's own failure email also fires.

**Test scenarios:**

- Unit test against a stub page object: the chunked upload sequence is correct, a timeout sends
  `partial`, and an empty plan list exits 0 without opening a browser.
- One live `workflow_dispatch` run against staging (or prod with a test tenant) loads the
  `weekly` plan.

#### U7. Manual fallback through ingest

**Goal:** the hand-run skill posts to the same endpoint instead of writing to the database
directly.
**Dependencies:** U3.
**Files:** `.claude/skills/playcricket-stats-scraper/SKILL.md`, `scripts/src/playhq-upload.ts`
(new: uploads a dump file to ingest with `collector: 'manual'`).
**Approach:** `playhq-load.ts --file` stays for local and dev databases. The skill's default path
becomes `playhq-upload`. Remove the "Nothing schedules itself" section from the skill and point
to this plan.

### Milestone 3 — Visibility and alerts

#### U8. Watchdog and platform console panel

**Goal:** Ash sees every org's sync health and is emailed on failure (R5, R10).
**Dependencies:** U1, U5.
**Files:**

- `lib/playhq-ingest/src/health.ts`.
- `POST /api/internal/playhq-sync/watchdog`.
- `routes/platform-admin.ts` (`GET /platform/admin/playhq-sync`).
- `artifacts/cricket-club/src/pages/platform-admin/playhq-sync.tsx` plus a route in `index.tsx`.

**Approach:**

- Per org: the last run of each plan (status, counts, errors), and whether the org is overdue.
  An org is overdue when a plan has been due for over 3 h in season, or over 26 h at any time.
- The watchdog endpoint is called by the existing Replit Scheduled Deployment that hits the draft
  sweep. A second call keeps it independent of the GitHub runner.
- The watchdog emails `PLATFORM_ALERT_EMAIL` once per incident: on entering overdue or failed,
  and on recovery.

**Test scenarios:**

- AE3: the overdue org triggers exactly one email, and recovery triggers one "recovered" email.
- Repeated watchdog calls inside one incident send no further email.
- The panel lists orgs with the latest status. Non-platform admins get 403.

#### U9. Tenant stale-sync notice

**Goal:** club admins know when their fixtures are stale (R10).
**Dependencies:** U8.
**Files:** `lib/db/src/schema/notifications.ts` (new kind), `lib/playhq-ingest/src/health.ts`,
the admin fixtures page (banner), tenant settings (email opt-in).
**Approach:**

- The same incident model as U8, applied to each enabled tenant on an affected org.
- Each incident creates one notification for the tenant, plus email when the tenant has opted in.
- The admin fixtures page shows "Last refreshed from PlayHQ: …" all the time, and a warning
  banner while the tenant is stale.

**Test scenarios:**

- Two tenants on one org each get one notification per incident.
- A tenant with sync disabled gets none.
- The notification is cleared, marked read automatically, on recovery.

### Milestone 4 — Lineup pre-fill (gated on S2)

#### U10. Lineup capture and publish-rate tracking

**Goal:** record lineups and measure whether they are published, before pre-filling anything
(R9, first half).
**Dependencies:** S2, U3.
**Files:**

- `harness.js`: new `lineups` kind, run in `preweekend` and `matchmorn`.
- `scripts/sql/playhq-schema.sql`: `playhq.match_lineups(match_id, team_id, participant_id,
order, role, first_seen_at)`, and `playhq.matches.lineup_first_seen_at`.
- `lib/playhq-ingest/src/load.ts`.
- A `lineupPublishRate(gradeId, rounds)` query in `lib/playhq-ingest/src/lineups.ts`.

**Test scenarios:**

- The first sighting sets `lineup_first_seen_at`; a later run doesn't move it.
- The publish rate per grade is correct on a fixture dataset where 3 of 4 rounds have lineups.
- Junior grades are never captured.

**Verification:** after two real rounds, the U8 panel shows, for each grade, the publish rate and
the median lead time (hours before start) of the first sighting. This is the evidence Ash asked for.

#### U11. Team list pre-fill

**Goal:** pre-fill an unpublished team list where the grade's lineups are reliably published
(R9, second half; AE4).
**Dependencies:** U10.
**Files:**

- `lib/db/src/schema/fixtures.ts`: `team_lists` gains `source text not null default 'manual'`,
  `playhq_synced_at`, and `admin_edited_at`.
- Migration `0024_team_list_source.sql`.
- `routes/fixtures.ts`: the `PUT` sets `admin_edited_at` and `source='manual'`.
- `lib/playhq-ingest/src/project.ts`.
- The admin team-list UI gets a "From PlayHQ" badge.
- `openapi.yaml`.

**Approach:**

- Pre-fill when all of these hold: the grade's publish rate is at or above the threshold; the
  fixture has no team list, or has one with `source='playhq'` and `admin_edited_at` null.
- Map PlayHQ `participant_id` to app `playerId` through the existing `player_id_map` crosswalk.
  Unmapped players are entered by display name only.
- Never publish automatically. Never write fill-in ids (≥ 90000).

**Test scenarios:**

- AE4 end to end.
- A grade below the threshold gets no pre-fill.
- A list an admin created first is untouched.
- A `source='playhq'` list that an admin edited is untouched.
- An unmapped participant appears as a name-only entry.
- The draft sweep runs after a pre-fill, so the Team List card picks it up.

### Milestone 5 — PlayHQ public API collector (blocked on the key)

#### U12. API collector

**Goal:** fixtures, results and ladders from the sanctioned API, server-side with no browser.
This replaces U6 for those kinds.
**Dependencies:** the key; U3, U5.
**Files:** `lib/playhq-ingest/src/collectors/public-api.ts`; the runner gains a `--collector=api`
mode; `PLAYHQ_API_KEY` in env.
**Approach:**

- Map `/v1/organisations/{id}/seasons`, `/v1/seasons/{id}/grades`, `/v1/grades/{id}/games`,
  `/ladder` and `/v2/games/{id}/summary` onto harness record kinds, so the output is a standard
  dump.
- Before switching over, run both collectors side by side for two rounds and diff the
  `playhq.*` rows.
- If `/v2/games/{id}/summary` includes appearances, it becomes the lineup source for U10.

**Test scenarios:** recorded API responses map to a dump that loads identically to the harness
dump for the same matches. Any differences are listed and explained before cutover.

---

## Verification Contract

Every unit:

- the repo's fast checks pass (`pnpm run typecheck`, `lint`, `format:check`, changed-package
  tests);
- the codegen drift gate is clean for spec changes;
- migrations are applied in CI;
- AE1–AE5 are covered by integration tests by the end of their milestones.

## Definition of Done

M1–M3 are merged and live:

- the hourly workflow has run a full in-season week without help;
- the U8 panel shows every enabled org green;
- one deliberate outage (the workflow disabled for a day) produced exactly one email for Ash and
  one notice per tenant, and both cleared on recovery.

M4 is done when R9's evidence is on screen and pre-fill is on for the grades that qualify. M5 is
done when fixtures, results and ladders come only from the API.

## Risks & Dependencies

| Risk                                                     | Mitigation                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Proxy or bot gate blocks headless or GitHub IPs (S1)     | Replit host fallback; M5; U7 manual path                                                            |
| A harness or API shape change breaks collection silently | The harness version is stamped on runs; zero-record and error runs alert (R5); S2 adds shape checks |
| Ingest role misconfigured with `central` write access    | `assertIngestScope` refuses to run (U2)                                                             |
| Lineups rarely published for lower grades                | Pre-fill is gated per grade on measured publish rate (R9)                                           |
| Governance: unattended scraping                          | Pilot-only; M5 moves fixtures, results and ladders to the sanctioned API                            |
| GitHub cron drift (runs can be minutes late)             | Self-healing due-plan logic (KTD4); no plan depends on exact minutes                                |
