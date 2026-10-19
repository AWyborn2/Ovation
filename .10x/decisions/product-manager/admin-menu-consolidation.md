# admin-menu-consolidation — Product decision

**Status:** Agreed with Ash 2026-10-19 (scope B). **Priority:** P1.

## Problem

Club admins can't predict where a task lives in the admin: Honours & Records holds a
settings page (Display & kiosk) and two separate shirt-number registers, People holds
data-correction pages (Stats, Junior scorecards) and a selection page (Junior fixtures), and
uploads are split across Import CSV, Availability and the shirt-number tabs. Separately,
the shirt-number registers create duplicates of **both** kinds (confirmed by Ash):
the same number on two people (men's and women's sides share one senior register, so a
men's #7 and a women's #7 clash), and the same person appearing twice.

**Target user:** club admin / committee volunteer at a tenant club (non-technical, infrequent).

## Findings (code, 2026-10-19)

- Nav source of truth: `artifacts/cricket-club/src/lib/admin-nav.ts` (`ADMIN_NAV`).
- Shirt numbers: `shirt_numbers` + `junior_shirt_numbers` (juniors kept apart on purpose).
  Uniqueness is per person per season; duplicate numbers are flagged across the whole
  register. No men/women category exists. The feature switch and policies live only on the
  senior tab but govern both registers.
- Squad import (Availability) is the PlayHQ participant export for availability contacts;
  Import CSV is stats-only today (season CSV / match / batch).
- Display & kiosk = honour-board skin + clubroom TV kiosk config (a settings page).
- Stats (`admin-stats.tsx`) edits per-player grade-season stat rows; Junior scorecards
  (`admin-junior-stats.tsx`) corrects junior PlayHQ scorecards, journalled so the edits survive a reload.
- Junior fixtures (`admin-junior-fixtures.tsx`) is LIVE: it edits the team list for each upcoming junior
  game (players, shirt numbers, C/VC/WK); PlayHQ fills it in, and an admin save wins; it feeds
  the public Junior Fixtures page. **Keep.**

## Recommendation (scope B)

| Item | From | To |
|---|---|---|
| Shirt numbers + Junior shirt numbers | Honours & Records (2 tabs) | **People → Shirt numbers** (one tab: switch and policies at the top, then sections **Senior Men / Female / Juniors**) |
| Shirt-number bulk upload | each shirt tab | **Imports** (keep an "Upload" link in the Shirt numbers tab) |
| Import CSV | top-level, stats-only | renamed **Imports**: Stats (CSV / match / batch), Squad (PlayHQ participants), Shirt numbers |
| Squad upload | Availability | **Imports → Squad** (Availability keeps the squad register and a link to the upload) |
| Display & kiosk | Honours & Records | **Display & Settings** |
| Stats, Junior scorecards, Corrections, Duplicate players | People | new group **Stats & Data** |
| Junior fixtures | People | next to **Selection Hub** (a junior tab or a sibling) |

Honours & Records keeps only curated content: Premierships, Awards, Team of the Decade, Cap
register, Life members, Junior premierships.

## User stories

- As a club admin, I want all shirt numbers on one page by category so that I can see the
  whole club's numbers and stop false clashes between the men's and women's sides.
- As a club admin, I want every file upload in one Imports area so that I know where to go
  when I have a PlayHQ or PlayCricket export.
- As a club admin, I want settings pages only under Display & Settings so that Honours shows
  only the club's honours.
- As a club admin, I want data-correction pages grouped together so that fixing a wrong
  figure doesn't mean searching through People.

## Requirements

- P0: senior shirt register gains a category (Men / Female); number clashes are flagged only
  within a category; a person has at most one entry per season across categories (and an
  admin is warned if the same person is in the senior and junior registers).
- P0: junior rows stay in `junior_shirt_numbers` and are served only via juniors routes:
  the "Juniors" section is a view onto that table, never a blended query (juniors isolation).
- P0: old admin URLs redirect to the new locations (bookmarks, tour links).
- P1: Imports hub (Stats / Squad / Shirt numbers); Availability and Shirt numbers link into it.
- P1: menu moves listed above; tour (`lib/tour.ts`) and `admin-shell-v2.test.tsx` updated.
- P2: existing senior rows backfilled to Men; admin can bulk-recategorise women's players
  (or auto-suggest from women's grades in `central/grades.ts`).

## Success criteria

- Shirt-number duplicate flags per club fall to real clashes only (spot-check Halls Head
  before/after; target: zero men-vs-women false clashes).
- No group mixes settings, data correction and curated content (structural check of `ADMIN_NAV`).
- No "where is X" questions about the moved pages from pilot clubs in the 4 weeks after release.

## Not building

- Removing Junior fixtures (it's live).
- A full admin menu redesign (scope C).
- Changes to Honours content or the public pages.

## Risks

- Production migration (category column + backfill) is applied by hand before republishing.
- Juniors isolation if the unified page is built as one blended query — guard with a test.
- Women's players miscategorised by the backfill → P2 bulk recategorise tool.
