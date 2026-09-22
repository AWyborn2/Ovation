# Where the data lands: `playhq.*` and how it relates to `central.*`

DDL: `scripts/sql/playhq-schema.sql` (applied by `playhq-load --init`). Loader:
`scripts/src/playhq-load.ts`. Same Postgres as `central` and `wa` (`CENTRAL_DATABASE_URL`),
separate schema, written only by the loader — the app never reads or writes it.

## Tables (all keyed on PlayHQ GUIDs; every load is an idempotent upsert)

| Table                                                                                  | Key                                   | Fed by harness kind                                              | Notes                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scrape_runs`                                                                          | serial                                | `plan`                                                           | one row per loaded dump: plan, export time, row counts                                                                                                                                              |
| `organisations`                                                                        | `id`                                  | every payload that names one                                     | clubs and associations alike; `logo_url` is the Cloudinary crest                                                                                                                                    |
| `seasons`                                                                              | `id`                                  | `grade`                                                          | `org_id` = the organisation whose season list was read                                                                                                                                              |
| `grades`                                                                               | `id` (grade = one season)             | `grade`                                                          | `owner_org_id` = association, `source_org_id` = club discovered through; `is_junior` from the same regex the harness uses                                                                           |
| `teams`                                                                                | `id` (season-specific)                | `grade`, `gradeTeams`, `matches`, `ladder`, `scorecard`, `balls` | team → `org_id` is the club link                                                                                                                                                                    |
| `matches`                                                                              | `id`                                  | `matches`                                                        | fixtures **and** results: `status` UPCOMING/PENDING/COMPLETED/ABANDONED, `start_at`/`end_at` UTC, venue + surface + lat/long, home/away team + org + score, `winner_team_id`, `raw`                 |
| `fixture_changes`                                                                      | serial                                | loader diff                                                      | one row per changed fixture-facing field on re-load (`status, start_at, end_at, venue_name, surface_name, home_team_id, away_team_id, match_type, round_name, result_text, home_score, away_score`) |
| `ladders`                                                                              | `(grade_id, ladder_name, team_id)`    | `ladder`                                                         | season ladder as published, pivoted: points, bonus, quotient, NRR, W/L/T/NR/byes/forfeits, runs & overs for/against                                                                                 |
| `players`                                                                              | `participant_id`                      | `batting`/`bowling`/`fielding`                                   | latest full name ("Surname, Firstname") + short name + last club seen                                                                                                                               |
| `player_grade_stats`                                                                   | `(grade_id, participant_id)`          | same                                                             | the three season reports unioned; verbatim `statistics` blocks in `batting`/`bowling`/`fielding` jsonb                                                                                              |
| `scorecards`                                                                           | `match_id`                            | `scorecard`                                                      | raw `IncludeScorecard` payload + status/result                                                                                                                                                      |
| `match_innings`, `match_batting`, `match_bowling`, `match_fielding`, `fall_of_wickets` | innings guid (+ participant / wicket) | `scorecard`                                                      | normalised lines; `overs_text` verbatim + `balls_bowled` derived                                                                                                                                    |
| `balls`                                                                                | `ball_id`                             | `balls`                                                          | one row per delivery, `seq` = order within innings, `is_wicket` + dismissal/fielder, progress score, highlight URL                                                                                  |

## Joining to what the app already has

- **Players:** `playhq.players.participant_id` = `central.players.participant_id` =
  `wa.players.id` = every `participant_id` on `central.match_batting`/`match_bowling`/`match_rosters`.
  Exact join — this is how WA got 16,534 full names. Never match on name.
- **Matches:** `playhq.matches.id` = `central.matches.playhq_match_id` (text, populated but not
  yet read by any query) = `wa.matches.id`.
- **Clubs:** `playhq.organisations.id` (PlayHQ org GUID) ↔ `scripts/src/data/pca-clubs.ts`
  (`playhqOrgId` 8-char prefix) ↔ `central.clubs` via the tenant row / `wa.club_central_map`.
  There is no GUID column on `central.clubs` today — add one before projecting.
- **Grades:** `playhq.grades.name` → `classifyCentralGrade()` in `lib/db/src/central/grades.ts`
  decides the app grade label and excludes juniors.

## What this deliberately does NOT do (next steps, each a reviewed change)

1. ~~**Fixtures in the app.**~~ Done (Sep 2026): `fixtures.playhq_match_id` + partial unique,
   `tenants.playhq_org_id`, and `scripts/src/playhq-project-fixtures.ts` upsert the tenant's
   upcoming matches into `fixtures` (`source = 'playhq'`) for Social Studio. The public
   Fixtures & Results page (`/fixtures`, `GET /fixtures-results`) reads `playhq.matches` /
   `ladders` directly via `lib/db/src/central/playhq-fixtures.ts`.
2. **Results into `central.*`.** `central.matches`/`match_batting`/`match_bowling` are today
   rebuilt by the external PCA/WA builders. Projecting `playhq.scorecards` into them must go
   through the same offset-id and grade-classification rules and be checked by the
   `*-consistency.test.ts` suites — do not upsert into `central` from this loader.
3. **Season ladders.** `central.ladder` is all-time per (grade, club) with no season; the
   season table in `playhq.ladders` is what `centralLadder()` in `summaries.ts` says it wants.
4. **Ball-by-ball in the app.** Greenfield; `playhq.balls` is the source when a feature needs it.

## Governance

Scraped from the public site under the pilot-only, non-commercial framing in `CLAUDE.md`
("Data governance"). Keep ingest behind this adapter boundary: the harness + loader are the
only things that know the proxy exists, so swapping to the PlayHQ public/partner API
(`docs/playcricket-ingestion.md`) later means replacing `harness.js`, not the schema.
