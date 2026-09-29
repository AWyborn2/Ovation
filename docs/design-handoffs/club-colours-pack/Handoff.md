# Handoff: "Club Colours" design pack (Social Media Studio)

## Overview
This is a new design pack for the Social Media Studio in the Ovation cricket-club app (`artifacts/cricket-club`). Every colour is **derived from the tenant's brand tokens**, so one pack looks native for every club. It covers **8 card kinds × 4 formats = 32 templates**.

| Kind | key | Chip label | Default photo |
|---|---|---|---|
| Match result | `result` | Result | action (sweep) |
| Player milestone | `milestone` | Milestone | action (drive) |
| Top performers / club leaders | `leaders` | Leaders | celebration (high-five) |
| Game day (all grades this round) | `matchday` | Round {n} | handshake |
| Team selection (XI + 12th) | `team` | Team list | stumps |
| Trading card | `trading` | Collectable | player photo |
| Premiership | `premiership` | Premiers | premiership team photo |
| Juniors | `junior` | Juniors | junior action |

| Format | Export px | CSS aspect |
|---|---|---|
| `square` | 1080×1080 | 1 / 1 |
| `portrait` | 1080×1350 | 1080 / 1350 |
| `story` | 1080×1920 | 1080 / 1920 |
| `landscape` | 1200×630 | 1200 / 630 |

## About the design files
The `.dc.html` files are **design references built in HTML**. They are prototypes of look and behaviour, **not production code to copy**. Recreate the pack in the existing codebase:
- Register a new pack `club-colours` in `src/lib/pack-templates/registry.ts`, beside `broadcast-dark`, `gold-foil`, `bold-type`, `neon-night` and `sunset`.
- Add one template per kind in `src/lib/pack-templates/club-colours/<kind>.ts`. Build them as layer lists so they open in the Studio editor, or as React renderers, whichever matches the current pack-render pipeline in `src/lib/pack-render/*`.
- Resolve colours through `src/lib/pack-render/tokens.ts` / `theme-tokens.ts` from `ClubBrand`. Never hard-code Halls Head values.

To view the prototype, open `Club Pack.dc.html` (the gallery of all 32) or `Club Pack Card.dc.html` (one card) in a browser, with `support.js` beside them and an internet connection for Google Fonts.

## Fidelity
**High-fidelity.** Layout, proportions, type, colour derivation and the trim/photo-frame system are final intent. All names, scores, fixtures and sponsors are **sample data**; bind them to real match/player data exactly like the existing packs do.

---

## 1. Brand tokens → pack variables
Inputs come from `ClubBrand`. The prototype's `BRANDS.hhcc` shows the Halls Head values.

| Input | Source field | HHCC sample |
|---|---|---|
| `primary` | `primaryColour` / accent | `#FBAC27` |
| `secondary` | `secondaryColour` | `#333F48` |
| `juniors` | `juniorsColour` | `#42342B` |
| `ink` | dark base (`#10151B` default) | `#10151B` |
| `chalk` | `textLight` | `#F2F5F8` |
| `crest` | crest/logo URL (optional) | `assets/hhcc-logo.png` |
| `short`, `mono`, `founded`, `hashtag`, `sponsors[]` | club profile + social settings | "Halls Head", "HH", 1991, "#GOHEADS", ["Bendigo Bank","4Life Physio"] |

Derived variables, computed once per card:

| Var | Rule | Used for |
|---|---|---|
| `--base` | `ink`. **Juniors:** `mix(juniors, #000, 45%)` | Card background |
| `--base2` | `mix(base, secondary or juniors, 35%)` | Background gradient end |
| `--p` | `primary` | Solid blocks: kind chip, home score bar, hashtag block, rank tiles, stars, trim |
| `--s` | `secondary`. **Juniors:** `juniors` | Chip notch, opponent bar edge, trim |
| `--onp` | `#FFFFFF` or `ink`, whichever has the higher WCAG contrast on `primary` | Text on `--p` blocks |
| `--pt` | `primary` lightened toward white in 22% steps, up to 6 times, until contrast with `--base` ≥ 4.5:1 | Primary used **as text** (WIN, 1,000, eyebrows, times) |
| `--glowc` | `rgba(primary,.16)` | Bottom-left radial glow |
| `--chalk` | `chalk` | Main text |
| `--chalk2` | `rgba(chalk,.68)` | Secondary text |
| `--panel` | `rgba(chalk,.07)` | Row/panel fills |
| `--line` | `rgba(chalk,.14)` | Hairlines |

Colour helpers (see `hex/rgb/lum/contrast/mix/rgba` in `Club Pack Card.dc.html`):
- **Contrast** uses the WCAG relative-luminance formula.
- **`mix(a, b, t)`** is a linear RGB interpolation.

The key promise: **a club with a dark or saturated primary still gets legible cards**, because `--pt` and `--onp` adapt automatically. Screenshots 17 and 18 show a red/navy demo club and a custom blue/purple override.

## 2. Card anatomy (shared skeleton)
All measurements use **`cqmin` of the card**: the card root has `container-type:size`, so 1cqmin = 1% of the card's shorter side. Everything scales identically at 1080px export and in thumbnails.

The layers, from bottom to top:
1. **Background:** `linear-gradient(160deg, --base 0%, --base2 100%)`, plus `radial-gradient(ellipse 80% 60% at 0% 100%, --glowc, transparent 60%)`.
2. **Watermark crest:**
   - Position: `left:-14cqmin; bottom:-16cqmin`, size 70×70cqmin, `object-fit:contain`.
   - Styling: `opacity:.07`, `filter:grayscale(1) brightness(3)`.
   - Hidden when there's no crest.
3. **Jumper-trim stripes**: three stacked bands behind the photo edge. See §3.
4. **Photo frame**: full colour, no duotone. See §3.
5. **Content column**: `padding:6cqmin`, flex column with `gap:3cqmin`, in three parts:
   - **Header row** (space-between):
     - Crest: `height:10cqmin`. With no crest, show a monogram disc instead: 10cqmin circle, `--p` fill, `--onp` text, Barlow 900 4.6cqmin.
     - Club short name: Barlow Condensed 800, 4.6cqmin, uppercase, line-height .95.
     - Tagline "CRICKET CLUB · EST. {founded}": IBM Plex Mono 500, 1.5cqmin, `letter-spacing:.22em`, `--chalk2`.
     - **Kind chip** on the right: a 1.2cqmin `--s` notch, then a `--p` block with `--onp` text. Barlow 800, 2.5cqmin, `letter-spacing:.12em`, uppercase, padding 1cqmin 2.2cqmin.
   - **Body** (`flex:1`): positioned per format (see §4), with the kind-specific content from §5.
   - **Footer**:
     - Tricolour rule: `.8cqmin` high, `gap:.6cqmin`, segments flex 6/1/3 in `--p` / `--chalk` / `--s`.
     - Below it, a space-between row:
       - Left: "SUPPORTED BY" (Plex Mono 1.7cqmin, `.18em`, `--chalk2`) and sponsor names (Plex Sans 700, 2cqmin, `--chalk`).
       - Right: **hashtag block**: `--p` background, `--onp` text, Barlow 800 2.9cqmin, `letter-spacing:.04em`, padding .6cqmin 1.6cqmin. It's a solid block so it stays legible over photos.

## 3. Photo frames & trim (the signature element)
Photos are **full colour**. Duotone was removed, so don't apply any filter or blend.

The frame sits on `--base`, with `object-fit:cover` and a per-photo `object-position` (focal point). Store the focal point with each media-library image.

### Side frame: `square` and `landscape`
- Frame box: `left:54cqw; top:0; width:46cqw; height:100cqh`.
- Clip: `polygon(24% 0, 100% 0, 100% 100%, 0 100%)`, a diagonal left edge.
- Fade over the photo: `linear-gradient(90deg, rgba(base,.35) 0%, transparent 40%)`.
- **Trim**: three full-height bands **behind** the frame. Each is the same polygon offset left by `d`:
  - Band 1: `--s`, d = 3.8cqmin
  - Band 2: `--chalk`, d = 2.8cqmin
  - Band 3: `--p`, d = 2cqmin

  Each band's box: `left: calc(54cqw - d)`, `width: calc(46cqw + d)`, `clip-path: polygon(calc(46cqw*.24 + d) 0, 100% 0, 100% 100%, 0 100%)`.

  The visible result is a secondary / chalk / primary stripe running down the diagonal edge, like jumper trim.

### Top frame: `portrait` and `story`
- Frame box: `left:0; top:0; width:100cqw; height:H`. H depends on format and kind:

  | Format | Kinds | H |
  |---|---|---|
  | story | all | 46cqh |
  | portrait | matchday, team, junior, leaders (list-heavy) | 24cqh |
  | portrait | result, milestone, trading, premiership | 31cqh |

- Clip: `polygon(0 0, 100% 0, 100% 78%, 0 100%)`, a sloped bottom edge that rises to the right.
- Fades, top and bottom:
  - `linear-gradient(0deg, rgba(base,.55) 0%, transparent 40%)`
  - `linear-gradient(180deg, rgba(base,.7) 0%, transparent 30%)`
  - The top fade keeps the header legible over the photo.
- **Trim**: three bands behind the frame (same colours and offsets). Each band's box: `height: calc(H + d)`, `clip-path: polygon(0 0, 100% 0, 100% calc(H*.78 + d), 0 100%)`.

### Trading card inner frame (all formats)
- A 5:7 card, `width:46cqmin`, 1.2cqmin `--p` border (padding), rotated −3°, `box-shadow: 0 3cqmin 6cqmin -2cqmin rgba(0,0,0,.6)`.
- Inside it:
  - The photo, with `linear-gradient(0deg, --base 0%, transparent 55%)` over it.
  - Top trim strip: 2.4cqmin high, flex 3/1/3 in `--s` / `--chalk` / `--s`.
  - Cap tile "#242": Barlow 900 3.6cqmin, `--s` background, top-left.
  - Crest: 7cqmin, top-right.
  - Name: Barlow 900 5.4cqmin, 2 lines. Role: Plex Mono 1.3cqmin in `--pt`.
  - A 4-up stat grid: `--panel` cells with a .4cqmin `--p` top border. Values are Barlow 800 3cqmin; labels 1.1cqmin, `.12em`.
- Centred in tall formats, left-aligned in square and landscape.

### Photo slots for implementation
Each template exposes one `photo` slot (`src`, `focalPoint`). The trading card has a second `cardPhoto` slot, which defaults to the player's headshot or action shot. Junior cards only fill the slot when the player has **parent photo consent**; otherwise use a club action or team photo with no identifiable child.

## 4. Body placement per format
| | square / landscape | portrait / story |
|---|---|---|
| Body vertical align | `center` | `flex-end` (sits under the photo) |
| Body max-width | **52%** (stays left of the photo). Trading: 100% | 100% |

Type sizes that change by format:

| Var | Tall formats | Square / landscape |
|---|---|---|
| `--msSz` (milestone number) | 30cqmin | 23cqmin |
| `--premSz` ("PREMIERS") | 19cqmin | 14.5cqmin |
| `--mdSz` ("GAME DAY") | 12cqmin (portrait) / 16cqmin (story) | 16cqmin |

## 5. Kind layouts (body content)
The type system:
- Barlow Condensed for display and numbers.
- IBM Plex Sans for body text.
- IBM Plex Mono for eyebrows, which are 1.8cqmin, `letter-spacing:.22em`, uppercase, in `--pt` unless noted.

**Match result**
- Eyebrow "A GRADE · ROUND 14 · HOME". The word **WIN** in Barlow 900, 24cqmin, lh .8, `--pt`. Use LOSS / DRAW / TIE from the result.
- Two score bars with a .8cqmin gap:
  - **Home bar**: `--p` background, `--onp` text. Club name in Barlow 800 4.2cqmin (ellipsis); score "6/214" in Barlow 900 6cqmin; overs in Mono 1.6cqmin at 75% opacity.
  - **Opponent bar**: `--panel` background with a 1.2cqmin `--s` left border, all text in `--chalk2`.
  - Padding 1.6cqmin 2.4cqmin. Put the winning side on top, in the `--p` bar.
- Margin line, e.g. "WON BY 26 RUNS": Barlow 700 4.2cqmin.
- Top performers line, e.g. "B. Anderson 87 · B. Allen 4/31": 2cqmin, bold `--chalk`.

**Player milestone**
- Eyebrow "CAREER MILESTONE". The number "1,000" in Barlow 900 at `--msSz`, `--pt`, `letter-spacing:-.01em`.
- A tricolour dash (10×1.6cqmin, 60/15/25% in `--p` / `--chalk` / `--s`) plus the stat label "CLUB RUNS" in Barlow 800 6cqmin.
- Player name on 2 lines: Barlow 900 9cqmin, lh .9.
- Meta line "Cap 242 · A Grade · 48 matches · 3,412 career runs": 2.2cqmin, `--chalk2`.

**Club leaders**
- Title "CLUB / LEADERS", with the second line in `--pt`: Barlow 900 10cqmin, lh .88. Eyebrow in `--chalk2`: "RUNS · 2025/26 · ALL GRADES".
- 5 rows, 6.4cqmin high, 1cqmin gap, `--panel`. Each row has a horizontal bar behind it, `width = value / max`.
  - Rank 1: bar in `--p`, text in `--onp`.
  - Others: bar in `rgba(primary,.22)`, rank in `--pt`, name in `--chalk`.
- Row content: rank (Barlow 900 3.6cqmin), name (Plex Sans 700 2.4cqmin, ellipsis), value (Barlow 900 4cqmin).
- The metric is configurable: runs, wickets, catches.

**Game day**
- Eyebrow "SATURDAY 14 FEB · ROUND 15". Title "GAME / DAY", second line `--pt`, at `--mdSz`, lh .82.
- One row per grade (up to 4–5): a grid of `6cqmin | 1fr | auto` on `--panel`.
  - Grade letter tile: `--p` / `--onp`, Barlow 900 3.4cqmin.
  - "v Opponent": Barlow 800 3.4cqmin; venue below at 1.8cqmin `--chalk2`.
  - Start time: Barlow 800 3.6cqmin `--pt`.

**Team selection**
- Eyebrow "A GRADE · V MANDURAH · RD 15". Title "THE XI", with "XI" in `--pt`, Barlow 900 12cqmin.
- 2-column list, 12 rows (XI + 12th), gap .7/2.4cqmin. Each row is 5cqmin high with a `.15cqmin --line` bottom border.
- Row content: batting order number (Barlow 900 3cqmin `--pt`), name (Plex Sans 600 2.3cqmin), tag "(c)" / "wk" / "12th" (Mono 1.5cqmin `--chalk2`).

**Trading card**: see §3.

**Premiership**
- 3 stars (4cqmin, `--p`, star clip-path polygon), then "PREMIERS" at `--premSz` in `--pt`, lh .8.
- The line "2025/26 FEMALE A GRADE": Barlow 800 6cqmin.
- Grand-final panel: `--panel` with a 1.4cqmin `--p` left bar. It holds:
  - Venue eyebrow in `--chalk2`.
  - Score line "Halls Head 5/176 def Mandurah 142" in Barlow 800 4cqmin.
  - Player of the final at 2cqmin.
- Footer eyebrow "THIRD FLAG IN FIVE SEASONS" in `--pt`, from the premierships count.

**Juniors**: forces the juniors palette (§1).
- Eyebrow "UNDER 13 · ROUND 9 · SATURDAY". Title "JUNIORS / SHINE", second line `--pt`, Barlow 900 14cqmin.
- Up to 3 highlight rows: `--panel` with a 1.2cqmin `--p` left border. Each has the name (**first name + surname initial only**) in Barlow 800 3.8cqmin, a note at 1.8cqmin, and a figure ("52*", "3/9", "RO") in Barlow 900 5cqmin `--pt`.
- Privacy footnote: "First names and initials only · photos with parent consent", 1.8cqmin `--chalk2`.
- Any other kind can be rendered in juniors mode with `junior: true`; the palette swaps and the same privacy rules apply.

## 6. Behaviour & rules
- **Auto-fit:** long club names ellipsize in the header row and the result bar (see the demo club's "COASTAL …" in screenshot 17). Implement a `short`/`abbrev` field on the club (max ~14 chars) for tight slots.
- **No crest:** watermark hidden, monogram disc shown.
- **Result states:** WIN / LOSS / DRAW / TIE / NO RESULT. The club always stays on the top `--p` bar; only the headline word changes.
- **Juniors:** never print full surnames. Photo slot follows consent flags (existing `consent` data on junior players).
- **Export:** render at the format's native pixel size. Because everything uses container units, the same component serves the 1080px export, the Studio canvas and 78px page thumbnails.
- **Studio editor integration:** each element above maps to a named layer so users can edit it in the Studio: "Photo", "Trim", "Crest", "Kind chip", "Headline", "Score bar (home/away)", "Sponsor strip" (keeps `sponsorLock`), "Hashtag".

## 7. Design tokens (fixed, not brand-driven)
- **Fonts:** Barlow Condensed 600–900, IBM Plex Sans 400/600/700, IBM Plex Mono 500/600 (Google Fonts).
- **Radii:** none on the card (square corners are part of the look). Gallery thumbnails use a 10px radius only for presentation.
- **Shadows:** trading card only, `0 3cqmin 6cqmin -2cqmin rgba(0,0,0,.6)`.
- **Spacing (cqmin):** card padding 6; section gap 3; row gaps .7–1; bar padding 1.3–1.8 × 2–2.4.

## Assets
- `assets/hhcc-logo.png`: Halls Head crest (sample tenant crest).
- `assets/action-{sweep,drive,highfive,handshake,stumps}-sm.jpg`, `assets/female-premiership-sm.jpg`: club photos, used as sample media-library images.
- No icons. The stars are CSS clip-paths.

## Screenshots (`screenshots/`)
Captured from the gallery (`Club Pack.dc.html`) at about 910px wide.
- `00`: gallery header and brand token swatches.
- `01–16`: each kind in square + portrait, then story + landscape.
- `17`: brand switching, a red/navy demo club with no crest (monogram fallback).
- `18`: the juniors palette on a result card, and a custom blue/purple primary on leaders.

## Files
- `Club Pack Card.dc.html`: **the reference implementation** of one card. Props:
  - `brand` (`hhcc|demo`)
  - optional `primary`, `secondary`, `juniors` hex overrides
  - `kind`, `format`, `junior` (boolean)

  The logic block contains the token derivation, the contrast helpers, the trim geometry and the sample data.
- `Club Pack.dc.html`: gallery of all 32 cards, with token swatches. Prop: `brand`.
- `support.js`: prototype runtime only (not for production).
