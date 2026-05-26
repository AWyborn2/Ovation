---
name: Seeding from xlsx spreadsheets
description: How to reliably seed a database from an Excel file in this monorepo, and what approaches fail.
---

**Rule:** Use the `executeSql` code_execution callback for seeding large datasets. Do NOT run seed scripts via `pnpm --filter @workspace/scripts run seed` unless drizzle-orm is explicitly added to `scripts/package.json` dependencies (not just devDependencies).

**Why:** The scripts package doesn't transitively resolve workspace packages' peer deps (drizzle-orm) at tsx runtime, causing `ERR_MODULE_NOT_FOUND`. The root `node -e` approach also fails because `pg` isn't in root devDependencies.

**How to apply:**
1. Use `xlsx` (pnpm add -w xlsx) to parse the spreadsheet via bash/node in a one-off script.
2. Export parsed JSON to `/tmp/*.json` files.
3. Use `executeSql` callback to TRUNCATE and re-insert in batches of 100–200 rows using raw SQL string building.
4. Watch for aggregate/summary rows in spreadsheets (e.g. "CLUB TOTAL") with null required fields — filter them before inserting.
5. For player-stat foreign key relationships: insert parent table first, build an in-memory name→ID map, then insert child rows.
