---
name: Dating A Grade debuts from match history
description: Why a per-match record alone does not mean a debut; how to date a true first cap.
---

# Dating debuts on the Honour Boards

The recent-debutants feed derives debutants from `cap_register` (one per capped
player) and enriches each with a debut season/round from `matches` /
`match_player_lines`.

**Rule:** a per-match record only dates a debut when the player has **zero prior
games** in that grade before that match's season. Compute prior games from
`player_grade_season_stats`, counting any row with `season IS NULL` (the seeded
baseline = pre-per-match career) or `season < debutSeason`. If prior games > 0,
leave season/round null — the player is established, not a debut.

**Why:** per-match history currently only covers the matches actually imported
(e.g. A Grade 2025 round 2). A whole XI appears in that one match, so naively
taking each player's *earliest match* mis-dates ~9 established A-graders as
"2025 round 2 debuts". Only the genuine first-cappers (zero baseline games)
should be dated. Confirmed in dev: of 11 players in A Grade 2025 r2, only
Mitchell Caine (cap #242) and Ben Higton (#241) had 0 prior games.

**How to apply:** any feature that infers a "first appearance" / debut date from
`match_player_lines` must cross-check the snapshot baseline, not trust the
earliest match row alone. Seeded historical caps with no match record stay
undated and are treated as not-recent.
