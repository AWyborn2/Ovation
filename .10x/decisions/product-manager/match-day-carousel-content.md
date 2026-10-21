# Match Day carousel: shared content model, admin-controlled fields, three packs

Status: RECOMMENDED 2026-10-20 (decisions with Ash; awaiting architect plan)

## Problem

The same fixture says different things depending on the pack. Club Kit leads with grade and
hides our club name; the five skeleton packs show club v opposition and drop grade. Long
names wrap in Club Kit but are cut with an ellipsis in the skeletons. The fixture-to-card
mapping exists twice (server `engines/match-day.ts:45-57`, client
`components/weekend-carousel/model.ts:376-394`) and they disagree (TBC fallbacks, round
casing, `junior`). Cover and fixture photos are picked by hand, so automated carousels have
gaps. Result: hard to automate, inconsistent output, six layouts to maintain.

## Target user

Primary: club social admins (set content once, automation does the rest, override per post).
Secondary: followers (consistent, readable, informative slides).

## Decisions (Ash, 2026-10-20)

1. Shared content, multiple layouts. One content model built once (server-side) feeds every
   layout; layouts only decide placement and style.
2. Control: club default in Social Studio settings + per-carousel override before posting.
   Every optional field is an on/off toggle in settings.
3. Presets Minimal / Standard / Full set the toggles; admins can still adjust single fields.
   Each layout must fit every preset at every size (square, portrait, story, landscape).
4. Packs: keep Club Kit and Broadcast Dark; design one brand-new, distinct pack. Gold Foil,
   Bold Type, Neon Night, Sunset are **hidden, not deleted** (revised by Ash 21 Oct 2026, see
   below).
5. Names come from social-tile-short-names (club-set short name, auto fallback); one fitting
   rule for all packs (shrink, then wrap to 2 lines; never mid-word ellipsis).

## Content model per slide type

Title page

- Core (always on): weekend title, date range, club logo.
- Optional: round + fixture count; grades playing list; presenting sponsor; livestream /
  scores link.
- Cover photo: auto-picked from the library (club/team photos, least recently used first),
  admin can swap; brand-colour background when the library is empty.

Fixture slide (one per fixture)

- Core: grade, our club v opposition (short names + crests), date, start time, venue,
  home/away, round.
- Optional: ladder positions (`central.ladder`); last meeting result (`central.matches`);
  milestone watch (player within reach of a milestone, senior-only, fill-ins excluded);
  free-text note; auto-picked player photo from that grade (admin can swap).

Sponsors page

- Optional (each toggleable): tiered grid (major larger; needs a tier on sponsors); include
  grade-assigned sponsors as well; thank-you line + CTA; next home game / social links;
  admin-uploaded background image.
- Fallback stays: club thank-you when no sponsors.

## Prioritisation

- P0 Single content builder (server) used by sweep drafts and the carousel UI; delete the
  client duplicate. Same fallbacks everywhere.
- P0 Content settings: per-field toggles + Minimal/Standard/Full presets, club default,
  per-carousel override.
- P0 Club Kit and Broadcast Dark rebuilt on the shared slots; one name-fit rule.
- P0 Auto photo pick (cover + fixture) with swap.
- P1 Optional data fields: ladder, last meeting, milestone watch, livestream link.
- P1 Sponsors page options (tiers, background image, CTA, next home game / socials).
- P1 New third pack (design brief first; must use the same slots).
- P1 Hide the four legacy packs everywhere (P9); keep their code as seed content for the template library.

## User stories

- As an admin, I set which fields appear once and every automated carousel follows it.
- As an admin, I pick Minimal/Standard/Full and the slides never overflow.
- As an admin, I can change fields or photos on one carousel without changing the default.
- As a follower, every fixture slide tells me grade, who v who, when and where.

## Success criteria

- A carousel can be posted with zero manual edits (photos, names, fields) for a normal
  Halls Head round.
- 0 truncated names and 0 overflow across 3 packs x 3 presets x 4 sizes (visual test grid).
- One fixture mapping in the codebase (server and client outputs identical in tests).
- Admin edits per carousel before posting go down vs today (draft edit history).

## Not building

- Free-form layout editor or per-field positioning by admins.
- Fields beyond the lists above (e.g. weather, live score widgets).
- Changes to central/PlayHQ data; association-wide settings.
- More than three packs.

## Risks

- Preset x size combinations multiply test surface -> layouts declare capacity; a visual
  regression grid in CI.
- Ladder/last-meeting data missing for some grades/clubs -> field hides itself, never shows
  blank or "TBC".
- Milestone watch touches stats correctness -> reuse existing milestone derivations
  (senior-only, fill-ins excluded, juniors isolated).
- Retiring packs breaks saved carousels -> read-time fallback to Club Kit.
- Depends on social-tile-short-names for names and crests.

## Revision 21 Oct 2026: legacy packs hidden, not retired (Ash)

Ash's long-term plan is a Canva-style template library for social assets. Deleting Gold Foil,
Bold Type, Neon Night and Sunset would throw away seed content. Hand-porting them onto the
content model is the per-pack work a library must avoid.

- Until the library is scoped and built, the four packs are hidden completely. They can't be
  picked for new posts, in the editor's pack switcher or as the club default. A saved card,
  carousel or default that uses one renders as Club Kit (read-time fallback).
- Their template code stays in the repo, and their looks are reused when the library converts
  them.
- Follow-up feature: `social-template-library`. Templates become data (layer documents bound
  to the card-content slots, building on card-kind-templates ADR-001..003), fit is checked
  automatically, and there's a browsable library. Its first job is converting Club Kit,
  Broadcast Dark, the new pack and the four legacy packs.
