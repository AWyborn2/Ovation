---
name: Seeding from xlsx spreadsheets
description: How to reliably seed a database from an Excel file in this monorepo, and what approaches fail.
---

**Rule:** Either run a `tsx` script in the `scripts` package OR use the `executeSql` code_execution callback for seeding/migrations. The `scripts` package now declares `@workspace/db` + `drizzle-orm` in its `dependencies`, so `pnpm --filter @workspace/scripts run <script>` works at tsx runtime (e.g. `ensure-constraints`, `remove-a-grade-2025-26`). `executeSql` remains the quickest path for one-off ad-hoc SQL.

**Why:** Historically the scripts package lacked `drizzle-orm` at runtime (`ERR_MODULE_NOT_FOUND`); that has been fixed by adding the deps. The root `node -e` approach still fails because `pg` isn't in root devDependencies.

**How to apply:**
1. Use `xlsx` (pnpm add -w xlsx) to parse the spreadsheet via bash/node in a one-off script.
2. Export parsed JSON to `/tmp/*.json` files.
3. Use `executeSql` callback to TRUNCATE and re-insert in batches of 100–200 rows using raw SQL string building.
4. Watch for aggregate/summary rows in spreadsheets (e.g. "CLUB TOTAL") with null required fields — filter them before inserting.
5. For player-stat foreign key relationships: insert parent table first, build an in-memory name→ID map, then insert child rows.
