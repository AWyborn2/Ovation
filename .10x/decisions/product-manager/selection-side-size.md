# Selection side size above 12 + overseas players — PM decision (19 Oct 2026)

## Problem statement

Some competitions let a side field more than 12 players, with interchange: 11 on the field at a
time and the extra players rotating in. The Selection Hub only allows the XI plus one optional
12th. So these clubs can't record their full side, and the team sheet and Team List card show an
extra player as a "12th man" when that player is a full member of the side.

## Target user

Club admins and captains (selectors) whose grade allows interchange. A club raised the request;
it applies to any tenant with such a grade.

## Findings in the code (19 Oct 2026)

- 12 slots are hard-coded: `XI_SIZE` and `TWELFTH_INDEX` in
  `artifacts/cricket-club/src/components/selection/apply-move.ts:64-71`, which the server also uses
  (`api-server/src/lib/selection-board.ts:77,108`, `normaliseSlots` at about `:931`).
- The 12th holds no role and can't be captain or keeper (`apply-move.ts:253-257,350-364`).
- "12th" is labelled in `team-card.tsx:103,207,261`, `player-matches.tsx:74`,
  `availability-respond.tsx:269-272`, the availability message
  (`availability-messaging.ts:107,327-329`) and the Team List studio sample
  (`studio-elements/registry.ts:515`).
- The team sheet and the Team List card designs assume at most 12 rows.

## Decisions with Ash (19 Oct 2026)

1. The format is **XI + interchange**. All extra players are full members of the side.
2. **Side size is set per grade**: 12 by default, up to 14. An admin sets it.
3. In grades with more than 12, players are **numbered 1–N with no tag**: no "12th" badge, no
   "Interchange" label.
4. A grade left at 12 keeps today's behaviour exactly: XI plus an optional 12th, labelled "12th".

## Approaches considered

| Scope                    | Includes                                                                                                                    | Cut                                   | Risk                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| MVP                      | Per-grade size 12–14; hub slots 1–N; team sheet lists all N; no 12th label above 12                                         | Social card layout; availability text | Low, but the card would cut off players                                |
| **Recommended (chosen)** | MVP + Team List card fits up to 14 rows + availability "selected" text without "12th" + PlayHQ team-list import keeps all N | Interchange tracking on the scorecard | Medium: card layouts across packs                                      |
| Full                     | + track who was interchanged per match, interchange stats                                                                   | —                                     | High; the central data model has no interchange concept, so this is V2 |

"Don't build" was considered and rejected: the club can't produce a correct team sheet today.

## User stories and priority

- **P0.** As a club admin, I want to set a grade's side size (12–14), so that selectors can pick
  the number of players the competition allows.
- **P0.** As a selector in a grade above 12, I want slots 1–N in the hub, with any player eligible
  for captain or keeper, so that I can record the whole side.
- **P0.** As a selector, I want the team sheet to list every selected player, numbered 1–N with no
  "12th", so that the printed sheet matches the side.
- **P1.** As a club admin, I want the Team List social card to show all N players legibly, so that
  the post matches the team sheet.
- **P1.** As a player picked in slot 12 or higher of a grade above 12, I want my selection message to
  say I'm selected, not "selected as 12th player".
- **P1.** As a selector, I want a PlayHQ-sourced team list with more than 12 names to fill all N
  slots, not drop the extra players.
- **P2.** Show the side size on the grade's hub header ("Side of 14").

## Rules

- The side is complete at 11. Slots 12 to N are optional. Finalising warns about open slots in the
  XI only, as it does today.
- Lowering a grade's size below an existing draft's filled count must not delete players silently.
  It applies to new drafts, or it asks the admin to move the extras out first.
- A finalised or published past side is never changed by a later size change.

## Part 2: overseas players (added 19 Oct 2026)

### Problem

Some competitions cap the number of overseas players in a side, and umpires and the association
expect them marked on the team sheet. Selectors can't see or record who is an overseas player, so
they can break the cap by accident and the sheet doesn't show it.

### Decisions with Ash

1. **Both: mark overseas players and warn when a side is over the cap.**
2. **The flag is per player, per season.** An admin ticks "overseas" on the squad member for the
   season, and every selection that season picks it up. Nothing is ticked per fixture.
3. **The cap is set per grade**, next to the side-size setting. Blank means no cap.
4. **Over the cap, the hub warns but still allows finalising.** The warning shows in the hub and in
   the finalise "Heads up" list, because the association may have granted an exemption.
5. **The marker shows everywhere**: in the Selection Hub, on the printed team sheet, on the Team
   List social card and on the public site (the published team list and player pages). It's a short
   "OS" badge beside the name.

### User stories

- **P0.** As a club admin, I want to mark a squad member as overseas for a season, so that
  selectors don't have to remember.
- **P0.** As a selector, I want an OS badge in the hub and a count against the grade's cap
  ("Overseas 2/1"), so that I can stay within the rules.
- **P0.** As a selector, I want the printed team sheet to mark overseas players, so that umpires and
  the association can see them.
- **P1.** As a club admin, I want the cap set per grade, and a warning (not a block) when a side
  goes over it.
- **P1.** As a club admin, I want the OS marker on the Team List card and the public team list and
  player pages.

### Rules

- The flag belongs to the club and the season. It never comes from or goes back to central data.
- A season's flag doesn't carry into the next season automatically. A player who returns is ticked
  again, or the admin uses a "copy last season's overseas players" action (P2).
- A finalised past side keeps the markers it had when it was finalised.
- The public OS marker respects the "show name publicly" toggle (selection-hub-decoupling): a hidden
  player shows no name and no marker.

### Success criteria

- The requesting clubs mark their overseas players in their first week.
- No finalised side is over the cap without the selector having seen the warning.

### Not building

- Eligibility rules beyond a count, such as residency periods or Kolpak-style exemptions.
- Checking against association registration data.
- An exemption record per fixture. The warning is enough.

### Risks

- **Privacy and sensitivity.** Nationality-type labels on public pages. Use the neutral "OS"
  marker only, and never show a country.
- **Card space.** The badge adds width to rows that are already tight at 14 names.

## Success criteria (Part 1)

- The requesting club finalises and posts a side of 13 or more within 2 weeks of release, with
  no "12th" anywhere on the sheet or card.
- Zero support reports of extra players missing from the team sheet or card.
- Grades left at 12 show no change. The existing selection and team-sheet tests pass unchanged.

## Not building

- Interchange tracking in scorecards or stats. Career stats come from central scorecards and are
  unaffected.
- Sides above 14, or squad-style lists with a two-column card.
- A club-wide or per-fixture size override.
- An "Interchange" tag or a separate interchange block on the card.

## Risks

- **Card overflow.** Packs B–E need a renderer refactor (see memory). 14 rows may not fit every
  pack. Check early that each pack renders 14 names legibly, or shrink the font when there are
  more than 12.
- **The 12-slot assumption is everywhere**: the client and server share constants, stored sides are
  normalised to 12, and so are the move rules. Changing the slot count without the per-grade size
  could break clubs that stay at 12. Cover it with tests at sizes 12 and 14.
- **Overlap with selection-hub-decoupling.** PR1–PR3 of that feature are in flight in the same files
  (`selection-board.ts`, `apply-move.ts`). Sequence this work after them.

## Change log

- 20 Oct 2026: Ash reduced the maximum side size from 15 to 14 (range 12–14). Overseas cap range 0–14.
- 20 Oct 2026: Ash added a fourth option, "12 — numbered 1–12", for competitions where all 12 play. That side
  has no "12th", and any of the 12 can be captain or keeper. It is set per grade next to the side size.
- 20 Oct 2026: Ash asked for the Hub to follow the grade's rules. Unfinalised drafts now take the grade's
  current size and format whenever the board loads: they grow, relabel, or shrink when the dropped slots are
  empty. A draft never loses a player, and the over-size warning still covers a side that can't shrink.
  Finalised sides never change. This supersedes "existing drafts keep their size".
