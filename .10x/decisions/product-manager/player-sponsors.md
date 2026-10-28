# Player sponsors

**Status:** Scoped with Ash 27 Oct 2026. **Next:** Principal Architect.

## Problem

Some clubs sell sponsorships tied to one player. Social Studio only knows club sponsors (by card
kind and grade), so a card about that player shows the club's strip and the player's sponsor gets
nothing. Admins fix it by hand or not at all.

## Decisions (Ash, 27 Oct 2026)

1. **Tag players on a sponsor** in the Sponsors section. A sponsor can back one or more players,
   with the same active dates the sponsor already has.
2. **On the player's cards, the player's sponsor replaces the club strip.** Club sponsors don't
   show on that card.
3. **Which cards:** cards centred on one player: milestones and feats (centuries, five-fors,
   milestones, debuts and caps, player of the week) and the player / new signing cards. Match
   results and team lists keep the club strip.
4. **Sponsors player pack:** library templates for a "Meet our sponsored player" announcement, a
   season thank-you card, and a sponsor-featured version of each player card kind.

## Requirements

- **P0** Sponsor ↔ player tags (senior players; juniors out of scope until consent is decided).
- **P0** Card data resolves the player's active sponsor for the kinds above; the strip shows only
  that sponsor (logo, name, presented-by line).
- **P0** Drafts made by the sweep and by hand both get it; a draft keeps its sponsor once made.
- **P1** The pack's templates, fit-checked like every library template.
- **P1** Sponsors page shows each sponsor's players; player page shows their sponsor.

## Settled (Ash, 27 Oct 2026)

- **Two active sponsors on one player: show both.** Templates need room for two player sponsors.
- **New fields where needed** (for example `{{playerSponsorLogo}}`, `{{playerSponsorName}}`, and a
  second pair), rather than reusing the club strip's `sponsor1`–`sponsor3`.

## Open questions for the architect

- Storage: a `sponsor_players` join (tenant, sponsor, player) is the likely shape.

## Settled with the design (Ash, 27 Oct 2026)

Design: `decisions/architect/player-sponsors.md`.

- **Player-centred kinds:** `milestone`, `century`, `fiveFor`, `debut`, `player` (player cards,
  player of the week) and `newSigning`. Match results, team lists, records, grade leaders and
  every other kind keep the club strip.
- **Personal sponsors stay personal:** a sponsor tagged with players and no card types shows only
  on its players' cards. With card types picked it also shows club-wide on those types, but never
  on another player's card.
- **The "presented by" line** on a player's card names the player's first sponsor.
- **Worked out when the card is drawn**, not frozen on the draft (supersedes "a draft keeps its
  sponsor once made"): the draft records which player it is about, and the sponsors are looked up
  like the club strip, so a sponsor tagged mid-week reaches that player's queued cards and an
  ended sponsorship drops off. Posted images never change.
