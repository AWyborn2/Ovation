---
title: "Clubhouse card look (from the White Knights templates) + four new card types"
type: feat
date: 2026-10-14
status: in-progress
---

# Clubhouse card look + four new card types

## Goal

Turn the White Knights Baldivis social templates (16 images, Downloads/Social Media Templates)
into a reusable, editable card look that any club can start from, recoloured to its own
colours and crest — and set tenant 68 (White Knights) up with it as-is.

Decisions (Ash, 14 Oct 2026):

- **Form:** a third starter look in Studio → Card designs (kind templates), next to Club Kit and
  Broadcast. Not a pack — packs are being retired.
- **New card types:** Announcement, Sponsor, Team of the week, Results (with best players).
- **Ground photo:** comes from the club's own uploads (a club-level image), never bundled.

## What the templates show (design language)

- Stage in the club's dark colour (WK navy), accent in the club colour (WK gold).
- Club ground photo behind title/list cards, tinted toward the stage; plain stage on hero cards.
- Crest + club name lockup at the top (white or gold).
- Title cards ("WEEKLY FIXTURES", "TEAM SELECTIONS", "WEEKLY RESULTS"): heavy slab type, two
  lines (white over gold), glowing gold corner brackets, sponsor artwork panel.
- Hero cards (milestone "150 GAMES", player highlight "5/28"): huge brush-lettered gold type on
  the left, player cut-out photo on the right.
- List cards: white rows with gold borders, a gold grade chip, dark type; the results card has
  both scores plus best batters / best bowlers per grade; fixtures add a venue column.
- Team selection: player photo bottom-left, numbered gold chips with white name plates in two
  columns of six, chevrons beside the grade title.
- Announcement: speech bubble (white on gold or gold on white), sparkles, sun-burst strokes.
- Team of the week: 12-player grid, photo + figure + name + grade.

## Phases

### Phase A — the look for the existing 21 kinds (PR 1)

1. **Fonts:** Alfa Slab One (slab titles) and Permanent Marker (brush heroes) added to the card
   font loader (`lib/card-fonts.ts`, `share-card/fonts.ts`).
2. **Club stage colour:** `clubStageVars` (`pack-render/club-kit-vars.ts`) — the club's
   background colour darkened until white type clears 4.5:1, plus deep and translucent tints.
   Emitted only on template overlays (pack renders stay byte-identical).
3. **Two-column lists:** `RowsSpec.columns` / `columnGap` (lib/scorecard document, validator,
   capacity) and the renderer (`renderRows`) — rows fill the first column, then the next.
4. **Kit:** panel type colours (`panelInk/Muted/Accent`, light panels take dark type) and
   per-look body overrides.
5. **Clubhouse theme** (`starters/clubhouse.ts`): stage, tinted ground photo, crest lockup,
   corner brackets, list rows as white plates with gold chips; bespoke bodies where the
   templates differ (team list, fixtures, milestone/hero cards, covers).
6. `STARTER_IDS` gains `clubhouse` ("Clubhouse"); proofs page, starter chooser, tests.

### Phase B — four new card types (PR 2)

Per kind, everywhere a kind is listed (map in the session notes): share-card types +
`CARD_KINDS`, `TEMPLATE_CARD_KINDS` + `KIND_FIELDS` (+ `CLUB_KIT_ONLY_KINDS`), Club Kit pack
design + coverage + server `PACKS`, pack-lint allowlist, `bind.ts`, samples, captions, headline,
export filename, legacy `card-template.ts`, Create-a-card descriptor + picker + blurb/keywords,
social family, OpenAPI `CardKind` enum + codegen, starter bodies for all three looks.

- **announcement** — headline (multi-line), eyebrow, supporting line. Manual only.
- **sponsor** — season line, sponsor name, tagline, sponsor artwork (from the club's sponsors).
  Manual, prefilled from a chosen sponsor.
- **resultsSummary** — per grade: grade, both teams + scores, result verb, top 2 batters and
  top 2 bowlers. Prefill from central round data (extends the weekend-wrap derivation).
- **teamOfWeek** — up to 12 players: name, figure, grade, photo. Needs image cells in list
  rows. Prefill from central round data (best figures across grades), admin edits before use.

No database migration (kind columns are plain text; the sponsor kind list is an OpenAPI enum).

### Phase C — tenant 68 as-is (PR 3 / ops)

- Club ground image: a `tenants.hero_images` slot (`cards`) uploaded in admin, exposed to
  templates as `{{groundPhoto}}` like `{{clubLogo}}`.
- Tenant 68: brand colours navy/gold + crest checked; templates started from Clubhouse for
  every kind (Studio → Card designs → Start from Clubhouse); ground photo uploaded.
  Production data steps are Ash's (assistant sessions can't reach production).

## Verification

Starter contract + template-lint tests for the new look; the in-browser fit check on the proofs
page (sample + stress, every size) as for Club Kit/Broadcast; full web + scorecard suites.
