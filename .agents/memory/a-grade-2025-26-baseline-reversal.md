---
name: A Grade 2025/26 baseline reversal
description: How the 2025/26 A Grade season was subtracted out of the season=NULL baseline so it can be re-imported match-by-match.
---

# A Grade 2025/26 baseline reversal

The spreadsheet-seeded baseline (`player_grade_season_stats` rows with `season IS NULL`)
already INCLUDED the 2025/26 season. To re-import 2025/26 match-by-match without
double counting, the supplied 2025/26 A Grade figures were subtracted out of the baseline.

**Why:** baseline snapshots are the source of truth that all A Grade aggregates are summed
from. Re-importing 2025/26 on top of a baseline that already contains it would double-count
every game.

**How it was done:** one-off idempotent script `scripts/src/remove-a-grade-2025-26.ts`
(run via `pnpm --filter @workspace/scripts run remove-a-grade-2025-26`). Single transaction:
subtract per-player counting stats from the season=NULL row, delete the row when it hits 0
games, inline-recompute A Grade aggregates (mirrors `recompute.ts`), reconcile caps, write an
`imports` audit row (`status='baseline_reversal'`, payload retains every removed figure).

**Key gotcha — more than the 3 named debutants zero out.** The task named 3 debutants
(Hysen #244, Smith #246, Malingre #247) but FIVE more players had their ENTIRE A Grade
baseline = 2025/26 and also drop to zero: Ben Higton, Luca Doyle, Jeff Petrie, Mitchell Caine,
Wesley Naidoo. Their A Grade snapshot row is removed too (else double-count), but per task
scope they KEEP their caps (resynced to `games_a_grade=0, in_stats=false`). Only the 3 named
debutants' caps are deleted so they can be re-earned during the test. Lachlan Kinna (cap #175)
is an explicit keep (subtract only).

**Felton (#123):** has two baseline A Grade rows after an earlier merge; the CSV name
"Mitchell" no longer matches the surviving "Mitch" record by name, so the script overrides to
player 123 and deletes the row that EXACTLY equals the 2025/26 figures (keeps 49g).

**Not restored:** `high_score` / `best_bowling` on subtracted rows are NOT rolled back to their
pre-2025/26 values (only counting stats are reversible). Acceptable per task constraint.

**Reversibility:** the audit `imports` row payload holds every removed figure + action
(subtract/delete) + snapId, so the change can be reconciled against the future per-match
imports and reversed if needed. Idempotent: re-running no-ops once the audit row exists.

**Prod note:** as with the snapshot baseline backfill, this only ran against DEV. No prod DB
exists yet; if the club ever publishes, this reversal must be replayed on prod before any
2025/26 per-match import.
