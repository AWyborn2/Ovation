---
name: Postgres DESC NULLs-first ordering
description: ORDER BY agg DESC puts NULL aggregates at the top in Postgres; use NULLS LAST for "top performer" leaderboards.
---

# Postgres DESC sorts NULLs first

`ORDER BY <agg> DESC` in Postgres places NULL results **before** real values
(NULLs are considered "largest" under DESC). For derived "top performer"
queries (e.g. records `topAggregate` summing a column), a player whose summed
value is NULL sorts to the top and the record renders as 0 / the wrong player.

**The rule:** any leaderboard / "top N" aggregate ordered DESC must use
`ORDER BY <agg> DESC NULLS LAST` (in Drizzle: `orderBy(sql\`\${sum(col)} desc nulls last\`)`,
not `orderBy(desc(sum(col)))`).

**Why:** drove the Records page "Total Club Records" zeros bug — the top cards
showed 0 because a NULL-aggregate player led the DESC sort.
