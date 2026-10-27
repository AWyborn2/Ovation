# Player sponsors

**Status:** Scoped with Ash 27 Oct 2026. **Priority:** P1.
**Next:** Principal Architect (`decisions/architect/player-sponsors.md`).

## Problem

Clubs sell personal sponsorships: a local business backs one player for the season. Today a
sponsor can be tied to card types and to teams (team list cards), but not to a player, so the
player's own sponsor never appears on the cards that are about that player. Admins either leave
it off or edit every milestone card by hand.

## Target user

Club sponsorship and social media managers who sell player sponsorships and post player cards
from Social Studio.

## Today (checked in code, 27 Oct 2026)

- `sponsors` rows carry `card_kinds` (empty = every card), `grades` (a team list for that grade
  shows that sponsor as its one logo), `is_presenting` and `tier`.
- The strip on a card is chosen by `sponsorsForCard` in the web app
  (`artifacts/cricket-club/src/lib/share-card/sponsor-limit.ts`). The server's post render
  (`api-server/src/lib/draft-render.ts`) filters by card type only, so a team list rendered for
  posting does not yet carry its team's sponsor the way the preview does.
- A draft does not record which player it is about; the photo picker reads it from the card's
  link (`/players/42`) or the sweep's `playerId`.

## Decisions (Ash, 27 Oct 2026)

1. **Tag players on a sponsor**, in the sponsor library, next to "Team sponsor".
2. **Player cards carry the player's sponsors.** On a card about one player (milestone, feats,
   player and new signing cards, records, grade leaders, debut, big moment, trading card) the
   player's active sponsors replace the club sponsor strip. Two active sponsors for that player:
   both show.
3. **Senior players only.** Junior participants can't be tagged (the same rule as photo tags);
   juniors wait on a consent decision.
4. **Build after photo focus areas**, alongside template library release 2.

## User stories

- As a sponsorship manager, I want to tag a sponsor with the players it backs, so that their
  cards show the sponsor without editing each one.
- As a social media manager, I want a milestone card for a sponsored player to show that
  player's sponsor instead of the club strip, so that the sponsor gets the credit they paid for.
- As a social media manager, I want a card for a player with no sponsor of their own to show the
  usual club strip, without other players' personal sponsors.
- As a social media manager, I want a personal sponsor to stay off the club's other cards unless
  I choose card types for it.

## Requirements

### P0 (must have)

- **Players on a sponsor:** a sponsor can be tagged with any number of the club's senior players;
  a player can have several sponsors. Junior participants and fill-ins are rejected.
- **Player cards:** on a player-centred card with a known player, the strip is that player's
  sponsors whose dates cover today (in the library's order), and the "presented by" line names
  the first of them. No sponsor of their own: the club strip as today, leaving out sponsors that
  belong to other players.
- **Personal sponsors stay personal:** a sponsor with players and no card types shows only on its
  players' cards. With card types picked, it also shows on those card types for the club (but
  never on another player's card).
- **Preview equals post:** the Studio preview, the share card and the server's post render choose
  the same sponsors (one shared rule). Team list posts carry their team's sponsor as the preview
  does.
- **Drafts follow the library:** a draft records which player it is about; which sponsors show is
  worked out when the card is drawn, as the club strip is today. Tagging a player mid-week updates
  their queued cards; an ended sponsorship drops off.
- **Sponsors switch:** the club's "sponsors on cards" switch still turns every strip off.

### P1 (should have)

- A "Player sponsors" chip on the sponsor row listing the tagged players by name.
- Create a card: pick the card's player so a hand-made player card carries their sponsor.

### P2 (nice to have)

- Sponsor templates: a sponsorship announcement, a season thank-you and a sponsor-featured player
  card (large sponsor logo beside the player). Built on the template library once release 2 lands.
- The player's sponsors on their public player page.

### P3 (won't do now)

- Junior player sponsors (consent decision first).
- Sponsorship billing, contracts or reporting.

## Success criteria

- Every player card posted for a tagged player in the four weeks after release carries their
  sponsor, with no hand edit.
- No player card shows another player's personal sponsor.
- No difference between the preview and the posted image's sponsors (checked by the shared rule's
  tests and one browser check).

## Risks

- **Preview and post drifting:** the strip rule lives in the web app today. Mitigation: move it
  to `@workspace/scorecard` and use it on both sides.
- **A club-wide sponsor that also backs one player** leaves other players' cards (it is now a
  player sponsor). Mitigation: the sponsor form says so; revisit if clubs ask for both.
- **Production migration:** new table and column; Ash runs the SQL before republishing.
