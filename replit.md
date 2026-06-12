# Halls Head Cricket Club Stats Portal

A full-stack cricket club statistics portal for Halls Head Cricket Club (est. 1991), seeded with real match data covering all grades from 1991 to present.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm --filter @workspace/cricket-club run dev` — frontend (port 24624)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (tenant app DB)
- `CENTRAL_DATABASE_URL` — read-only Postgres connection string for the central PCA database (schema `central`); used by `lib/db/src/central.ts`. Separate from `DATABASE_URL`; never written to by the app.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS (wouter routing)
- API: Express 5 · DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod` · API codegen: Orval (from OpenAPI spec) · Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all contracts)
- `lib/db/src/schema/` — Drizzle table definitions
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/cricket-club/src/` — React frontend (pages, components, hooks)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not hand-edit)
- `lib/api-zod/src/generated/` — generated Zod schemas for server validation (do not hand-edit)
- `scripts/src/seed.ts` — DB seed script (run via executeSql, not pnpm directly)
- `attached_assets/Halls Head Cricket Club Stats and Honours.xlsx` — original data source

## Data model

- **player_grade_season_stats** — source-of-truth snapshot: one row per (player, grade, season). Seed/baseline rows use `season = NULL`; each PlayCricket CSV import adds rows with the imported season.
- **player_grade_stats** — derived per-(player, grade) aggregate, recomputed by summing snapshots after each import/delete.
- **players** — one row per player; career aggregates derived from player_grade_stats.
- **grade_summaries** — derived from player_grade_stats (one row per grade).
- **imports** — audit row per upload (filename, grade, season, round, kind, row_count, status). `kind` is `'csv'` (whole-season) or `'match'` (per-match). Snapshot rows reference it via `import_id` and cascade-delete with it.
- **matches** — permanent per-match history, one row per (grade, season, round). `hhcc_batted_first` (nullable bool; true/null = HH batted first) drives true innings order. `source_key` carries the master DB's match identity for bulk-loaded matches (uploads leave NULL); `opponent_club_id` → `clubs(id)` for branded scorecards. Two partial uniques live in `ensure-constraints.ts`, NOT the Drizzle schema: `(grade,season,round,stage)` WHERE `source_key IS NULL` and `source_key` WHERE NOT NULL.
- **match_player_lines** — one row per player per match: per-innings batting/bowling/fielding. Cascades from `matches`.
- **match_opposition_lines** — display-only opposition innings (plain-text `name`, NO player FK). Captured at import; NEVER contributes to any club stat/record/leaderboard/milestone; rendered as a second innings. Abandoned matches store none. Cascades from `matches`.

Grades: A Grade, B Grade, C Grade, D Grade, E Grade, F Grade, Female A Grade, Female B Grade, PPL, Colts

### Juniors web section (`/juniors/*`)

Parallel public section to the senior side, reached via a Seniors/Juniors toggle in `layout.tsx`. Uses the **same gold (`--primary`) accents as seniors** — the only visual differentiator is the section banner, which on `/juniors*` is club brown `#42342B` with gold writing (the brown hex survives in exactly one place on purpose: the juniors banner branch in `layout.tsx`; `JUNIOR_ACCENT` in `src/lib/juniors.ts` is just gold token aliases). Pages in `artifacts/cricket-club/src/pages/juniors-*.tsx`: dashboard, matches list + detail (two-innings scorecard), premierships honour board, players directory + leaderboards, player detail. Uses ONLY `/api/juniors/*` hooks; never blends junior+senior. "Most Games" leaderboard is derived client-side from the players list (no games endpoint). Junior scorecards reuse the senior `BattingCard`/`BowlingCard` via `buildJuniorScorecard` in `lib/scorecard/src/junior-mapping.ts` (junior playerId always null → plain-text names). Private players masked server-side.

### Juniors data (kept COMPLETELY SEPARATE from senior records)

Junior data lives in isolated `junior_*` tables, served only via `/api/juniors/*`. No junior query ever touches a senior table; junior/senior stats NEVER combine. The only bridge is `junior_participants.senior_player_id` (plain nullable integer — deliberately NO FK to `players.id`), a cross-reference link only, never used to merge figures.

- **Age bands (school-year, unified):** `junior_matches.age_group` and `junior_premierships.age_group` are **OVERLOADED** to hold a unified school-year band — Year 4 … Year 9, **Year 10-11** (merges old U16+U17), plus **Girls League**. ETL fills `age_group = COALESCE(dump age_band, pg_temp.jr_band(...))` (`jr_band()` maps U10→Year 4 … U15→Year 9, U16/U17→Year 10-11, passes through existing "Year N"/"Girls League"). Original label preserved in `age_group_raw`. **Why overload:** every filter/leaderboard/board groups on `age_group`, so the merge is a pure ETL concern with no query/UI change.
- **junior_matches** — one row per junior match (PlayHQ export). Carries `team1/team2` + scores, `opponent_name`, `hh_result`, `hh_batted_first`, free-text `season` ("2024/25"), `age_group` (band) + `age_group_raw`, `round`, `match_date` (now populated for ALL matches), `association` ("Peel Junior Cricket Association", "South West Junior (SWMJCC)", "Community Cup"), `venue` + `venue_oval`/`venue_address`/`venue_suburb`, statuses like "Played (stats not recorded)". Parses `season_start_year` (int) for newest-first ordering.
- **junior_match_batting / junior_match_bowling / junior_match_rosters** — per-line figures; each has `is_halls_head` and a plain-TEXT `participant_id` (NO FK — opposition players have ids but no participant row). `innings` aligns batting and bowling.
- **junior_participants** — one row per known HH junior (694 rows; 6 are `is_private`).
- **junior_premierships / junior_premiership_players** — curated premiership honour boards (15 boards, 180 players); carry `association`/`venue`/`venue_oval`.
- **Privacy rule (the 6 `is_private` participants are hidden everywhere):** in scorecards their lines are MASKED (kept so totals add up, but `participantId` nulled, name → "Private Player", `isPrivate: true`); in directories/leaderboards/aggregates they are EXCLUDED. Those queries inner-join `junior_participants` and filter `is_private = false`, which drops opposition (no participant row) AND private players at once. Match-detail/roster masking needs the explicit private-id set (those lines must still render).

## Architecture decisions

- OpenAPI-first: spec in `lib/api-spec/openapi.yaml` generates both React Query hooks and Zod server validators
- Club Totals stored in `players`; per-grade breakdown in `player_grade_stats`
- Seeding done via raw SQL (executeSql) because scripts package lacks drizzle-orm at runtime
- Stats body schemas use entity-shaped names (`StatInput`, not `CreateStatBody`) to avoid Orval TS2308 collision
- `getGradeLeaderboard` has no query params to avoid Orval `GetGradeLeaderboardParams` naming collision

## Product

- **Overview** (`/`) — seniors home: club totals, quick links, Recent Matches (most recent per grade in latest season), Top Performers (latest-season top run scorers + wicket takers, club-wide with per-grade chip filter). Excludes fill-ins (playerId ≥ 90000). Mirrors the juniors `/juniors` dashboard.
- **Honour Boards** (`/honour-boards`) — milestones, statistics, honour boards, A Grade caps, life members, and the public Team of the Decade tab (published boards only).
- **Players** (`/players`) — searchable/filterable/sortable directory; add new players. **Player Detail** (`/players/:id`) — per-grade stats breakdown.
- **Grades** (`/grades`) — summary cards. **Grade Leaderboard** (`/grades/:grade`) — full sortable stats table + grade captain history.
- **Committee & Captains** — office bearers (Committee tab on Honour Boards) and grade captains (per grade), from `club_roles`. Admin CRUD at `/admin/committee` (publish toggle); names link to players where confident. Seeded from `artifacts/api-server/src/data/club-roles.json` via `scripts/src/seed-committee.ts`. A role row can link to EITHER a player (`playerId`) OR a non-player official (`nonPlayerId`) — mutually exclusive, enforced at UI level only.
- **Non-player people** (`/admin/people`, `routes/people.ts`, table `non_player_people`) — lightweight profiles for club officials who served but never played (so they have no `players` row). Admins CRUD name + optional bio; committee/captain rows link via `club_roles.nonPlayerId` (FK onDelete set null). Public bio page `/people/:id` shows name, bio, and service history (published club-roles filtered by `nonPlayerId`). Committee tab + grade-leaderboard captain names render as links for both player and non-player links.
- **Records** (`/records`) — all-time records. Tabs: Total Club Records, By Grade, Partnerships, Centuries, 5-Wicket Hauls. The last three are curated historical lists from the master DB (read-only; `routes/historical.ts`).
- **Team of the Decade** — curated best-XI boards; admin management at `/admin/team-of-decade` (draft/publish, reorder, lineup with optional player link, role + captain/VC/keeper flags). Schema `team_of_decade_boards` + `_members`; `routes/team-of-decade.ts`.
- **Match Detail** (`/matches/:id`) — branded two-innings Digital Cricket Scorecard. Innings render in true batting order from `matches.hhccBattedFirst`; each is a batting card + bowling card with dismissal text, strike-rate, overs (ball notation), economy, extras breakdown. HH players (playerId < 90000) are tappable → career-stats popup; opposition and fill-ins render as plain text. View-model is the shared lib `@workspace/scorecard` (`buildScorecard`), reused by web + mobile. Hat-tricks show a flame badge (admin toggle panel, web only). Opposition brand colours from `clubs.primaryColour/secondaryColour`; missing logo degrades to an initials chip.
- **Matches** (`/matches`) — public game-by-game directory; grade + season filters. Initial filters, grade-menu order, and round direction come from admin defaults; visitors can still change them. Season dropdown uses a grade-only query so the list never collapses to the selected season.
- **Admin Matches Display** (`/admin/match-display`, web only) — admin defaults for the Matches page (default grade, season mode, grade-menu order, round direction). Singleton `match_display_settings` (id=1); GET/PATCH `/match-display-settings` in `routes/matches.ts` (PATCH admin-only). Season ordering always newest-first.
- **Stat Edit** (`/stats/:id`) — inline edit/delete a stat record.
- **Admin Import** (`/admin/import`, admin auth via session cookie) — two modes:
  - **Whole-season CSV** — upload a PlayCricket "Combined" CSV for one grade+season, preview matched/new players + totals, commit; list/delete past imports. Grade-name mapping in `routes`/`lib/playcricket-csv.ts` (`PLAYCRICKET_GRADE_MAP`).
  - **Per-match xlsx** — upload one match scorecard, preview header + parsed lines (round editable, sent as `round`). Commit ADDs the match to the running season total + permanent history. Undo Season rolls back stats, auto-created caps, and orphan players. Parser: `lib/match-scorecard.ts`. **Use CSV or per-match for a given grade+season, not both** (see Gotchas).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Re-run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change.
- Don't add query params to `getGradeLeaderboard` — Orval naming collision.
- The spreadsheet's "CLUB TOTAL" summary row must be filtered out during seeding (null given_name).
- Seeding via `pnpm --filter @workspace/scripts run seed` fails (drizzle-orm not at runtime); use executeSql or add drizzle-orm to scripts deps.
- **Don't re-add the `cap_register` composite unique to the Drizzle schema.** drizzle-kit 0.31 can't detect the existing `(category, cap_number)` unique, re-proposes it every `push`, and the truncate prompt has no TTY in post-merge → silent migration failure. It's left out on purpose and re-created idempotently by `scripts/src/ensure-constraints.ts` (run from `post-merge.sh` after `db push`). Add any future un-manageable constraint there, not the schema.
- **One ingestion method per (grade, season).** Match commit re-derives the season snapshot by DELETE+INSERT of `player_grade_season_stats` rows with `import_id IS NULL`; a whole-season CSV writes the same kind of rows. Mixing both for the SAME grade+season lets one clobber the other. Different grades/seasons are independent.
- **Master `career_stats` is hand-kept and gappy; match scorecards are the authoritative match-era record.** When bulk-loading match history, we chose **Option A (user-approved): let match history fill the gaps — career/season totals rise** rather than capping at stale master figures (~1,555 extra appearances are HHCC players' own missing games, NOT opposition). The ETL peels each match-era (grade,season) out of the `season=NULL` baseline with a floor (careers never go negative), recording `baseline_adjustments` for reversal.
- **Fill-ins (player_id ≥ 90000)** live in `match_player_lines` for scorecard history but must be EXCLUDED from every derivation (no real player record). The ETL and `milestones.ts` already filter `playerId < 90000`; any new query iterating `match_player_lines` for stats/records must do the same.
- **A master reload must clear `baseline_adjustments` or the next match load double-counts careers.** `master-etl.sql` rebuilds the season=NULL baseline from scratch (so old peels recorded against the PREVIOUS baseline are stale); `matches-etl.sql` step 2a adds `baseline_adjustments` back onto the baseline, so stale rows would double every match-loaded (player,grade). `master-etl.sql` therefore DELETEs `baseline_adjustments` right after wiping `player_grade_season_stats`. Validate a full reload: per (player,grade), `player_grade_stats.games` must equal `GREATEST(master career games, summed match-era season games)` — never more (double-count), never less (over-peel).

## Pointers

- **Master DB load** (`scripts/src/load-master-db.ts`, `pnpm --filter @workspace/scripts run load-master-db [--commit]`) — the club's full master export is the authoritative source for roster, caps, premierships, club roles, award winners, life members, Team of the Decade, opposition clubs, and historical records. Picks the newest dump in `attached_assets`, builds a `staging` schema, previews row diffs by default; `--commit` runs `scripts/sql/master-etl.sql` (backup → replace owned DATA tables → recompute → setval) and verifies vs master career views. Idempotent; backup in schema `master_load_backup`. App-config tables (awards defs, honour-board config, admins, captains) are preserved, not replaced.
- **Match history bulk load** (`scripts/src/load-matches.ts`, `... run load-matches [-- --commit]`) — loads the master's complete match history (~2,102 matches, both innings) into `matches`/`match_player_lines`/`match_opposition_lines`. Runs `scripts/sql/matches-etl.sql`: maps master grade→app grade (PPL before 2019 → A Grade, U21 Colts → Colts), season→start-year int, round/finals→`round`/`stage`; maps `hh_batted_first` onto `matches.hhcc_batted_first` for true innings order; preserves match identity in `source_key`; copies `opponent_club_id`. HH lines link `player_id` (NULL-player masked lines dropped); fielding 0 on lines (career fielding stays in baseline). Re-runnable. `buildStaging` must load the dump with `psql -1` or it crawls. **Run master-etl BEFORE matches-etl** (matches-etl LEFT JOINs `public.clubs`, populated by master-etl).
- **Juniors DB load** (`scripts/src/load-juniors-db.ts`, `... run load-juniors-db [-- --commit]`) — loads the self-contained JUNIORS dump into the isolated `junior_*` tables. Mirrors load-master-db: newest dump, `juniors_staging` schema (loaded via `psql -1`), preview by default, `--commit` runs `scripts/sql/juniors-etl.sql` (idempotent full replace). The ETL **snapshots + re-applies** `junior_participants.senior_player_id` across the replace so manual cross-reference links survive a reload. Served read-only via `/api/juniors/*`. Senior tables NEVER touched.
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- `docs/playcricket-ingestion.md` — spike on pulling stats directly from playcricket.com.au. Decision: **stay on CSV** (PlayHQ's public API doesn't expose per-grade aggregates; private endpoints need partner approval). Don't re-investigate without explicit demand.
