# Agent task — make the Junior leaderboards agree on "Games"

## Problem
On the **Junior Players & Leaders** page, the same player shows a **different match/game count on each tab**. Example — Z Dreckow:

| Tab | Column shown | Value |
|---|---|---|
| Most Wickets | "MATCHES" | **107** |
| Leaderboard | "MAT" | **117** |
| Most Games | "GAMES" | **125** |

This looks like a bug to users, but **the data is correct** — each tab is just counting a *different* thing. I traced all three numbers to the database and they reproduce exactly:

- **125** = matches he was **named in the squad** (roster appearances)
- **117** = **batting innings** (matches he batted)
- **107** = **bowling appearances** (matches he bowled)

He was named in 125 games, batted in 117, bowled in 107. So no data fix is needed — the issue is **presentation**: three tabs put three different denominators under columns that all read like "games played".

## What I want you to change
Pick **one canonical "Games" number and use it on every tab**, and keep batting/bowling counts as their own clearly-labelled columns.

**Canonical "Games" = distinct Halls Head matches the player was named in** (roster appearances). This is the truest "games played" and is the largest/most complete count.

Concretely:
1. **Most Games** tab — already correct (uses roster appearances). Leave its number, just make sure the label is **"Games"**.
2. **Leaderboard** tab — the **MAT** column should show the **same canonical Games** number (125), not batting innings. Batting innings already has its own **INNS** column, so MAT is redundant/contradictory as innings. Set MAT = canonical Games.
3. **Most Wickets** tab — the **"MATCHES"** column currently shows *bowling appearances* (107). Change it to show the **canonical Games** (125). If you'd rather keep a bowling-specific context number, that's fine **but rename the column** to something accurate like **"Inns Bowled"** — do **not** label a bowling-only count "Matches".
4. Apply the same rule to **Most Runs** and any other tab that shows a match/game column.

Net result: **the same player shows the same "Games" value on every tab.** Innings (batting) and Wickets remain their own columns.

## Data definitions (juniors DB — `halls_head_juniors.db` / `halls_head_juniors_postgres.sql`)
Junior identity is the **PlayHQ `participant_id`** (there is no `player_id` in the juniors DB). Aggregate **by `participant_id`**, and always filter to Halls Head with **`is_halls_head = TRUE`**. Do **not** merge players by display name — same-named players can be different people (e.g. the two "C Gray" brothers are distinct `participant_id`s and must stay separate).

```sql
-- Canonical Games (use this for the match/games column on EVERY tab)
SELECT participant_id, COUNT(DISTINCT match_id) AS games
FROM match_rosters
WHERE is_halls_head = TRUE
GROUP BY participant_id;

-- Batting innings (the INNS column)
SELECT participant_id, COUNT(*) AS innings
FROM match_batting
WHERE is_halls_head = TRUE
GROUP BY participant_id;

-- Bowling appearances (only if you keep a bowling-context column — label it "Inns Bowled", not "Matches")
SELECT participant_id, COUNT(*) AS inns_bowled
FROM match_bowling
WHERE is_halls_head = TRUE
GROUP BY participant_id;
```

The denormalised `junior_participants` table already stores the canonical values and is kept in sync with the rows:
`roster_appearances` = canonical Games, `scorecard_lines` = batting + bowling lines. You can read `junior_participants.roster_appearances` directly for the Games column instead of recomputing.

## Acceptance check
For **Z Dreckow** after the change:
- Most Games / Leaderboard MAT / Most Wickets match column → **all show 125**
- Leaderboard INNS still **117**, Wickets still **96–98**

Spot-check 2–3 more players (e.g. C Gray, H Young) and confirm their match/games column is identical across all tabs.

## Out of scope
Don't change the underlying scorecard data, the `is_halls_head` flags, or how participants are identified. This is purely the leaderboard query/column-label layer.
