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

**Production status (verified May 2026): no live prod DB exists yet.** The app
has never been published, so there is no production Neon database to carry the
landmine. `executeSql({environment:"production"})` returns `PRODUCTION_DATABASE_ERROR`
("Deploy your app first to create a production database"). Agent CANNOT write to
prod anyway: prod access is read-only and prod schema is owned by the Publish flow
(never run DDL/INSERT against prod — see database-migrations-on-publish).

**Why prod is already safe for the first publish:** prod is created/seeded from
dev on Publish. Dev is now fully consistent — snapshot table populated (1628 rows)
and replaying recompute against dev yields 0 real diffs across player_grade_stats
(counting + high_score + best_bowling + averages), players career totals, and
grade_summaries. Dev schema already carries all three migrations (players.image_url,
card_themes table, sponsors.card_kinds). So publishing dev → prod produces a
consistent prod with NO empty-snapshot landmine. User just needs to publish (and
include data / choose overwrite-data on first publish so the populated snapshot
reaches prod).

**How to apply / still TODO:**
- Re-verify after any future change that adds derived rows without snapshot rows.
- Do NOT let an import/delete hit a prod that was seeded schema-only with
  pre-existing derived data (that recreates the landmine); first publish from
  consistent dev avoids this.
- Benign side-effects a future recompute will introduce for touched grades:
  zero-valued totals stored as `0` become `NULL` (display-equal), and
  `grades_played` re-sorts alphabetically (e.g. "Colts" moves from last to after
  "C Grade"). Harmless, expected.
- There is a stray `CLUB TOTAL` row in `grade_summaries` (not a real grade);
  recompute never touches it because it's never in the affected-grade list.
