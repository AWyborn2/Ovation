# Legacy single-tenant one-offs

Everything in this directory was written when the database held **one club**
(Halls Head, before the white-label transition) and none of it knows about
`tenant_id`:

| File                            | What it did                           | Why it is dangerous today                  |
| ------------------------------- | ------------------------------------- | ------------------------------------------ |
| `fix-a-grade-cap-duplicates.ts` | One-off cap register repair (2025/26) | Grade-wide deletes on `player_grade_stats` |
| `remove-a-grade-2025-26.ts`     | One-off season reversal               | Grade-wide deletes on the stats core       |
| `add-a-grade-2025-26-debuts.ts` | One-off companion to the above        | Inserts assume the single-tenant shape     |

**Do not run any of these against the shared multi-tenant database.** They are
kept for provenance of tenant #1's data. If one is ever needed again, port it to
`scripts/src/` using the guard rails in `scripts/src/lib/cli.ts` (`--tenant`,
`--dry-run`, non-local confirmation) and add `WHERE tenant_id = :tenant` to every
statement first.

The files here are runnable with `pnpm --filter @workspace/scripts run
legacy:<name>` but are excluded from the workspace typecheck.

The three ETL files in `scripts/sql/` (`master-etl.sql`, `matches-etl.sql`,
`juniors-etl.sql`) are also single-tenant but stay where they are: the
`load-*-db.ts` loaders and the juniors ETL test depend on them. Each now carries
a banner comment saying so.
