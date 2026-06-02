---
name: Award 3-2-1 voting & captain role
description: How Brownlow-style voting, the captain login role, and the live tally fit together in the cricket portal.
---

# Award 3-2-1 voting + captain role

A second login role ("captain") separate from admin lets per-round grade captains
submit 3-2-1 ballots; points tally into a live season leaderboard; admins finalise
winner(s) into the award's past-winners roll.

## Route prefixes (easy to get wrong)
- Captain **auth** lives under `/api/captain-auth/*` (login/logout/me) — a SEPARATE
  cookie from admin. Captain **actions** (votable rounds, ballot submit) live under
  `/api/captain/*`. Don't assume `/captain/login`; it's `/captain-auth/login`.
- Public live tally: `GET /api/award-tallies` (array, one per visible config).
- Admin tally: `GET /api/voting-configs/:id/tally` forces `visible=true`.
- Finalise: `POST /api/voting-configs/:id/finalise` replaces award_winners for
  award+season (idempotent), sets votingOpen=false + finalisedAt.

## Tally visibility rule
visible = votingEnabled && tallyVisible && !(autoHideAfterRounds != null && roundsPlayed >= autoHideAfterRounds).
**Why:** clubs may want to hide the run-in near season end so the winner isn't spoiled.

## Data model
- `award_voting_config` keyed (awardId, season): votingEnabled, votingOpen, grades[],
  tallyVisible, autoHideAfterRounds, finalisedAt.
- `award_ballots` one per (configId, captainId, grade, round) with pick1/2/3 playerIds (3/2/1 pts).
- `captains` + `captain_grade_permissions` (captain may only vote grades they're permitted).
- Votable rounds/eligible players derive from `matches` + `match_player_lines`
  (non-abandoned, round IS NOT NULL) for the config's grades+season.
- Multi-column uniques (e.g. ballot uniqueness) live in `scripts/src/ensure-constraints.ts`,
  NOT the Drizzle schema (drizzle-kit 0.31 can't manage them).

## Orval gotcha (cost real debugging time)
Generated **query** hooks + query-key fns for the voting configs take a POSITIONAL
`id: number` (e.g. `useListAwardVotingConfigs(awardId)`,
`getGetVotingConfigTallyQueryKey(configId)`), while **mutation** hooks take object
args `{ id, data }`. Mixing them up breaks cricket-club typecheck.
