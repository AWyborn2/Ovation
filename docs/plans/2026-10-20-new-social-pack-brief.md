# New Social Studio pack — design brief (P8)

Status: AGREED with Ash, 20 Oct 2026 (look and content contract). Build is P8 in
`.10x/decisions/engineering-manager/match-day-carousel-content.md`, after P7.

Design: ADR-010, `.10x/decisions/architect/match-day-carousel-content.md`.
Requirements: `.10x/decisions/product-manager/match-day-carousel-content.md`.
Reference render (no-photo slides, every size): `docs/design-handoffs/new-social-pack/match-day-no-photo-all-sizes.png`
(the left column is the agreed treatment).

Working name **Duotone**, pack id `duotone-v1` (Ash can rename it before the build).

## 1. Why a third pack, and how it differs

Club Kit and Broadcast Dark are both dark, photo-on-the-side cards with condensed uppercase
type (Barlow Condensed / Anton), angular trim and fades. Ash wants a third pack that is
modern and photo-led, the way most club socials look now, with the photo optional.

|          | Club Kit                               | Broadcast Dark                  | Duotone (new)                                     |
| -------- | -------------------------------------- | ------------------------------- | ------------------------------------------------- |
| Photo    | Side or top frame with a diagonal trim | Right 62%, faded into the stage | Full bleed, gradient-mapped to club colours       |
| Shape    | Diagonal cuts, jumper-trim bands       | Slashes, hard edges             | Rounded white sheet, pill chips                   |
| Type     | Barlow Condensed + IBM Plex            | Anton + condensed sans          | Archivo Expanded (wide)                           |
| No photo | Gradient base                          | Stage colour                    | Zoomed, offset club logo under halftone and grain |

## 2. Look

### 2.1 Direction (Ash, 20 Oct 2026)

- Full-bleed photo, **duotone by default**: the photo's tones are remapped to the club's
  colours (shadows → ink, mid-tones → secondary, highlights → primary), so any library photo
  looks on brand. A per-club default and per-carousel switch offers **natural colour**
  instead (section 6.3).
- A white rounded **info sheet** carries the fixture. It never covers the player's face
  (crop rules, section 6.2).
- Headline is the **round on one line**: `ROUND 6`, the number in the primary colour. It
  replaces the words "MATCH DAY" at every size (the slide's purpose is clear from the sheet).
- Rejected on the way: matchday programme (cream paper and serif), flat poster, inset
  photo panel, bento tiles. Ash liked the poster and duotone ideas but wanted photo-led.

### 2.2 Type

One family, **Archivo** (Google Fonts, variable: `wdth` 62–125, `wght` 100–900).

| Use                              | Width | Weight                      | Notes                                     |
| -------------------------------- | ----- | --------------------------- | ----------------------------------------- |
| Headline (`ROUND 6`)             | 125   | 900                         | One line, tracking -0.01em, line-height 1 |
| Team names                       | 112   | 900                         | Name-fit rule (section 5)                 |
| Chips (grade, Home/Away)         | 100   | 700–800                     | Pill, sentence case                       |
| Detail text (date, time, ground) | 100   | 500 (labels) / 700 (values) |                                           |

Load it with the pack fonts that the browser and the server still harness both use (the
curated `index.html` link, next to Barlow Condensed and IBM Plex). `document-fonts.ts` only
requests `wght`, and the `wdth` axis is essential to the look. Fallback stack:
`'Archivo','Arial Black',system-ui,sans-serif`.

### 2.3 Colour

Tenant tokens only. No pack-owned colours apart from white and neutral greys on the sheet.

| Role                                                       | Token                                                                                   | Halls Head |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| Ink (base, duotone shadows, sheet text)                    | `tokens.ink` (`--ink`), else the secondary darkened toward black until white clears 7:1 | `#131A20`  |
| Secondary (duotone mid-tones, grade chip, no-photo glow)   | `brand.backgroundColour`                                                                | `#333F48`  |
| Primary (duotone highlights, round number, Home chip, "v") | `tokens.accent` (`--gold`)                                                              | `#FFB238`  |

Derived values, computed once per card like `deriveClubKitPalette` and emitted as
`--dt-*` custom properties:

- `--dt-on-p`: white or ink, whichever reads better on the primary (Home chip text).
- `--dt-p-on-light`: the primary mixed toward ink until it clears 3:1 on white (the "v" on
  the sheet; `#B8740A` for Halls Head).
- `--dt-p-on-dark`: the primary lifted toward white until it clears 4.5:1 on ink (the round
  number over a dark photo).
- Duotone stops: `[ink, secondary, primary]`. If the primary is darker than the secondary,
  the stops swap so the lightest colour is always the highlights. If the luminance gap
  between ink and the highlight stop is under 0.35, the highlight is mixed toward white.
  A dark-on-dark club then still gets a readable photo.
- Sheet greys: labels `#5B656E`, divider `#DADDE0`, on white.

### 2.4 Texture

- **Photo slides:** clean duotone, no added texture, plus a top-down ink fade (80% → 0)
  behind the headline. Height: 30% of the card on square/portrait, 35% on landscape, and
  from the card top to just below the headline on story.
- **No-photo slides:** an ink base, a secondary radial glow bottom-left and a 22% primary
  glow top-right. Then the club logo, then a halftone dot screen (6 px dots at 1080 px
  wide, ink at 55%), then fractal-noise grain (soft-light, 50%).

### 2.5 No-photo slides: the club logo (Ash, 20 Oct 2026)

The logo is a **zoomed, offset silhouette**, not a centred badge. It takes after the Club Kit
title-page watermark.

- Greyscale with its detail kept (`grayscale(1) brightness(2.6)`), **about 13% opacity**,
  under the halftone and grain.
- About 1.1x the card's short side, bleeding off the **top-right** edge on square, portrait
  and story, and off the **bottom-left** on landscape (the sheet sits on the right there).
- Its bottom edge stays above the sheet's top edge, so no fragment shows beside the sheet.
- No club logo: leave it out. The glow, dots and grain still carry the slide.
- The same treatment backs every slide that has no photo: Minimal preset fixture slides, the
  title slide when the library is empty, sponsors slides, and junior slides with no allowed
  photo.

## 3. Layout per size

Measurements are in the card's `cqmin` (1cqmin = 1% of the shorter side), as all pack
templates use. "Photo window" is where the photo's focal point must sit.

| Size               | Headline                                   | Sheet                                                     | Photo window                                                    |
| ------------------ | ------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------- |
| Square 1080×1080   | Top-left, 5cqmin in, 11cqmin               | Bottom, 4cqmin margin, full width, radius 5.5cqmin        | Between headline and sheet, centred                             |
| Portrait 1080×1350 | Top-left, 11cqmin                          | Bottom, as square                                         | Between headline and sheet (taller than square)                 |
| Story 1080×1920    | Below the top safe zone (top 13%), 14cqmin | Just above the bottom safe zone (bottom 18%)              | Between headline and sheet; only photo in both safe zones       |
| Landscape 1200×630 | Top-left over the photo panel, 14cqmin     | Right column, 43% of the width, full height minus margins | Left panel (60% of the width, faded into ink at its right edge) |

Sheet contents, top to bottom: grade chip (secondary, white text) and Home/Away chip
(Home: primary fill; Away: outline in ink); our team (crest + name); `v` (primary) +
opposition (crest + name); then the details. Square, portrait and landscape give the details
as one line ("Sat 8 Nov · 12:30pm · Rushton Park"); landscape splits it over two lines.
Story gives them as a labelled list (Date / Start / Ground).

Story safe zones: no text in the top 250 px or bottom 340 px (of 1920); only photo
or texture sits there.

## 4. Content contract (Match Day)

The pack consumes `CardContent` and the visible-field set from P2 (`@workspace/scorecard/card-content`)
and does no data shaping. Field keys below are descriptive; **P2's field catalogue is the
source of truth.** If it names a field differently, P2 wins and this brief follows.

Presets (PM decision 3): Minimal, Standard and Full set the toggles, and an admin can still
switch single fields. The table below proposes each optional field's presets for P2's catalogue.

### 4.1 Title slide

| Field                    | Core / optional                                                  | Minimal | Standard | Full | How Duotone shows it                                                  |
| ------------------------ | ---------------------------------------------------------------- | ------- | -------- | ---- | --------------------------------------------------------------------- |
| Weekend title            | Core                                                             | ✓       | ✓        | ✓    | Headline, one line ("ROUND 6", or "THIS WEEKEND" if there's no round) |
| Date range               | Core                                                             | ✓       | ✓        | ✓    | Sheet, first line ("Sat 8 – Sun 9 Nov")                               |
| Club logo                | Core                                                             | ✓       | ✓        | ✓    | Sheet header, left, 9cqmin                                            |
| Cover photo              | Optional (auto-picked; brand background if the library is empty) | —       | ✓        | ✓    | Full-bleed duotone; Minimal uses the no-photo treatment               |
| Round + fixture count    | Optional                                                         | —       | ✓        | ✓    | Chip: "12 fixtures"                                                   |
| Grades playing           | Optional                                                         | —       | —        | ✓    | Chip row, wraps to 2 rows max, then "+3 more"                         |
| Presenting sponsor       | Optional                                                         | —       | ✓        | ✓    | Sheet footer: "Presented by" + logo (name if no logo)                 |
| Livestream / scores link | Optional                                                         | —       | —        | ✓    | Sheet footer, primary chip "Watch live" + short URL text              |

Carousel cue: a small "Swipe →" pill bottom-right on feed sizes, and none on story.

### 4.2 Fixture slide (one fixture per slide, senior)

| Field                                                | Core / optional                           | Minimal | Standard | Full | How Duotone shows it                                                                          |
| ---------------------------------------------------- | ----------------------------------------- | ------- | -------- | ---- | --------------------------------------------------------------------------------------------- |
| Round                                                | Core                                      | ✓       | ✓        | ✓    | Headline ("ROUND 6"; a final shows its label, e.g. "SEMI FINAL"; no round → "MATCH DAY")      |
| Grade                                                | Core                                      | ✓       | ✓        | ✓    | Grade chip                                                                                    |
| Our club (short name + crest)                        | Core                                      | ✓       | ✓        | ✓    | Sheet line 1                                                                                  |
| Opposition (short name + crest)                      | Core                                      | ✓       | ✓        | ✓    | Sheet line 2, after "v"                                                                       |
| Home / away                                          | Core                                      | ✓       | ✓        | ✓    | Chip, top-right of the sheet                                                                  |
| Date, start time, venue                              | Core                                      | ✓       | ✓        | ✓    | Details line / list                                                                           |
| Player photo (auto-picked from the grade, swappable) | Optional                                  | —       | ✓        | ✓    | Full-bleed duotone; Minimal uses the no-photo treatment                                       |
| Free-text note                                       | Optional                                  | —       | ✓        | ✓    | Sheet, below the details, 1–2 lines; shown only when there's text; editor limit 80 characters |
| Ladder positions                                     | Optional                                  | —       | —        | ✓    | Small grey ordinal after each name ("3rd")                                                    |
| Last meeting result                                  | Optional                                  | —       | —        | ✓    | One extra line: "Last met: Halls Head won by 24 runs (2025/26)"                               |
| Milestone watch                                      | Optional (senior only, fill-ins excluded) | —       | —        | ✓    | One extra line with a primary dot: "J. Smith needs 12 for 1,000 club runs"                    |

A field whose data is missing or failed to load hides itself; no "TBC" or blank row
(ADR-010). The sheet grows upward and the photo window shrinks with it, so the focal point
moves up with the sheet top (section 6.2).

### 4.3 Sponsors slide

| Field                              | Core / optional                                          | Minimal | Standard | Full         | How Duotone shows it                                     |
| ---------------------------------- | -------------------------------------------------------- | ------- | -------- | ------------ | -------------------------------------------------------- |
| Heading ("Thanks to our sponsors") | Core                                                     | ✓       | ✓        | ✓            | Headline style, may take 2 lines here                    |
| Sponsor logos                      | Core (fallback: club thank-you line when there are none) | ✓       | ✓        | ✓            | White sheet, logo grid; logos contained, never cropped   |
| Tiered grid (major larger)         | Optional                                                 | —       | ✓        | ✓            | Major: 2 per row at double size, above the standard tier |
| Include grade-assigned sponsors    | Optional                                                 | —       | —        | ✓            | Same grid, standard tier                                 |
| Thank-you line + CTA               | Optional                                                 | —       | ✓        | ✓            | Sheet footer, one line + primary chip                    |
| Next home game / social links      | Optional                                                 | —       | —        | ✓            | Under the sheet on the base, white text, one line each   |
| Admin background image             | Optional                                                 | —       | —        | ✓ (when set) | Duotoned like a photo; otherwise the no-photo treatment  |

### 4.4 Junior multi-fixture slide (P3)

Junior carousels with "consolidate by day" on put all fixtures on the same local date on one
slide (`groupSlides`). Senior slides never use this layout, and a slide never mixes senior
and junior fixtures.

- Headline: the round as usual, or the date ("SAT 8 NOV") when the day's fixtures span rounds.
- Sheet: a list. A date heading ("Saturday 8 November"), then one compact row per fixture:
  `[grade chip] [crest] v [opposition short name] · [start time] · [Home/Away]`,
  with the venue on a second muted line only when it differs from the row above.
- Our club's name is not repeated on each row; it sits in the sheet header with our crest.
- Per-fixture optional fields (ladder, last meeting, milestone watch, note) never show on
  multi rows; they belong to single fixture slides. Milestone watch is senior only anyway.
- Photo: a junior photo allowed by `card_photo_rules` / the junior photo rules, shown in the
  photo window above the sheet; otherwise the no-photo treatment. With a photo the sheet
  takes up to 70% of the card; without one, up to 82%.
- The same layout, with a result in place of the time, serves junior results / match
  summary slides (P3 T3.3).

## 5. Name fit

Every name box uses the shared rule from P1 (`pack-render/name-fit.ts`): **shrink to
`MIN_FIT` (0.6), then wrap onto a second line, then ellipsis only past two lines at the
minimum.** Names arrive already short (`resolveCardTeamName`: club override → automatic
short name → raw).

Duotone-specific use of the rule:

- Fixture sheet names are `data-fit` boxes. Starting capacities in characters at full size,
  to be tuned by the fit grid: square 20, portrait 17, story 15, landscape 13.
- The two names in a fixture share **the smaller of their two scales**, so our name is never
  drawn bigger than the opposition's.
- A wrapped name keeps its crest top-aligned with the first line.
- Multi-fixture rows are `data-fit-row` boxes: they wrap only at the minimum size, so a long
  name can't push the rows below it off the card.
- Headlines (`ROUND 6`, "PRELIMINARY FINAL") are one line, always: shrink-only down to 0.6, and
  past that the label's own short form ("PRELIM FINAL"). They never wrap.

## 6. Photos

### 6.1 Source

From P4's `pickPhoto` (least recently used, junior rules respected); the admin can swap per
slide. No photo → the no-photo treatment (section 2.5), with no warning.

### 6.2 Crop

- Fill the card (cover). The focal point sits in the photo window from section 3.
- If the photo has a focal point, centre it in the photo window. Library photos have none
  today; Studio image layers already store `focalX`/`focalY` for cover crops, so the same
  shape could be added to library photos. Otherwise use the size's default anchor: square and portrait `50% 5%`; story scaled to 122% of the width, anchored
  to the top; landscape `50% 5%` inside the left panel.
- The face must not sit behind the headline or the sheet. The draft fit warning flags it when
  a focal point lands outside the window.

### 6.3 Treatment

- Default **duotone** (gradient map via an inline SVG `feComponentTransfer` filter built
  from the card's stops; it renders identically in the browser and in headless Chromium).
- **Natural colour** is an option: a club default in Social Studio settings plus a
  per-carousel override, stored with the other content settings (P2's `card_content`, no
  new column). Natural photos keep the ink top fade for the headline.

## 7. What fits at each size

Capacity is declared per size and preset, as ADR-010 requires (`capacity[size][preset]`).
These are design targets; the CI fit grid (3 packs × 3 presets × 4 sizes × kinds) is the
judge, and any number it can't meet is lowered rather than letting content overflow.

### 7.1 Fixture slide: optional lines the sheet can add (beyond the core)

| Preset                                                      | Square       | Portrait | Story | Landscape                         |
| ----------------------------------------------------------- | ------------ | -------- | ----- | --------------------------------- |
| Minimal (core only)                                         | 0            | 0        | 0     | 0                                 |
| Standard (note)                                             | 2 note lines | 2        | 2     | 1 note line                       |
| Full (note + last meeting + milestone watch; ladder inline) | 4 lines      | 4        | 5     | 3 lines; the note drops to 1 line |

Landscape at Full: the note is clamped to one line (the editor limit keeps it short);
last meeting and milestone watch each take one line.

### 7.2 Junior multi-fixture rows per slide

|            | Square | Portrait | Story | Landscape |
| ---------- | ------ | -------- | ----- | --------- |
| With photo | 4      | 5        | 6     | 3         |
| No photo   | 5      | 6        | 7     | 4         |

A day with more fixtures splits into further slides for that day. Past 10 slides, the
existing Meta warning applies.

### 7.3 Sponsors slide logos

|                    | Square      | Portrait    | Story        | Landscape   |
| ------------------ | ----------- | ----------- | ------------ | ----------- |
| Standard tier only | 9 (3×3)     | 12 (3×4)    | 15 (3×5)     | 8 (4×2)     |
| Tiered             | 2 major + 6 | 2 major + 9 | 2 major + 12 | 2 major + 4 |

More logos than fit: the standard tier first goes 4 per row, then the set gains a second
sponsors slide.

### 7.4 Title slide

Every field fits at every size. The grades-playing chips are capped at 2 rows, then "+N more".

## 8. Build notes for P8

- `pack-templates/duotone/` on the shared skeleton conventions: one markup per format
  (story, portrait, square, landscape), units in `cqmin`, colours only from `--dt-*` /
  tenant tokens with neutral `var()` fallbacks.
- Register in `registry.ts` **and** `api-server/src/lib/design-packs.ts` (the two
  registries are not checked against each other).
- The pack declares the slots it supports and `capacity[size][preset]` for matchDay
  (single + multi-fixture), and as P7 lands, for teamList / results / matchSummary. Kinds the
  pack doesn't design yet fall back like the existing packs do.
- Fit grid and pack lint (`pack-lint.test.ts`, `pack-own-look-parity.test.ts`) cover it
  from the first PR. Every preset at every size, with photo and without.
- P9 (retiring Gold Foil, Bold Type, Neon Night and Sunset) follows; their saved choices fall
  back to Club Kit, not to this pack.

## 9. Open points (for the build, not blocking the brief)

- Final pack name and id (`duotone-v1` is a working name).
- Exact capacities: set by the fit grid.
- Natural-colour switch placement in the settings UI (P2 owns the content settings screen).
