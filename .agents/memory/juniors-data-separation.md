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

## Unified school-year age bands (age_group is overloaded)

`junior_matches.age_group` and `junior_premierships.age_group` hold a UNIFIED school-year band, NOT the raw label: Year 4 … Year 9, **Year 10-11** (merges old U16+U17), plus **Girls League**. The original label lives in `age_group_raw`. The ETL fills `age_group = COALESCE(dump age_band, pg_temp.jr_band(...))`; `jr_band()` maps U10→Year 4 … U15→Year 9, U16/U17→Year 10-11, passes through existing "Year N"/"Girls League".

**Why overload the existing `age_group` column instead of adding a band column:** every filter, leaderboard, and honour-board already groups on `age_group`, so writing the band INTO that column regroups the whole section with zero query/UI change — the merge is purely an ETL concern. `age_group_raw` is the audit trail.

**How to apply:** never reintroduce raw U-labels into a public surface — always group/display `age_group`. If you need the original, read `age_group_raw`. The newer dump also populates `match_date` for ALL matches (older dump had 0) and adds `association` + venue detail (`venue`/`venue_oval`/`venue_address`/`venue_suburb` on matches; `association`/`venue`/`venue_oval` on premierships).

## Data shape gotchas

- `season` is free text ("2024/25"); order newest-first via `substring(season,1,4)::int`.
- `match_date` and scores are frequently NULL; statuses include "Played (stats not recorded)" / "No Result".
- HH vs opponent score is derived from `team1/team2` + `team1_score/team2_score`: if `team1 == opponent_name` then HH is team2, else team1.
- `innings` aligns batting and bowling: innings N batting side = batting team, the innings-N bowling rows are the fielding side.

## Reloading: loader commit can exceed the agent tool timeout

`load-juniors-db -- --commit` rebuilds the ~25MB `juniors_staging` schema AND runs the ETL in one go, which can blow past a 2-minute tool timeout (the single-transaction ETL just rolls back cleanly on kill). The preview run already builds `juniors_staging` and leaves it intact, so on timeout just run the pure-SQL ETL directly against the existing staging: `psql "$DATABASE_URL" --single-transaction -f scripts/sql/juniors-etl.sql` — same result the loader produces. Verify by re-checking `public.junior_*` counts afterward.
