---
title: PlayHQ → Central Stats Projection - Plan
type: feat
date: 2026-10-04
topic: playhq-central-projection
artifact_contract: ce-unified-plan/v1
artifact_readiness: draft — awaiting Ash's decisions D1–D4
product_contract_source: Ash, 4 Oct 2026 — "a key and important feature of the app to continuously update players stats, adding new players to the database after each match or sync"
execution: code
---

# PlayHQ → Central Stats Projection - Plan

## Goal Capsule

- **Objective:** after each PlayHQ sync, every finished senior match that the sync collected
  lands in the `central.*` stats archive. That includes the match, batting, bowling, fielding,
  fall of wickets, rosters, and any new players. Results tickers, latest scorecards,
  leaderboards, records, milestones and player careers then update on their own, with no
  manual loads.
- **Why now:** the 2026/27 season has started. The scheduled sync
  (`2026-10-01-001-feat-playhq-scheduled-sync-plan.md`) fills `playhq.*`, but that plan scoped
  "projecting `playhq.*` into `central.*`" out. As a result, every central-reading club still
  shows 2025/26 as its latest results.
- **Execution profile:**
  - One spike (P0) proves the mapping against history.
  - P1–P4 build the projector, behind a flag, in dry-run first.
  - P5 hooks it into the ingest.
  - P6 backfills 2026/27 so far.
  - Each unit lands as its own PR, under merge policy b.
- **Stop conditions:** stop and surface if:
  - the P0 golden diff can't reach parity on 2025/26 matches;
  - Ash rejects D1, the central writer role;
  - a projected grade can't be classified by `classifyCentralGrade`.

## Product Contract

### Requirements

- **R1:** A match that PlayHQ marks `COMPLETED`, with a scorecard, in a senior grade involving at
  least one club known to central, appears in `central.matches` within one sync of its scorecard
  landing in `playhq.*`.
- **R2:** Batting, bowling, fielding, fall-of-wickets and roster rows for that match appear in the
  central tables, in the same shape the archive builder produced for 2002/03–2025/26. Career
  views, leaderboards and records must not be able to tell a projected match from a
  builder-loaded one.
- **R3:** A player seen for the first time (a new PlayHQ `participant_id`) is added to
  `central.players`, with a display name, the current club, and first and last season. Existing
  players get `last_season`, `current_club_id` and `matches` refreshed.
- **R4:** Re-projection is idempotent and amendment-safe. Projecting the same match twice changes
  nothing. Projecting an amended scorecard replaces that match's rows exactly, with no leftovers.
- **R5:** Matches already in central, because the builder loaded them, are not duplicated. They are
  matched on `playhq_match_id`.
- **R6:** Juniors never enter central. Fill-in, privacy and juniors-isolation invariants hold.
- **R7:** A projection failure never fails or rolls back the PlayHQ load. It downgrades the run to
  `partial`, warns, and is visible on the platform PlayHQ sync page.
- **R8:** The app's central read pool stays read-only. Writing is confined to one narrowly scoped
  role, used only by the projector.

### Acceptance examples

- **A1:** RMDCC A Grade, Round 1 2026/27 (3 Oct), completed:
  - after the next sync, RMDCC's home RESULTS ticker shows it;
  - "Latest scorecard" opens it;
  - its players' career runs include it.
- **A2:** PlayHQ amends the scorecard on Monday, moving a catch to a different fielder. The next
  `catchup` / `dayafter` sync re-projects it. The old fielder's catch disappears and the new
  fielder's appears.
- **A3:** A debutant with a new `participant_id` gets a player page after the sync, with one match.
- **A4:** A U16 match is never in central.
- **A5:** An abandoned match with no scorecard appears as a result row with
  `status = 'ABANDONED'` and no player lines, if D3 is "yes".

### Scope boundaries

Out of scope:

- ball-by-ball;
- `ladder` / `premiers` refresh, which stays curated or builder-owned (the ladder is already read
  from `playhq.ladders` for Fixtures & Results);
- WA raw `wa.*`;
- Halls Head's native tables (see D2);
- the public-API collector (sync plan M5).

## Decisions needed from Ash

- **D1, the central writer role (required):** CLAUDE.md and AGENTS.md say central is read-only
  from the app. This feature has to write it.
  - **Proposal:** a new `central_projector` DB role, with `INSERT/UPDATE/DELETE` on exactly these
    tables: `central.matches`, `match_batting`, `match_bowling`, `match_rosters`,
    `fall_of_wickets`, `fielding`, `players`, and the new crosswalk tables (P1). It gets
    `SELECT` on `playhq.*`.
  - It has its own pool (`CENTRAL_PROJECTOR_DATABASE_URL`) and is used only by the projector.
  - The app's `CENTRAL_DATABASE_URL` read proxy stays read-only and unchanged.
  - A scope check, mirroring `assertIngestScope`, refuses to project if the role can write
    anything else or is a superuser.
  - AGENTS.md is reworded to "read-only from the app; written only by the projector role".
- **D2, Halls Head:** tenant #1 reads its own native tables, not central, so projected matches
  won't show for Halls Head. The options are:
  - (a) cut Halls Head over to central reads, after the existing consistency suites pass;
  - (b) keep native, and load Halls Head's new season by the existing import path;
  - (c) a later native projection.

  **Recommendation: (a)**, as a separate small PR after P6.
- **D3, abandoned and forfeited matches:** project them as result rows with no player lines,
  matching how the builder stored them? **Recommendation: yes**, for parity.
- **D4, privacy default:** PlayHQ hides private players' names. Proposal:
  - a player whose PlayHQ name is withheld is inserted with `is_private = 1`;
  - an existing central `is_private` flag is never lowered.

## Planning Contract

### Key technical decisions

- **KTD1: a dedicated writer role and pool (D1).** See D1. The projector runs in the API process
  after the load commits, through its own pool and its own transaction per match.
- **KTD2: dedupe key.** The key is `central.matches.playhq_match_id`.
  - P1 adds a partial unique index `(playhq_match_id) WHERE playhq_match_id IS NOT NULL`, after
    proving there are no duplicates today.
  - An existing row's `match_id` is reused, so the builder's ids stay stable.
- **KTD3: id allocation.** Central has no sequences; every id came from the builder. P1 adds
  `central.projected_match_id_seq` (start 1,000,001, above PCA's ~11.6k and WA's 100001+) and
  one `central.projected_line_id_seq` (start above `max(id)` across the child tables, rounded
  up). New rows take ids from these, so they never collide with builder ranges.
- **KTD4: replace per match.** Inside one transaction per match, the projector:
  1. upserts the match row;
  2. deletes that `match_id`'s rows from batting, bowling, rosters, fall-of-wickets and fielding;
  3. reinserts them from the latest scorecard.

  This makes amendments exact (R4). The source is `playhq.scorecards.raw`, the full payload,
  rather than the per-row `playhq.match_*` tables. Those are upsert-only and can hold stale rows
  after an amendment (loader finding).
- **KTD5: club resolution.** P1 adds `central.club_playhq_orgs (club_id, playhq_org_id)`.
  - It is seeded automatically from history: wherever `central.matches.playhq_match_id` joins
    `playhq.matches`, the home and away org GUIDs pair with `home_club_id` / `away_club_id`.
  - Manual overrides are allowed.
  - A side with no mapping is stored as opposition text (`team_name`, null `club_id`, null
    `participant_id` on its lines), exactly as the builder stores unresolved opposition.
  - If neither side maps, the match is skipped with a warning.
- **KTD6: grade and season text.** Central's `grade` and `season` strings must classify the way
  the builder's did (`classifyCentralGrade`, `parseSeasonStartYear`).
  - P1 seeds `central.grade_playhq_map` (PlayHQ grade name pattern → central grade label) from
    history, the same way as KTD5.
  - Season is normalised to the builder's format.
  - A grade that classifies to null and isn't a deliberate exclusion stops that match, with a
    warning naming the grade. It is never silently mis-graded.
- **KTD7: rosters and fielding.**
  - Rosters are the union of batting, bowling and fielding participants per side, plus the
    scorecard payload's team lists where present.
  - `fielding` rows are expanded from the PlayHQ fielding counts (catches, wk catches,
    stumpings, run-outs) into the builder's one-row-per-dismissal `kind` shape.
  - `match_batting.fielder` is parsed from `dismissal_text`, as the builder did.
  - P0 confirms each of these against builder output.
- **KTD8: toss, winner and result.** These come from `scorecards.raw.matchSummary.teams[]`
  (`wonToss`, `battedFirst`, `isWinner`) and `result_text`, mapped to club ids via KTD5.
- **KTD9: players (R3, D4).**
  - New participants are upserted from `playhq.players.full_name`, reordered from
    "Surname, Firstname" to the central display form, falling back to the scorecard short name.
  - After each projected batch, `first_season` / `last_season` / `current_club_id` /
    `matches` are recomputed for touched players only.
- **KTD10: caches.** The central query cache is in-process, with a 5-minute TTL. The projector
  runs in the same API process, so it calls `clearCentralQueriesCache()` and
  `clearMilestonesCache()` after a batch, and pages update immediately.
- **KTD11: flag and dry run.** `CENTRAL_PROJECTION=off|dry|on` (default `off`).
  - `dry` computes everything and logs per-match counts and diffs without writing.
  - The platform PlayHQ sync page shows the last projection summary.

### Verification (P0 golden diff)

Project a sample of 2025/26 matches that the builder already loaded (`playhq_match_id` known)
into a scratch schema. Diff them row by row against `central.*`:
- match fields;
- per-player runs, balls, 4s, 6s and dismissal type;
- bowling figures;
- fielding kinds;
- fall of wickets.

The target is 100% on numeric stats. Text differences, such as name formatting, are reviewed
case by case. This proves R2 before anything writes to real central.

## Implementation Units

- **P0 (spike): mapping and golden diff.**
  - Pure transform `scorecardToCentral(raw, maps)` in `lib/db/src/playhq-ingest/central-project.ts`.
  - Seed the club, org and grade crosswalks from history.
  - Run the P0 golden diff on 2025/26.
  - Output: a parity report in the plan. No writes to central.
- **P1: DDL.** `scripts/sql/central-projector.sql`, idempotent and applied by Ash to prod like
  the role SQL. It contains:
  - the two sequences;
  - the partial unique index;
  - `club_playhq_orgs` and `grade_playhq_map`, with history seeding;
  - the `central_projector` role grants.

  CI applies it in the central-schema job.
- **P2: writer pool and scope check.**
  - `getCentralProjectorPool()` and `assertProjectorScope()`.
  - Tests that a role with extra grants is refused.
  - Config: `CENTRAL_PROJECTOR_DATABASE_URL`, `CENTRAL_PROJECTOR_DB_SSL`.
- **P3: projector.**
  - `projectToCentral({ matchIds | sinceRunId, dryRun })`: per-match transaction, replace
    semantics, player upserts and recompute, cache clears.
  - Unit tests on fixtures:
    - new match;
    - re-project (no change);
    - amended scorecard (exact replace);
    - unmapped opposition;
    - junior grade (refused);
    - abandoned (D3);
    - private player (D4).
  - The `*-consistency.test.ts` suites run against projected fixtures.
- **P4: CLI.** `scripts/src/playhq-project-central.ts` (`--season`, `--org`, `--match`, `--dry`)
  for backfills and reruns.
- **P5: ingest hook.** In `ingestPlayhqDump`, after `projectFixtures`, run the projector for
  matches touched by this dump, under the R7 warn-and-`partial` pattern. Projection status is
  added to the run summary and the platform sync page.
- **P6: backfill and rollout.**
  1. `dry` on prod for one sync, and Ash reviews the summary.
  2. `on`.
  3. Backfill 2026/27 to date with the CLI.
  4. Verify A1–A4 on the live site.
- **P7 (after D2a): Halls Head cut-over to central reads.** This is a separate PR.

## Ash to provision

- Run `scripts/sql/central-projector.sql` on **Database → Production**, as with the
  `playhq_ingest` role, and set the `central_projector` password.
- Add these deployment secrets, then republish:
  - `CENTRAL_PROJECTOR_DATABASE_URL`: production URL form, user `central_projector`;
  - `CENTRAL_PROJECTOR_DB_SSL=0`;
  - `CENTRAL_PROJECTION=dry`, then `on`.

## Risks

| Risk | Mitigation |
|---|---|
| Projected rows differ subtly from builder rows (careers, records shift) | P0 golden diff to parity before any write; `dry` mode on prod first |
| Duplicate matches if `playhq_match_id` is missing on some builder rows | P1 duplicate audit; skip-and-warn on an ambiguous match |
| Unmapped grade or club silently excluded | Refuse with a named warning (KTD5/6); unmapped list on the sync page |
| Amendments leave stale lines | Replace per match from `scorecards.raw` (KTD4) |
| Writer role over-privileged | Table-level grants plus a boot-time scope check (P2) |
| Governance: scraped scorecards feed the stats archive | Pilot, non-commercial framing (CLAUDE.md); swap to the sanctioned API when available |
| Hourly cron unreliable on GitHub (observed every ~4 h) | Results land within a few hours, which is acceptable for stats; a separate follow-up covers a reliable trigger |
