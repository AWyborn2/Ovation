# PlayHQ scheduled sync — brainstorm / requirements

Date: 2026-10-01 · Status: decisions recorded (see "Decisions") · Next step: implementation plan

## Problem

Upcoming fixtures, team lists and match results reach Ovation only when someone runs the
`playcricket-stats-scraper` skill by hand: paste `harness.js` into a play.cricket.com.au tab →
export the dump → `scripts/src/playhq-load.ts` → `playhq-project-fixtures`. The skill itself
says "Nothing schedules itself" (`.claude/skills/playcricket-stats-scraper/SKILL.md:184`). As
tenants grow, a hand-run weekly check stops scaling, and match-day content (Match Day / Team List
/ Countdown cards, the draft sweep, results, ladders) goes stale between runs.

Goal: fixtures, results and ladders refresh on a cadence that follows the cricket calendar, for
every tenant with `tenants.playhq_org_id`, with nobody pasting JS.

## What already exists (the parts we keep)

| Piece                    | Where                                                         | Notes                                                                                     |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Collector                | `.claude/skills/playcricket-stats-scraper/harness.js`         | In-page only; IndexedDB resume; `kinds`/`since`/`resume` plans; drops juniors by default  |
| Landing schema           | `scripts/sql/playhq-schema.sql` (`playhq.*` on central)       | Fixtures + results in `playhq.matches`; `fixture_changes`; `scrape_runs`; ladders         |
| Loader                   | `scripts/src/playhq-load.ts`                                  | Idempotent GUID upserts; diffs matches into `fixture_changes`; CLI only                   |
| Projection               | `scripts/src/playhq-project-fixtures.ts`                      | → `public.fixtures` (`source='playhq'`), never touches notes/team lists, then draft sweep |
| Readers                  | `lib/db/src/central/playhq-fixtures.ts`, `/fixtures-results*` | Results + ladders read straight from `playhq.*`                                           |
| Internal trigger pattern | `routes/internal-draft-sweep.ts` (`x-sweep-secret`)           | Precedent for a secret-guarded internal endpoint called by a scheduler                    |

Gaps: nothing schedules a run; the loader runs only from a CLI; there is no `playhq` team-list or
lineup table; there is no adapter interface (the scrape path is the only implementation).

## The constraint

`grassrootsapiproxy.cricket.com.au` answers only to JavaScript running in a
`play.cricket.com.au` page. Server-side `curl`/`fetch` is refused, page → localhost is blocked,
and `playhq.com` has a bot gate (`references/endpoints.md`). So every option has to answer one
question: **what runs the browser, and on what clock?**

## Key decision: split _collect_ from _ingest_

Whatever runs the browser should only **collect**, then hand the dump to one server-side
**ingest** path. Concretely:

- `POST /api/internal/playhq-ingest` (secret-guarded like the draft sweep, OpenAPI-first) takes the
  harness export format (`{version, exportedAt, records[]}`, gzip+base64 OK). It runs the
  `playhq-load` logic, which moves from the CLI into a `lib` function the CLI also calls. It then
  runs `project-fixtures`, the draft sweep, and writes a `scrape_runs` row tagged with the
  collector that sent it.
- This is the **adapter boundary** CLAUDE.md asks for: scrape, PlayHQ public API and partner API
  each become a collector that feeds the same pipe. When the licensed source arrives, we swap the
  collector and leave the loader alone.
- A collector no longer needs `CENTRAL_DATABASE_URL` (the password stays off whatever machine runs
  the browser).

## Collector options

| #   | Option                                                                                                                                           | Unattended?             | Effort                                                       | Risk                                                                               | Governance                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A   | **Desktop scheduled routine.** A Claude routine bound to Ash's computer drives the built-in browser pane, runs the harness and POSTs to ingest   | Only while the PC is on | Low: reuses the skill as-is                                  | The machine must be awake; agent runs cost tokens                                  | Same as today                                            |
| B   | **Headless Chromium (Playwright).** GitHub Actions cron or a small worker: `goto(play.cricket.com.au)`, then `page.evaluate(harness)`, then POST | Yes                     | Medium                                                       | **Unproven:** datacenter IPs may hit the bot gate; harness breakage fails silently | Higher: automated scraping on cloud infra                |
| C   | **PlayHQ public API** (`x-api-key` + `x-phq-tenant: ca`) for fixtures, results and ladders                                                       | Yes, fully server-side  | Medium: new collector that maps the API to `playhq.*` shapes | Key approval lead time; no per-player stats (`docs/playcricket-ingestion.md`)      | **Sanctioned.** This is the path for anything commercial |
| D   | **Admin "Refresh from PlayHQ" bookmarklet** clicked on play.cricket.com.au, which POSTs to ingest                                                | No (on demand)          | Low                                                          | The site's CSP `connect-src` may block it; needs a spike                           | Same as today                                            |
| E   | **Partner API** for deep scorecards                                                                                                              | Yes                     | High; external dependency                                    | Long lead time                                                                     | Sanctioned                                               |

**Original recommendation** (replaced by "Recommendation, revised for unattended" below):
build ingest first, then work on two tracks at once.

1. **Now:** Option A, running on the calendar below. It works today, adds no new infra, and needs
   no new scraping surface. This is the pilot bridge.
2. **Spike (1 day):** Option B from a GitHub Actions runner. Can a headless Chromium on
   play.cricket.com.au call the proxy? If so, it replaces A for the unattended pilot.
3. **Start the paperwork now:** apply for a PlayHQ public API key (C) for fixtures, results and
   ladders. This is the only route that survives the "do not commercialise on scraped data" rule.
   Under C, scraping shrinks to deep-scorecard enrichment until E arrives.

## Cadence: run on the fixture calendar, not a flat cron

`playhq.matches` already holds every start time, so the schedule can come from the data. A
cheap hourly "what's due?" tick (or fixed slots) picks one of these plans:

| When (AWST)                                     | Plan (`harness` kinds)                                            | Purpose                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Weekly, Mon 06:00                               | `matches, ladder, gradeTeams, rounds`, current season             | New fixtures; moved starts, venues and status (`fixture_changes`) |
| Thu 18:00 and Fri 18:00 in rounds with fixtures | `matches` for the next 7 days (+ lineups once we know the source) | Late changes before the weekend; team lists                       |
| Match day, about 30 min after scheduled end     | `matches, scorecards` with `since=today`                          | Results the same evening                                          |
| Next morning, 08:00                             | Same with `resume:true`                                           | Fill `PENDING` scorecards entered late                            |
| Off-season                                      | Weekly only                                                       | Picks up when the next season's fixtures publish                  |

Batch per **association** rather than per club where possible (one Peel CA run covers every Peel
tenant), and dedupe tenants that share an org.

## Team lists: an open question, not a given

Ovation's team lists today are admin-entered (`team_lists`, one per fixture). `playhq.*` has no
lineup table, and the harness catalogue has no pre-match lineup endpoint. Possibilities:

- PlayHQ shows a lineup only once the club enters it (often on match day, sometimes never for
  lower grades). If so, it is a _fallback or pre-fill_ for the admin team list, never an
  overwrite. The projection's "never overwrite admin content" rule should stay.
- Post-match, the scorecard roster gives the actual XI. This is already captured through
  scorecards and `central.match_rosters`.

Needs a spike: open an upcoming fixture's match centre on play.cricket.com.au and capture the
network calls to see whether a lineup endpoint exists and when it fills.

## Requirements

- R1. One ingest path for every collector; the collector is recorded on `scrape_runs`.
- R2. Ingest is idempotent (it already is: GUID upserts) and safe to re-send the same dump.
- R3. Juniors stay excluded unless a tenant's juniors module opts in (and they stay in
  `/api/juniors/*` only).
- R4. Never overwrite admin-curated fixture fields (notes, team lists); never delete fixtures.
- R5. Failure is visible: zero records from a run that was due, harness `errors`, or a
  `harness.version` mismatch raises an alert. The super-admin console shows last-success per
  org.
- R6. Rate-polite: keep the harness defaults (`minGapMs`, concurrency 3), fetch only what is due,
  and batch by association.
- R7. `fixture_changes` triggers downstream work (re-run the draft sweep, and later push
  "fixture moved" notices to tenants).
- R8. Everything goes behind a per-tenant switch (the `tenants.playhq_org_id` + a `sync_enabled`
  flag) so a club can be turned off.

## Out of scope (for this pass)

Full-history and ball-by-ball backfills (they stay manual and confirmed run-by-run); projecting
`playhq.*` into `central.*` (it stays "a separate, reviewed step"); Stripe/plan gating of sync
frequency.

## Decisions (Ash, 1 Oct 2026)

| #   | Question                           | Answer                                                      | Consequence                                                                                                                            |
| --- | ---------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Unattended or "while my PC is on"? | **Unattended**                                              | The Option B spike is the critical path; Option A is only a manual fallback (see below)                                                |
| D2  | Apply for the public API key now?  | **Yes**                                                     | Ash applies (see `docs/playcricket-ingestion.md` § "If we ever revisit"); C replaces B for fixtures/results/ladders when the key lands |
| D3  | PlayHQ lineup and team lists       | **Pre-fill** (read from "yes" to the first option; confirm) | Becomes R9                                                                                                                             |
| D4  | Who gets failure alerts?           | **Both** Ash (super-admin) and the tenant's admins          | Becomes R10                                                                                                                            |
| D5  | Fix the stale ingestion doc?       | **Yes**                                                     | Done in this PR: `docs/playcricket-ingestion.md` + the `replit.md` pointer                                                             |

### Recommendation, revised for "unattended"

1. **Build the ingest endpoint first.** Every path below needs it.
2. **Spike Option B straight away (≤1 day).** Run headless Chromium on a GitHub Actions runner:
   load `play.cricket.com.au`, `page.evaluate(harness)` for one small plan, then POST to ingest.
   - **Pass:** the cron workflow becomes the unattended collector for the pilot.
   - **Fail (bot gate or refused origin):** try one more host (the Replit Scheduled Deployment
     already planned for the draft sweep). If that fails too, unattended has to wait for C, and A
     covers the gap.
3. **Option C as soon as the key arrives.** It becomes the primary collector for fixtures,
   results and ladders (server-side, no browser). `/v2/games/{id}/summary` has per-game
   appearances, which may also be the lineup source for R9. Scraping shrinks to deep-scorecard
   enrichment.
4. **Option A is no longer scheduled.** It stays as a manual "run it now" fallback and posts to
   the same ingest endpoint.

### Added requirements

- R9. **PlayHQ lineup pre-fills the team list.** When PlayHQ publishes a lineup for a fixture
  that has no admin team list, create one marked `source='playhq'`. Admins can edit it. Once an
  admin has edited or created a team list, sync never touches it again. A later PlayHQ lineup
  change only updates a team list that is still untouched. Depends on the lineup-endpoint spike
  above.
- R10. **Alerts go to two audiences.**
  - Ash (super-admin): every failure, plus last-success per org in the platform-admin console.
  - Each affected tenant's admins: a notice in their admin area, phrased for the club ("Fixtures
    last refreshed 3 days ago").
  - Choosing the delivery channel (in-app only, or email too) is a planning question.

## Remaining open items

- Confirm D3 means **pre-fill** (not "show alongside").
- Lineup-endpoint spike (does PlayHQ expose a pre-match lineup, and when does it fill?).
- Option B spike result decides the unattended collector.
- Alert delivery channel for R10.
