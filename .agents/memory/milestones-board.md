---
name: Milestones board (dated, prioritized)
description: How the public Milestones tab derives/ranks dated achievements and what gates it being empty
---

The public Honour Boards page has a dedicated **Milestones** tab (default, first) backed by `GET /milestones` (`routes/milestones.ts`). It is separate from the older "Significant milestones" recent/approaching display-mode block, which is preserved and rendered below the dated list on the same tab.

## What it shows
Dated per-match achievements derived from real match data: centuries (≥100), five-fors (≥5), admin-flagged hat-tricks (`match_hat_tricks`), A Grade / Female A Grade debuts, and career-tier crossings. Out of scope (do not add without explicit ask): auto hat-trick detection, backfilling historical career dates, social card/queue engine, mobile.

## Recency & featuring
Recency uses real `matches.matchDate` over a club-configurable window (`milestone_board_settings.recencyWeeks`, default 4); the window anchors to the **latest dated match**, not today (so it stays useful in the off-season).

**The recency window is a BADGE highlight, NOT a gate.** When any match is dated (`windowStart != null`) the route returns ALL items most-recent-first and `featured = items.length > 0`; each item carries `recent = inWindow(matchDate)` so the web card shows a "Recent" badge but nothing is filtered out. It falls back to all-time-by-significance ONLY when no match is dated at all. **Why:** an earlier version GATED on the window (returned only in-window items) which made the board go blank whenever the latest match week had no milestone — e.g. recencyWeeks=1 with the last century 4 days before window start → empty board. The board must always show the latest achievements; recency only highlights. (An even older version "≥5 players → feature recent then significance" was also dropped.)

**CRITICAL — match_date is free text** (e.g. `"12:30 PM, Saturday, 07 Feb 2026"`), NOT ISO. The route MUST normalize via `parseMatchDate()` (handles ISO + `DD Mon YYYY`) before any window/anchor/sort/compare. A prior bug used an ISO-only `isIsoDate()` guard → it rejected every date → `windowStart=null` → recency silently inert → board dumped all-time top-100 (incl. 2023). Same trap bit the career-crossings filter. The web `formatMatchDate()` must also parse the free-text form or cards show the raw timestamp string. See match-date-text-column.md.

**Significance bands** (only used in the no-dated-match fallback ordering): hatTrick 900 > century/fiveFor 400 > debut 300 > career = 100 + tierIndex*100 (lowest tier = baseline). **Career crossings are detected across the WHOLE match era** (no window floor): pre-match-era baseline = current career total minus ALL dated match-line contributions, then walk every dated match by date emitting on first `prev < tier && running >= tier`. This avoids re-emitting pre-era crossings (already in baseline) and double-counting; `recent` is set via `inWindow`. Tiers configurable per stat via `gamesTiers/runsTiers/wicketsTiers` int[] (first entry is the lowest tier).

## The gotcha that makes it look broken
Dated milestones ONLY appear once matches have a `matchDate`, i.e. after per-match xlsx imports. The seed/whole-season CSV path stores no per-match history, so a fresh/dev DB returns `{items:[]}` and the tab shows the "No dated milestones yet" empty state. This is expected, not a bug.

## Debut dating rule (reused)
True debut = player had 0 prior grade games before that season; the `season=NULL` baseline snapshot counts as prior. Without this guard a whole XI mis-dates as debutants on the first imported match (see debut-dating-from-matches.md).

## Cleanup
`match_hat_tricks` rows cascade from `matches` (FK, no unique; toggle enforced in app), so undo-season auto-cleans them — no rollback.ts changes needed.
