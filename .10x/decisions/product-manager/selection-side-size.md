# Selection side size above 12 — PM decision (19 Oct 2026)

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
2. **Side size is set per grade**: 12 by default, up to 15. An admin sets it.
3. In grades with more than 12, players are **numbered 1–N with no tag**: no "12th" badge, no
   "Interchange" label.
4. A grade left at 12 keeps today's behaviour exactly: XI plus an optional 12th, labelled "12th".

## Approaches considered

| Scope                    | Includes                                                                                                            | Cut                                    | Risk                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------- |
| MVP                      | Per-grade size 12–15; hub slots 1–N; team sheet lists all N; no 12th label above 12                                 | Social card layout; availability text  | Low, but the card would cut off players |
| **Recommended (chosen)** | MVP + Team List card fits up to 15 rows + availability "selected" text without "12th" + PlayHQ team-list import keeps all N | Interchange tracking on the scorecard | Medium: card layouts across packs       |
| Full                     | + track who was interchanged per match, interchange stats                                                           | —                                      | High; the central data model has no interchange concept, so this is V2 |

"Don't build" was considered and rejected: the club can't produce a correct team sheet today.

## User stories and priority

- **P0.** As a club admin, I want to set a grade's side size (12–15), so that selectors can pick
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

## Success criteria

- The requesting club finalises and posts a side of 13 or more within 2 weeks of release, with
  no "12th" anywhere on the sheet or card.
- Zero support reports of extra players missing from the team sheet or card.
- Grades left at 12 show no change. The existing selection and team-sheet tests pass unchanged.

## Not building

- Interchange tracking in scorecards or stats. Career stats come from central scorecards and are
  unaffected.
- Sides above 15, or squad-style lists with a two-column card.
- A club-wide or per-fixture size override.
- An "Interchange" tag or a separate interchange block on the card.

## Risks

- **Card overflow.** Packs B–E need a renderer refactor (see memory). 15 rows may not fit every
  pack. Check early that each pack renders 15 names legibly, or shrink the font when there are
  more than 12.
- **The 12-slot assumption is everywhere**: the client and server share constants, stored sides are
  normalised to 12, and so are the move rules. Changing the slot count without the per-grade size
  could break clubs that stay at 12. Cover it with tests at sizes 12 and 15.
- **Overlap with selection-hub-decoupling.** PR1–PR3 of that feature are in flight in the same files
  (`selection-board.ts`, `apply-move.ts`). Sequence this work after them.
