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

**Update — the match-import path closes both gaps (CSV path still has them).**
The per-match xlsx import adds an `undo-season` flow (and per-match delete) that
calls a shared `rollback.ts`: `reverseCaps` deletes `auto_created` caps whose
player has lost ALL games in that grade, and `cleanupOrphanPlayers` removes
players whose only appearance was the undone match. Verified e2e: commit two
matches (R2 stats + R1 abandoned) for A Grade 2025, then undo-season → matches,
match lines, NULL-importId season snapshot rows, match imports, the new orphan
player, AND the 10 auto-created caps all rolled back to baseline. The legacy
whole-season **CSV delete** still only restores stats (gaps 1 & 2 above remain
for that path) — if you ever want CSV delete to fully roll back, reuse
`rollback.ts` there too.
