---
name: Awards mechanisms & public points board
description: How the awards system distinguishes voted/points/manual awards and where the public points leaderboard endpoint lives.
---

# Awards mechanisms

Every award has a `mechanism`: `voted` (3-2-1 captain voting → tallies),
`points` (points-from-stats leaderboard), or `manual` (winners entered by hand).
`votingEnabled` is derived = `mechanism === 'voted'`. Awards also have a
`published` (bool) flag; award_winners have their own `published` flag too.

Public list endpoints filter to published only; admin list endpoints are
unfiltered (use `useListAdminAwards` in admin UI, `useListAwards` publicly).

# Points awards

- Per (award, season) config lives in `award_points_config` with 9 weighted
  categories (runs, wickets, catches, stumpings, runOuts, games, fifties,
  hundreds, fiveWickets) + includeFinals. The (award_id, season) unique is
  created in `scripts/src/ensure-constraints.ts`, NOT the drizzle schema.
- The points engine sums `match_player_lines` JOIN `matches` for the award's
  `pointsGrade` + season.

# Public points leaderboard endpoint (easy to mis-path)

The public live points leaderboards are served at **`GET /api/award-points`**
(NOT `/api/points-leaderboards`). The generated hook is
`useListPublicPointsLeaderboards()` returning `PointsLeaderboard[]` keyed by
`awardId`. Both web (`awards-tab.tsx`) and mobile (`honours/awards.tsx`) render
these via a `LivePointsBoard` component next to the voted-award `LiveTally`.

**Why noted:** the path doesn't match the hook name, so guessing the URL from
the hook fails. Trust the generated `getListPublicPointsLeaderboardsUrl`.
