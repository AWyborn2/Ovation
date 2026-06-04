---
name: Milestones board (dated, prioritized)
description: How the public Milestones tab derives/ranks dated achievements and what gates it being empty
---

The public Honour Boards page has a dedicated **Milestones** tab (default, first) backed by `GET /milestones` (`routes/milestones.ts`). It is separate from the older "Significant milestones" recent/approaching display-mode block, which is preserved and rendered below the dated list on the same tab.

## What it shows
Dated per-match achievements derived from real match data: centuries (≥100), five-fors (≥5), admin-flagged hat-tricks (`match_hat_tricks`), A Grade / Female A Grade debuts, and career-tier crossings. Out of scope (do not add without explicit ask): auto hat-trick detection, backfilling historical career dates, social card/queue engine, mobile.

## Recency & featuring
Recency uses real `matches.matchDate` over a club-configurable window (`milestone_board_settings.recencyWeeks`, default 4). When ≥5 **distinct** players achieved within the window, `featured=true` and the board leads with recent achievers, most-recent-first; otherwise items rank by significance.

**Significance bands:** hatTrick 900 > century/fiveFor 400 > debut 300 > career = 100 + tierIndex*100 (lowest tier = baseline). Career crossings are only detected WITHIN the window: pre-window baseline = current career total minus in-window match-line contributions, then walk window matches by date. Tiers are configurable per stat via `gamesTiers/runsTiers/wicketsTiers` int[] (first entry is the lowest tier).

## The gotcha that makes it look broken
Dated milestones ONLY appear once matches have a `matchDate`, i.e. after per-match xlsx imports. The seed/whole-season CSV path stores no per-match history, so a fresh/dev DB returns `{items:[]}` and the tab shows the "No dated milestones yet" empty state. This is expected, not a bug.

## Debut dating rule (reused)
True debut = player had 0 prior grade games before that season; the `season=NULL` baseline snapshot counts as prior. Without this guard a whole XI mis-dates as debutants on the first imported match (see debut-dating-from-matches.md).

## Cleanup
`match_hat_tricks` rows cascade from `matches` (FK, no unique; toggle enforced in app), so undo-season auto-cleans them — no rollback.ts changes needed.
