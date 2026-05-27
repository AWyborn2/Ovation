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
- **imports** — audit row per CSV upload (filename, grade, season, row_count, status, imported_at). Snapshot rows reference it via `import_id` and cascade-delete with it.

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
- **Records** (`/records`) — all-time club records across all categories
- **Stat Edit** (`/stats/:id`) — inline edit/delete a stat record
- **Admin Import** (`/admin/import`) — upload a PlayCricket "Combined Batting/Bowling/Fielding" CSV for a single grade+season, preview matched/new players and totals, confirm to commit; list and delete past imports. PlayCricket grade-name mapping lives in `artifacts/api-server/src/lib/playcricket-csv.ts` (`PLAYCRICKET_GRADE_MAP`). No auth yet — single-user club portal.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Re-run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec change
- Don't add query params to `getGradeLeaderboard` — Orval naming collision with params schema
- The spreadsheet has a "CLUB TOTAL" summary row that must be filtered out during seeding (null given_name)
- Seeding via `pnpm --filter @workspace/scripts run seed` fails (drizzle-orm not available in scripts at runtime); use executeSql callback or install drizzle-orm in scripts/package.json dependencies

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `docs/playcricket-ingestion.md` — spike findings on pulling stats directly from playcricket.com.au. Decision: **stay on CSV**. PlayHQ's public API does not expose per-grade cricket aggregates, and the private profile-stats endpoints need partner approval. Do not re-investigate without explicit user demand.
