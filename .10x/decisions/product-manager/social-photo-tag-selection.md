# Social photo selection by player tags

**Status:** Recommended, agreed with Ash 2026-10-19. **Priority:** P1.

## Problem

Social Studio tiles pick their photo mostly from per-grade photo "folders" (photo types:
Team, Celebrating, Batting…). The result is a picture of the grade that may not show anyone
who actually played or was selected. Club admins want tiles to feature the people the post
is about, and to keep folder photos for team-level tiles.

## Today (verified in code 2026-10-19)

- Picker: `pickDraftPhoto` in `artifacts/api-server/src/lib/draft-enrich.ts`, order: card
  photo rule (`card_photo_rules`: fixed / player / random) → `playerId` photo → newest grade
  photo ranked by `preferredPhotoTypes` (`lib/scorecard/src/photo-types.ts`).
- Team List: already picks one selected player at random per fixture
  (`engines/team-list.ts`) and uses that player's tagged library photo; falls back to the
  grade Team/Celebrating photo.
- Match Result / Summary (`matchSummary`): no `playerId`, so it lands on the grade
  Team/Celebrating photo unless a `player` rule exists (top performer only).
- Match Day: grade Team/Celebrating photo.

## Decisions (Ash, 2026-10-19)

1. **Team List**: a tagged photo of a player **selected in that side**.
2. **Match Result + Summary**: a tagged photo of a player who **played in that game**,
   **top performer first**, then the next best performer, then anyone who played.
3. **Match Day**: that **grade's** Team or Celebrating photos only.
4. **No match → no auto photo.** Do not fall back to grade folders or to other players. The
   tile is left empty, and the admin chooses from **any photo in the library**, with filters.
5. An admin's explicit choice wins: a `fixed` card photo rule and a manual pick in the
   share dialog or queue still override (KTD6 unchanged). *(PM default, confirm with Ash
   if needed.)*

## User stories

- As a club admin, I want a team list tile to show someone actually picked in that side.
- As a club admin, I want a result tile to feature the player who starred in that game.
- As a club admin, I want match-day tiles to show that team, not another grade.
- As a club admin, when no suitable photo exists, I want to browse and filter the whole
  library (by player, grade, photo type, season/date) and pick one quickly.

## Requirements

- P0: player-in-side / player-in-game candidate set for teamList and matchSummary, using
  photo tags (`club_photo_players`), crosswalk-aware ids, fill-ins (>= 90000) and juniors
  excluded (junior cards keep their own pipeline).
- P0: performance-ordered candidates for matchSummary (reuse `topPerformerPlayerId`
  ordering, extended to a ranked list).
- P0: remove the grade-folder fallback for these three kinds; leave `photoUrl` null.
- P0: Match Day restricted to the grade's `team` / `celebrating` photos.
- P1: library photo picker in the share dialog / draft editor with filters: tagged player
  (defaulting to players in that side/game), grade, photo type, newest first.
- P1: draft shows a clear "No tagged photo for this side — choose one" prompt.
- P2: "players in this game without a tagged photo" hint to drive tagging.

## Success criteria

- 100% of auto-picked Team List / Result / Summary photos tag at least one player in that
  side or game (testable invariant).
- 0 Match Day auto-picks from another grade or another photo type.
- Admins pick a fallback photo in under 30 s (filtered picker, few clicks).
- Share of drafts needing a manual pick drops over the season as tagging grows.

## Not building

- Face recognition or auto-tagging.
- Changing other card kinds (milestones, leaders, premiership, big moments) — they keep the
  current type-based order.
- Junior card photo rules.

## Risks

- Clubs with little tagging will see many empty tiles at first: the empty-state prompt and
  the filtered picker carry this. Watch the manual-pick rate in the first round.
- Existing `random` / `player` card photo rules overlap with the new behaviour; the architect
  should decide whether they are retired for these kinds or kept.
- Already-queued drafts keep their photos; `fillMissingDraftPhotos` only fills empty ones.
