# Selection Hub decoupled from Availability — PM decision (19 Oct 2026)

## Problem statement

Club selectors can't use the Selection Hub as their weekly planning tool. It only opens a draft once
the availability send has started. It only shows the current weekend. It can't record a verbal reply.
It loses private players, who arrive from PlayHQ as anonymous "Private Player" rows and drop off the
team sheet.

## Target user

Club admins and captains (selectors) at every tenant, including clubs that run their own
communication channels (WhatsApp, phone calls) and never switch the availability tool on.

## Findings in the code (19 Oct 2026, verified)

- **No cut-off guard.** `saveBoard` never reads the cut-off (`api-server/src/lib/selection-board.ts:669-701`).
  The real blocker: with availability on, drafts are created only after the round's send has started
  (`selection-board.ts:350-353`). Until then the hub shows "No drafts yet".
- **Current round only.** `GET /selection/board` takes `section` only. The round comes from
  `roundWeekendFor(schedule, now)` (`selection-board.ts:304-317`), so there is no past or next weekend.
- **Standalone mode exists.** With availability off, the hub drafts from the last team list
  (`requireYes: false`), finalises and prints (`selection-standalone.test.ts`). It isn't presented
  as a first-class mode.
- **No admin-set availability.** The only writers are the member's own link routes (`availability-respond.ts`).
- **Private players.** In the hub and on the team sheet, squad members print with their real names
  (`team-sheet.ts:37-39`). The published list masks them as "Private Player". The loss happens
  upstream: a PlayHQ team list row named "Private Player" can't be matched to a squad member, so its
  slot stays empty and the player is left off the team sheet. Ash reports the sheet "completely leaves
  off" private players, and the masking is also an issue on the published list, the site and in the hub.

## Decisions with Ash (19 Oct 2026)

1. Selectors can draft any time, plan ahead and review previous weekends. **Each new draft starts from
   the side selected the previous week.**
2. An admin can set a status from a verbal reply: Yes, Maybe or No plus a note, stored as an
   admin-entered reply and labelled "set by <admin>" in the history. A later reply from the player's
   own link overwrites it.
3. Private players are handled two ways. The admin maps each "Private Player" slot to a real squad
   member, and the mapping is remembered for later rounds. A per-player **"show name publicly"** toggle
   (admin only) controls the published list, the site and social cards. The hub and the team sheet
   always show real names.
4. Hiding a player is a PlayHQ-only concern. Inside Ovation it is an admin decision, not a blanket mask.

## Approaches considered

| Scope                    | Includes                                                                                                  | Cut                                      | Risk                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| MVP                      | Draft on demand regardless of send; carry over last week's side; admin-set status; map private slots      | Round navigation; public-name toggle     | Low                                   |
| **Recommended (chosen)** | MVP + previous/next round navigation + per-player public-name toggle + "Availability off" as a named mode | Multi-week bulk planning, season planner | Medium: round model, privacy surfaces |
| Full                     | + season planner across all rounds, player load and appearance tracking per grade                         | —                                        | High; V2                              |

## User stories and priority

- **P0.** As a selector, I want a draft for every fixture as soon as it exists, starting from last
  week's side, so that I can plan before replies come in.
- **P0.** As a selector, I want to resolve each "Private Player" slot to the right squad member once,
  so that the team sheet lists all 11 or 12 players and I can track who plays where.
- **P0.** As a selector at a club that doesn't use availability, I want to draft, finalise and download
  team sheets without the availability tool switched on.
- **P0.** As an admin, I want to record a verbal Yes, Maybe or No with a note against a player, so that
  the board reflects what I've been told.
- **P1.** As a selector, I want to switch between the previous, current and next weekend, so that I can
  review last week's teams and plan ahead.
- **P1.** As an admin, I want a per-player "show name publicly" toggle, so that a player who is private
  on PlayHQ can still be named on our site and team list when the club agrees.
- **P2.** A "finalising before cut-off" warning when replies are still open.
- **P3.** Season-long planner and player-load analytics (Full scope, deferred).

## Acceptance criteria

- A board loads with editable drafts before the send and before the cut-off, and with availability
  turned off entirely.
- A new round's draft slots are pre-filled from the previous finalised (or last saved) side for the
  same grade. Members who are unavailable are flagged but not removed.
- `GET /selection/board` accepts a round or weekend. Past rounds open read-only once the round has
  finalised; editing a past side is out of scope.
- An admin-set status records the actor, a timestamp and `source = 'admin'`, and shows in the event log.
  A later member reply replaces it.
- Once a "Private Player" slot is mapped, it stays mapped for later PlayHQ syncs of the same fixture
  and future fixtures (crosswalk keyed by PlayHQ profile and team). The team sheet never drops a
  mapped player.
- Public surfaces (published list, site, social cards) mask a private member unless that member's
  public-name toggle is on.
- Juniors: whether the toggle applies to junior members is an open question for the Architect.
  Default to junior surfaces staying masked (ADR-007 and junior-privacy rules apply).

## Success criteria

- 0 team sheets with fewer named players than selected slots (track empty slots per finalised side).
- At least 80% of finalised sides each weekend were first drafted before the cut-off (leading indicator of planning ahead).
- At least one pilot club using the hub with availability switched off, finalising sheets weekly.
- Admin-set statuses used each weekend (count of `source = 'admin'` replies) and no support reports of
  wrong players on a team sheet.

## Not building

- Changing what PlayHQ shows: privacy there is PlayHQ's.
- Editing finalised past rounds.
- A season planner or player-load analytics (P3).
- Messaging players from the hub when availability is off.

## Risks

- **Privacy.** The toggle exposes names publicly. It must be admin-only, audited and default off.
  Junior members need an explicit decision.
- **Carry-over versus PlayHQ lists.** When a PlayHQ team list arrives it must not silently overwrite a
  selector's draft (keep the existing "admin source wins" rule).
- **Wrong private mapping.** A mis-mapped slot carries forward. Show the mapping in the hub and make it
  easy to undo.
- **Round model change** (navigation, rounds created on demand) touches the availability schedule's
  assumptions. Cover it with selection-standalone and availability tests.
