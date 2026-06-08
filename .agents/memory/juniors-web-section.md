---
name: Juniors web section
description: How the cricket-club web Juniors area is structured and the constraints that govern it.
---

# Juniors web section (cricket-club)

The Juniors area is a parallel top-level section to Seniors, reached via a Seniors/Juniors
toggle in the shared `layout.tsx`. When `location` starts with `/juniors`, the layout swaps to
JUNIOR_NAV and a club-brown accent (banner + active states; `JUNIOR_ACCENT` in `src/lib/juniors.ts`,
solid `#42342b`, text/icons `#bc8c6b`) to read as visually distinct from the navy/gold senior side.

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

**Senior-parity surfaces (added later):**
- **Rich combined leaderboard** — `GET /api/juniors/leaderboard` (op `listJuniorLeaderboard`, query
  `ageGroup`/`season`) aggregates filtered HH lines in JS into batting (Inns/NO/Runs/HS/Avg/100s/50s)
  + bowling (Wkts/Runs/Avg/BB/5WI) per participant. It inner-joins `junior_participants is_private=false`
  (drops opposition + private in one move). This is SEPARATE from the older `GET /juniors/leaderboards`
  (mostRuns/mostWickets/... single-stat boards) which still powers the per-stat tabs. The rich
  "Leaderboard" tab in `juniors-players.tsx` sorts + name-searches client-side over that result set.
- **Opponent crests** — junior matches link opposition to the shared `clubs` register via
  `junior_matches.opponent_club_id` (nullable FK, ON DELETE SET NULL). Populated by a conservative
  normalised matcher (see `junior-opponent-club-matching.md`); ~1222/1828 dev matches link, the rest
  stay NULL and renderers (web crest, scorecard `opponentTeam`) fall back gracefully. Reading `clubs`
  here does NOT blend junior+senior STAT data — `clubs` is a neutral area-wide reference table.
- **Junior match display defaults** — singleton `junior_match_display_settings` (id=1): `defaultAgeGroup`,
  `defaultSeasonMode` (latest/specific/all), `defaultSeason` (TEXT season string), `ageGroupOrder[]`.
  Deliberately NO `roundOrder` (junior rounds are free text, unlike senior int rounds). GET public /
  PATCH admin-only at `/juniors/match-display-settings`. Admin UI `admin-junior-match-display.tsx`
  (route `/admin/junior-match-display`); `juniors-matches.tsx` reads it for initial age/season.
- **Premierships plaque** — `juniors-premierships.tsx` copies the senior metallic-plaque grid
  (`premierships.tsx`) on a club-brown radial bg. Junior dump has NO captain / man-of-the-match, so
  plaques omit those lines (senior shows them) — drift, follow-up proposed for admin entry.
