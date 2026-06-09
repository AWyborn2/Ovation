---
name: Season-aware Top Performers chips
description: Why availability chips (grades/age-groups) must be derived from the leaderboard's own source rows, not from match existence.
---

The "Top Performers" picker (seniors home, juniors dashboard, mobile) shows
grade/age-group chips that should only appear for a season that actually has
leaderboard records.

**Rule:** Derive the available-chip set from the SAME rows that feed the leaders,
not from "did a match exist in this season".

**Why:** Junior matches include statuses like "Played (stats not recorded)" and
"No Result" — those rows exist in `junior_matches` but have NO batting/bowling
lines. Deriving age-group chips from distinct `junior_matches.age_group` surfaced
chips that, when selected, produced empty top lists. The fix derives age groups
from HH `junior_match_batting`/`junior_match_bowling` lines inner-joined to
non-private `junior_participants` (union of both sides, since a player may only
bat or only bowl).

**How to apply:** Seniors derive availableGrades from `player_grade_season_stats`
games>0 (which IS the stat record) — fine. For any junior availability list,
always go through the participant lines, never the match table alone.
