# Halls Head Cricket Club Stats Portal

A full-stack cricket club statistics portal for Halls Head Cricket Club (est. 1991), seeded with real match data from the club's spreadsheet covering all grades from 1991 to present.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/cricket-club run dev` — run the frontend (port 24624)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS (wouter routing)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all contracts)
- `lib/db/src/schema/` — Drizzle table definitions (players, player_grade_stats, grade_summaries)
- `artifacts/api-server/src/routes/` — Express route handlers (players, stats, grades)
- `artifacts/cricket-club/src/` — React frontend (pages, components, hooks)
- `lib/api-client-react/src/generated/` — Generated React Query hooks (do not hand-edit)
- `lib/api-zod/src/generated/` — Generated Zod schemas for server validation (do not hand-edit)
- `scripts/src/seed.ts` — DB seed script (use executeSql approach to run, not pnpm directly)
- `attached_assets/Halls Head Cricket Club Stats and Honours.xlsx` — Original data source

## Data model

- **player_grade_season_stats** — source-of-truth snapshot table: one row per (player, grade, season). Seed data lives here with `season = NULL` as the baseline snapshot; every PlayCricket CSV import adds rows with the imported season.
- **player_grade_stats** — derived per-(player, grade) aggregate, recomputed by summing snapshots after each import / delete.
- **players** — one row per player; career aggregates (totalGames, totalRuns, totalWickets, gradesPlayed) are derived from player_grade_stats.
- **grade_summaries** — derived from player_grade_stats (one row per grade).
- **imports** — audit row per upload (filename, grade, season, round, kind, row_count, status, imported_at). `kind` is `'csv'` (whole-season) or `'match'` (per-match); `round` is set for match imports. Snapshot rows reference it via `import_id` and cascade-delete with it.
- **matches** — permanent per-match history, one row per (grade, season, round): opponent, date, venue, result, abandoned flag, `hhcc_batted_first` (nullable boolean — true/null = Halls Head batted first, false = opposition batted first; drives true innings order on the scorecard). Cascades from its `import_id`. `source_key` carries the master DB's true match identity for bulk-loaded PlayHQ-era matches (uploads leave it NULL); `opponent_club_id` references `clubs(id)` for branded scorecards. Two partial uniques: `(grade,season,round,stage)` WHERE `source_key IS NULL` (upload path) and `source_key` WHERE NOT NULL (bulk path) — both in `ensure-constraints.ts`, not the Drizzle schema.
- **match_player_lines** — one row per player per match: per-innings batting/bowling/fielding figures. Cascades from `matches`.
- **match_opposition_lines** — display-only opposition innings: one row per opposition player per match (plain-text `name`, NO player FK, full batting/bowling/fielding columns). Captured at import from the scorecard's opposition block (batting), our bowlers (their bowling), and our batsmen's dismissal text (their fielding). NEVER contributes to any club stat/record/leaderboard/milestone; rendered as a second innings on the match page. Abandoned matches store none. Cascades from `matches`.

Grades: A Grade, B Grade, C Grade, D Grade, E Grade, F Grade, Female A Grade, Female B Grade, PPL, Colts

## Architecture decisions

- OpenAPI-first: spec in `lib/api-spec/openapi.yaml` generates both React Query hooks and Zod server validators
- Club Totals data is stored in the `players` table; per-grade breakdown is in `player_grade_stats`
- Seeding was done via raw SQL (executeSql) because the scripts package lacks drizzle-orm at runtime
- Stats body schema components use entity-shaped names (e.g. `StatInput`, not `CreateStatBody`) to avoid Orval TS2308 collision
- `getGradeLeaderboard` has no query params to avoid Orval `GetGradeLeaderboardParams` naming collision

## Product

- **Dashboard** (`/`) — club totals, grade summaries, top performers
- **Players** (`/players`) — searchable/filterable/sortable directory of all 689 players; add new players
- **Player Detail** (`/players/:id`) — all grades played, per-grade stats breakdown
- **Grades** (`/grades`) — summary cards for each grade
- **Grade Leaderboard** (`/grades/:grade`) — full sortable stats table for a specific grade
- **Committee & Captains** — season-by-season office bearers (Committee tab on Honour Boards) and grade captains (history section on each grade leaderboard), from `club_roles`. Admin CRUD at `/admin/committee` with publish/visibility toggle; names link to players where confident, plain text otherwise. Seeded from `artifacts/api-server/src/data/club-roles.json` via `scripts/src/seed-committee.ts`.
- **Records** (`/records`) — all-time club records across all categories. Tabs: Total Club Records, By Grade, Partnerships (highest stand per wicket + every recorded 50+ stand), Centuries, 5-Wicket Hauls. The last three are curated historical lists loaded from the club master DB (read-only; routes in `artifacts/api-server/src/routes/historical.ts`)
- **Team of the Decade** — curated best-XI honour boards. Public view is a self-contained tab on the Honour Boards page (`/`), showing only published boards; admin management at `/admin/team-of-decade` (draft/publish toggle, reorder, lineup with optional player link via PlayerTypeahead, role + captain/VC/keeper flags). Schema: `team_of_decade_boards` + `team_of_decade_members`; routes in `artifacts/api-server/src/routes/team-of-decade.ts`.
- **Match Detail** (`/matches/:id`) — branded two-innings **Digital Cricket Scorecard**. Innings render in true batting order from `matches.hhccBattedFirst`; each innings is a batting card (batting team's colours/logo) + bowling card (bowling team's colours), with dismissal text, strike-rate, overs (ball notation), economy, and an extras breakdown (Nw Nnb Nb/lb). Halls Head players (playerId < 90000) are tappable → career-stats popup (`useGetPlayer`, summed across grade rows); opposition and fill-ins ("Fill-in", playerId ≥ 90000) render as plain text. View-model is the shared pure-TS lib `@workspace/scorecard` (`buildScorecard`) reused by web (`components/scorecard/*`) and mobile (`components/scorecard.tsx`). Hat-tricks show as a flame badge on the bowler; admins manage them via a toggle panel below the card (web only). No export-image button. NB: opposition club brand colours come from `clubs.primaryColour/secondaryColour`; a missing logo degrades to an initials chip.
- **Matches** (`/matches`) — public game-by-game directory; grade + season filters. Initial filters, grade-menu order, and within-season round direction come from admin defaults (see Admin Matches Display); visitors can still change filters after load. Season dropdown + "latest" detection use a grade-only matches query so the season list never collapses to the selected season.
- **Admin Matches Display** (`/admin/match-display`, web only) — admin-controlled defaults for the public Matches page: default grade (or All grades), default season mode (latest/specific/all), grade-menu display order, and within-season round direction (asc/desc). Single global app-config singleton `match_display_settings` (id=1); routes GET/PATCH `/match-display-settings` in `artifacts/api-server/src/routes/matches.ts` (PATCH admin-only). The matches list route reads `roundOrder` for round direction; season ordering always stays newest-first.
- **Stat Edit** (`/stats/:id`) — inline edit/delete a stat record
- **Admin Import** (`/admin/import`) — two modes:
  - **Whole-season CSV** — upload a PlayCricket "Combined Batting/Bowling/Fielding" CSV for a single grade+season, preview matched/new players and totals, confirm to commit; list and delete past imports. PlayCricket grade-name mapping lives in `artifacts/api-server/src/lib/playcricket-csv.ts` (`PLAYCRICKET_GRADE_MAP`).
  - **Per-match xlsx** — upload one match scorecard `.xlsx`, preview header + parsed batting/bowling/fielding (matched/new players, abandoned flag). The round is pre-filled from the scorecard header but is editable in the preview (sent in the commit body as `round`); the admin-entered value is what gets written. Commit to ADD that match to the running season total and store permanent per-match history. Undo a whole season (rolls back stats, auto-created caps, and orphan players) via the Undo Season card. Parser: `artifacts/api-server/src/lib/match-scorecard.ts`. **Use CSV or per-match for a given grade+season, not both** (see Gotchas).
  - Admin auth required (session cookie); single-club portal.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Re-run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change
- Don't add query params to `getGradeLeaderboard` — Orval naming collision with params schema
- The spreadsheet has a "CLUB TOTAL" summary row that must be filtered out during seeding (null given_name)
- Seeding via `pnpm --filter @workspace/scripts run seed` fails (drizzle-orm not available in scripts at runtime); use executeSql callback or install drizzle-orm in scripts/package.json dependencies
- **Don't re-add the `cap_register` composite unique to the Drizzle schema.** drizzle-kit 0.31 can't detect the existing `(category, cap_number)` unique, so it re-proposes it every `push`, rendering a truncate prompt that has no TTY in post-merge → silent migration failure. The constraint is left out of `lib/db/src/schema/cap_register.ts` on purpose and re-created idempotently by `scripts/src/ensure-constraints.ts` (run from `scripts/post-merge.sh` after `pnpm --filter db push`). Add any future un-manageable constraint to that script, not the schema.
- **One ingestion method per (grade, season).** Match commit re-derives the season snapshot by DELETE+INSERT of `player_grade_season_stats` rows with `import_id IS NULL` for that grade+season; a whole-season CSV import writes the same kind of rows. Mixing both for the SAME grade+season lets one clobber the other. Different grades/seasons are independent and safe.
- **Master `career_stats` is hand-kept and gappy; match scorecards are the authoritative match-era record.** The master export's career/season aggregates have documented holes (e.g. `stats_to` showing "+gap 2021/22+2022/23", partial "+PHQ" seasons). When bulk-loading match history (`load-matches`), we chose **Option A (user-approved): let match history fill the gaps — career/season totals rise** rather than capping at the stale master figures. The ~1,555 extra appearances this adds are HHCC players' own previously-missing games, NOT opposition. The ETL peels each match-era (grade,season) out of the `season=NULL` baseline with a floor so careers never go negative, recording `baseline_adjustments` for reversal.
- **Fill-ins (player_id ≥ 90000) live in `match_player_lines` for scorecard history but must be excluded from every derivation.** They have no real player record. The ETL already excludes them from season-snapshot derivation; `milestones.ts` filters `playerId < 90000` so they never surface as a club milestone (they were appearing as "Fill-in Fill-in"). Any future query that iterates `match_player_lines` for stats/records must apply the same filter.
- **A master reload must clear `baseline_adjustments` or the next match load double-counts careers.** `master-etl.sql` wipes and rebuilds the season=NULL career baseline from scratch; a freshly rebuilt baseline has zero outstanding peels by definition, so the old `baseline_adjustments` (peels recorded against the PREVIOUS baseline) are now stale. `matches-etl.sql` step 2a "reverses prior peels" by ADDING `baseline_adjustments` back onto the baseline — if those stale rows survive, it adds them on top of the fresh full-career baseline and every previously match-loaded (player,grade) ends up with roughly double its games/runs/wickets. `master-etl.sql` therefore `DELETE`s `baseline_adjustments` right after wiping `player_grade_season_stats`. Validate any full reload with: per (player,grade), `player_grade_stats.games` must equal `GREATEST(master career_stats games, summed match-era season games)` — never more (double-count) and never less than master (over-peel).

## Pointers

- **Master DB load** — the club's full master database export is the authoritative source for player roster, caps, premierships, club roles, award winners, life members, Team of the Decade, opposition clubs, and the historical records (partnerships, centuries, five-fors, club/honour-board records). Loaded via `scripts/src/load-master-db.ts` (`pnpm --filter @workspace/scripts run load-master-db [--commit]`): picks the newest dump in `attached_assets`, builds a `staging` schema, previews row diffs by default, and `--commit` runs `scripts/sql/master-etl.sql` (backup → replace owned DATA tables → recompute → setval) and verifies vs master career views. Idempotent/re-runnable; backup kept in schema `master_load_backup`. App-config tables (awards defs, honour-board config, admins, captains) are preserved, not replaced.
- **Match history bulk load** — the master DB's complete match history (2,102 matches, 2003/04–2025/26, both innings) is loaded into `matches` / `match_player_lines` / `match_opposition_lines` via `scripts/src/load-matches.ts` (`pnpm --filter @workspace/scripts run load-matches [-- --commit]`). Picks the newest dump, builds a `staging` schema, previews by default. Runs `scripts/sql/matches-etl.sql`: maps master grade→app grade (PPL before 2019 → A Grade, U21 Colts → Colts), season→start-year int, round/finals→`round`/`stage`; maps the dump's `hh_batted_first` straight onto `matches.hhcc_batted_first` so bulk matches render in true innings order without the separate backfill script; preserves master match identity in `source_key`; copies `opponent_club_id` from master clubs (ids preserved). HH lines link `player_id` (NULL-player privacy-masked lines dropped); fielding not in master so 0 on lines (career fielding stays in baseline). Re-runnable (reversal phase keys on `source_key IS NOT NULL`). The step-7 season aggregation uses `DISTINCT ON` tables + indexes (not an O(n²) LATERAL); the full master+matches load now finishes in seconds via `psql --single-transaction` — `buildStaging` must load the dump with `psql -1` (single transaction) or it crawls under per-statement autocommit. **Run master-etl BEFORE matches-etl** (matches-etl LEFT JOINs `public.clubs`, populated by master-etl).
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `docs/playcricket-ingestion.md` — spike findings on pulling stats directly from playcricket.com.au. Decision: **stay on CSV**. PlayHQ's public API does not expose per-grade cricket aggregates, and the private profile-stats endpoints need partner approval. Do not re-investigate without explicit user demand.
