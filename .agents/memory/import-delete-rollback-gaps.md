---
name: Import delete rollback gaps
description: An end-to-end season upload+commit+delete round-trip restores the STATS tables exactly, but two non-stats side-effects are NOT reversed on delete.
---

# Import delete rollback gaps

A real PlayCricket "Combined" CSV (A Grade, 20 rows) was uploaded → previewed →
committed → deleted end-to-end against the dev DB (baseline snapshot intact).

**What works (verified by md5 of normalised projections, before vs after-delete):**
- `player_grade_stats`, `grade_summaries`, `players` career totals, and
  `player_grade_season_stats` all round-trip **exactly** to the pre-import
  baseline. Commit deltas matched the preview exactly (games/runs/wkts/+1 new
  player). The data-loss landmine fix holds: history is preserved, then restored.

**What is NOT rolled back on import delete (two real gaps):**

1. **`cap_register` is a one-way sync.** Commit runs `syncCapsFromStats` (creates
   new caps, flips `in_stats` on, refreshes `games_a_grade`). The delete handler
   only calls `recomputeAggregates` — it never reverses any cap mutation. After a
   commit+delete cycle the cap list keeps the newly-created caps, the flipped
   `in_stats` flags, and the inflated `games_a_grade`.

2. **New players created at commit become stale orphans on delete.** A brand-new
   player (only appearance = the deleted import) keeps frozen career totals
   (e.g. total_games=20) while having zero `player_grade_stats` /
   `player_grade_season_stats` rows. **Why:** `recomputeAggregates` step 2 builds
   its "affected players" set from players *still having rows* in the affected
   grade; once the snapshot+pgs rows are gone, the orphan is no longer "affected"
   so its `players` aggregates never get recomputed to NULL. The player row also
   persists (delete only cascades snapshot rows, not players).

**How to apply:** treat import delete as restoring *stats* only. If true rollback
is needed, delete must also (a) reverse/re-derive the cap register and (b) include
players who had rows *before* the delete (snapshot the affected player set up
front, like commit does for milestone detection) so orphaned aggregates get
zeroed and zero-stat players created by the import are cleaned up.

Note: ~6 male caps with `in_stats=true` but no A Grade stats are PRE-EXISTING seed
data-quality issues (see cap-data-quality.md), not caused by import/delete.
