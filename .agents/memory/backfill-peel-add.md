---
name: Backfill previous seasons (peel vs add)
description: How previous-season backfill imports reconcile against the season=NULL baseline, and the invariants the peel/add modes must preserve.
---

# Backfill (previous-season) imports: peel vs add

Admins can import a PREVIOUS (grade, season) via whole-season CSV, per-match xlsx,
or batch, with a per-import reconcile choice. The choice rides in the commit body
as `reconcileMode` ("peel" | "add" | null). null = a normal current-season import.

## The invariant
Career totals (`players.totalGames/Runs/Wickets`, derived from `player_grade_stats`
← `player_grade_season_stats`) MUST stay constant under a **peel**. Peel exists for
seasons ALREADY baked into the grade's `season=NULL` baseline: it subtracts the
season's per-player contribution from that baseline so the now-itemised season row
doesn't double-count. **Add** is for genuinely missing history — additive only,
baseline untouched.

**Why:** the original seed wrote derived tables directly with the whole of history
folded into the `season=NULL` baseline. Re-importing an old season as its own
(grade, season) snapshot would double-count it in career totals unless the baseline
is peeled back by the same amount.

## How reconcile works (`baseline-reconcile.ts` `reconcileBaseline`)
- MUST run inside the import tx, AFTER season snapshot rows are written/derived and
  BEFORE `recomputeAggregates`.
- Idempotent/re-entrant: first REVERSES any prior peel it recorded for this
  (grade, season) by adding the stored `baseline_adjustments` deltas back, then (if
  effective mode is peel) re-peels the CURRENT season total. This is why the
  per-match path can call it on every commit and every delete safely.
- Peel floors each stat at `min(baseline, seasonTotal)`, stores the actual delta in
  `baseline_adjustments`, and emits a `NegativeBaselineWarning` when seasonGames >
  baselineGames (baseline floored at zero → career WILL change; surfaced, never
  blocks).
- Delete/undo paths call `reconcileBaseline(tx, grade, season)` with **no mode**:
  it peels iff a prior peel adjustment exists, else no-op. Deleting a backfill
  re-derives an empty/smaller season → the reverse-then-maybe-repeel restores the
  baseline. The stored adjustment row is the source of truth for reversal.

## Other backfill rules (all gated on `isBackfill`)
- Suppress social/milestone (`runPostCommitSocial` / `runBatchPostCommitSocial`).
- Never mint out-of-order caps: use `recomputeCapsFromStats(tx, [category])` (refresh
  existing linked caps only) instead of `syncCapsFromStats`. NOTE the arg shape:
  `recomputeCapsFromStats` takes a `("male"|"female")[]` category array (map via
  `GRADE_TO_CAP_CATEGORY[grade]`, skip non-cap grades) — NOT a grade string.
- Preview attaches per-player `backfill` net-effect figures (season vs baseline vs
  career) via `loadBackfillBaseFigures(grade, ids)`; the UI computes peel/add net
  effect + predicted negatives client-side from these.
