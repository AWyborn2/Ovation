---
name: Junior "Games" consistency
description: The single canonical definition of a junior player's games count and which endpoints must use it.
---

# Junior "Games" = distinct HH roster appearances

Canonical junior games count = `COUNT(DISTINCT junior_match_rosters.match_id)` where
`is_halls_head AND participant_id IS NOT NULL`, optionally scoped by `junior_matches.season`
/ `age_group`. Implemented once as the hoisted helper `rosterGamesByParticipant(scope)` in
`artifacts/api-server/src/routes/juniors.ts`.

**Why:** the Junior Players & Leaders page previously showed three *different* games numbers
for the same player across tabs — Most Games/Directory used `union(batting,bowling,roster)`
distinct match ids, the rich leaderboard "Mat" used batting-derived distinct matches, Most
Wickets used distinct bowling matches. Roster appearances are the truest "did they take the
field" figure, so it's the single source.

**How to apply:** any junior surface that reports a games/matches/appearances number must call
`rosterGamesByParticipant`, never re-derive from batting/bowling/union ids. Consumers:
`/juniors/players` (directory + Most Games), rich `/juniors/leaderboard` (scoped), and
`bowlingLeaders` / Most Wickets (scoped). Batting **innings** (distinct batting lines) and
**wickets** are deliberately separate figures — do not collapse them into games.

**Directory scoping rule:** in `/juniors/players`, when a `season`/`ageGroup` filter is present,
games **and** runs **and** wickets are all scoped to that filter so the row stays internally
consistent (all three describe the same scope). Unfiltered they are all-time — which is what
the always-unfiltered Most Games board reads. Don't scope just one of the three.

Brothers/namesakes (e.g. two "C Gray") stay separate because everything keys on
`participant_id`, never display name.

Senior side already had a single consistent figure (pre-aggregated `player_grade_stats.games`
/ `players.totalGames`, "Mat"=games, "Inn"=innings) — no senior change was needed.
