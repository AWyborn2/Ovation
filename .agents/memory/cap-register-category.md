---
name: A Grade cap register categories
description: How the cap_register is split into male/female lists and auto-synced from imports.
---

# A Grade cap register categories

The `cap_register` carries a `category` column (`male` | `female`), defaulting to
`male`. Uniqueness is a **composite** `(category, cap_number)` constraint
(`cap_register_category_cap_number_unique`), so each list numbers independently
(male #1 and female #1 coexist). The original global unique on `cap_number` was
dropped via raw SQL (drizzle-kit push can't do this non-interactively).

## Composite unique now lives in the schema + migrations (superseded note)
Until plan.md §5.4 the `(tenant_id, category, cap_number)` unique was kept OUT of
the Drizzle schema because drizzle-kit 0.31's `push` cannot detect an existing
multi-column unique and re-proposed it on every run (an interactive truncate
prompt hung the non-TTY post-merge). Schema changes now ship as reviewed
migrations (`pnpm --filter @workspace/db run generate` → `lib/db/migrations`,
applied by `run migrate` in CI and post-merge), which diff against a snapshot
rather than the live database, so the constraint is declared in
`lib/db/src/schema/cap_register.ts` and created by the migrations.
`scripts/src/ensure-constraints.ts` is now a read-only verifier (`--apply`
repairs in place). Do not run `drizzle-kit push` against a shared database.
