---
name: snapshot baseline backfill (data-loss landmine)
description: The original seed wrote directly to derived tables, leaving the snapshot source-of-truth empty — making recompute a data-loss bomb. Dev was backfilled; prod has the same landmine.
---

# Snapshot baseline backfill

The original spreadsheet seed populated the **derived** tables directly
(`player_grade_stats`, `players`, `grade_summaries`, `cap_register`) but left the
source-of-truth snapshot table `player_grade_season_stats` **empty**.

`recomputeAggregates` (runs on EVERY import commit and EVERY import delete) does
`DELETE player_grade_stats WHERE grade IN (...)` then rebuilds by SUMming the
snapshot table. With the snapshot empty, the first import/delete touching a grade
would have **wiped that grade's entire history**.

**Fix applied (dev only):** backfilled one baseline row per `(player, grade)` into
`player_grade_season_stats` with `season = NULL`, `import_id = NULL`, copying the
counting stats + `high_score` + `best_bowling` (NOT the averages — recompute
re-derives those). Verified by replaying the recompute SQL and diffing against the
live derived tables: **0 real diffs** (treating `0 ≈ NULL` and `'' ≈ NULL`, which
are the only representational normalisations recompute introduces).

**Why it round-trips exactly:** one baseline row per (player,grade) ⇒ `SUM`
reduces to identity; `high_score`/`best_bowling` MAX/best-of picks that single row;
`bat_avg`/`bowl_avg` re-derived by the same formula (verified 0 off).

**How to apply / still TODO:**
- **Production has the identical empty-snapshot landmine.** Before any import runs
  against prod, run the same backfill there (after the outstanding schema
  migrations land). Do NOT let an import/delete hit prod first.
- Benign side-effects a future recompute will introduce for touched grades:
  zero-valued totals stored as `0` become `NULL` (display-equal), and
  `grades_played` re-sorts alphabetically (e.g. "Colts" moves from last to after
  "C Grade"). Harmless, expected.
- There is a stray `CLUB TOTAL` row in `grade_summaries` (not a real grade);
  recompute never touches it because it's never in the affected-grade list.
