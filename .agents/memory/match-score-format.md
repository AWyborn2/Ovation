---
name: Match score string format
description: How matches.hhcc_score / opponent_score strings are formatted and parsed for the scorecard
---

Stored match score strings (`matches.hhcc_score`, `matches.opponent_score`) are
**runs/wickets**, Australian convention — e.g. `"206/10"` = 206 runs for 10
wickets (all out), `"77/1"` = 77 for 1. The first number is runs (can be large),
the second is wickets (0–10).

**Why this matters:** `parseScore` in `lib/scorecard/src/mapping.ts` once read the
slash-separated pair as wickets/runs (backwards). That swapped every innings
total on web + mobile (rendered as `${totalRuns}/${wickets}`) AND silently broke
`buildExtras` — extras = `totalRuns − sum(batter runs)` clamped at 0, so when the
mis-parsed "runs" was the small wickets number, `batRuns` exceeded it and extras
collapsed to 0 (visible as e.g. "EXTRAS 0 (2w 3nb)" — total disagreeing with its
own breakdown).

**How to apply:** any code parsing these score strings must take group 1 as runs,
group 2 as wickets. The match header renders the raw string directly (always
correct); the bug only shows in the derived scorecard view-model, so cross-check
the scorecard innings total against the header when touching score parsing.
