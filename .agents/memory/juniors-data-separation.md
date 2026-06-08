---
name: Juniors data & API separation
description: How junior cricket data is kept isolated from senior records, served, and how private participants are hidden.
---

# Juniors: completely separate from senior records

Junior data is a self-contained PlayHQ-era dataset loaded into isolated `junior_*` tables and served ONLY via `/api/juniors/*`. **No junior query ever touches a senior table, and junior/senior stats NEVER combine.**

**Why:** explicit club decision — juniors and seniors are tracked as wholly separate record sets. The only bridge is `junior_participants.senior_player_id` (plain nullable integer, NO foreign key to `players.id` by design — juniors tables must not be constrained by senior tables), used purely as a cross-reference link to jump between a person's junior and senior profiles, never to merge any figure.

**How to apply:**
- New junior surfaces query `junior_*` only; new senior surfaces never read `junior_*`. Don't sum across the boundary.
- The junior ETL (`scripts/sql/juniors-etl.sql`) does a full idempotent replace but **snapshots + re-applies `senior_player_id`** via a temp table so manually-set links survive a reload. Any new junior loader must preserve that link the same way.

## Privacy rule (the `is_private` participants)

A handful of `junior_participants` rows have `is_private = true`. They must be hidden everywhere, two different ways:
- **Scorecards / rosters (match detail):** lines are MASKED, not dropped — keep the row so innings totals still add up, but null `participantId`, set name to "Private Player", `isPrivate: true`. This needs the explicit private-id Set fetched per request.
- **Directories / leaderboards / aggregates:** EXCLUDE them. The trick: inner-join `junior_participants` and filter `is_private = false`. Because opposition players have a `participant_id` but NO participant row, this single join drops BOTH opposition AND private players. Leaderboard aggregates therefore never need a separate private filter.

**Why:** opposition lines carry participant ids too (no FK), so "HH only" can't be done by id presence alone — `is_halls_head = true` selects HH, and the participant inner-join + `is_private=false` is what removes private players cleanly.

## Data shape gotchas

- `season` is free text ("2024/25"); order newest-first via `substring(season,1,4)::int`.
- `match_date` and scores are frequently NULL; statuses include "Played (stats not recorded)" / "No Result".
- HH vs opponent score is derived from `team1/team2` + `team1_score/team2_score`: if `team1 == opponent_name` then HH is team2, else team1.
- `innings` aligns batting and bowling: innings N batting side = batting team, the innings-N bowling rows are the fielding side.
