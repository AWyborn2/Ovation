---
name: raw SQL bigint sums return as strings
description: db.execute raw SQL SUM/bigint columns arrive as JS strings, breaking client-side numeric reduces
---

When an endpoint builds rows with `db.execute(sql\`...\`)` raw SQL, Postgres
`bigint`/`int8` and `numeric` columns are returned by the node-postgres driver as
**JS strings**, NOT numbers — even when the generated OpenAPI/Zod type says `integer`.
`SUM(int_col)` returns `int8`, so it comes back as a string.

**Symptom:** a client-side `rows.reduce((acc, r) => acc + (r.col ?? 0), 0)` totals row
shows garbled CONCATENATED digits (e.g. "051823101519...") instead of a sum, because
`number + string` is string concatenation. Individual cells look fine (strings render
and display correctly).

**Fix:** cast integer aggregates to `::int` (int4) in the SQL — node-postgres returns
int4 as a real JS number. `real`/`float4`/`float8` are already returned as numbers, so
computed averages were unaffected.

**How to apply:** any new raw-SQL endpoint that SUMs counts and whose values feed a
numeric computation (client or server) must `::int`-cast the sums, or coerce with
`Number()` at the consumer.
