---
name: Juniors web section
description: How the cricket-club web Juniors area is structured and the constraints that govern it.
---

# Juniors web section (cricket-club)

The Juniors area is a parallel top-level section to Seniors, reached via a Seniors/Juniors
toggle in the shared `layout.tsx`. When `location` starts with `/juniors`, the layout swaps to
JUNIOR_NAV and an emerald accent (banner + active states) to read as visually distinct from the
navy/gold senior side.

**Hard constraints (carried from the juniors spec):**
- Junior pages call ONLY `/api/juniors/*` hooks. Never blend junior + senior figures on any surface.
- Names render as supplied (initial+surname). The shared scorecard cards uppercase names as a
  *visual* style only — junior batting lines already arrive as "T Mittal", so uppercasing is not a
  data reformat and is intentionally kept consistent with the senior scorecard look.
- The 6 private junior participants must NEVER appear; they are masked server-side (scorecard lines
  become "Private Player", directory/leaderboards exclude them). The web does not re-implement masking.

**No games leaderboard endpoint.** `GET /api/juniors/leaderboards` returns mostRuns / mostWickets /
highestScores / bestBowling — there is NO games ranking. The "Most Games" tab is derived CLIENT-SIDE
by sorting the junior players list (`useListJuniorPlayers`, which carries per-player `matches`) by
appearances. Still junior-only data, so the no-blend rule holds.

**Senior cross-link deliberately omitted** from junior player detail (strict isolation), even though
`junior_participants.senior_player_id` exists.

**Scorecard reuse:** `buildJuniorScorecard(JuniorMatchDetail)` in `lib/scorecard/src/junior-mapping.ts`
adapts junior innings into the shared `Scorecard` view-model so the senior `BattingCard`/`BowlingCard`
render juniors unchanged. Junior `playerId` is always null → no career-stats popup (opposition + HH
juniors all render as plain text).
