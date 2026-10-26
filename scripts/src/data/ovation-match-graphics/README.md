# Ovation Match Graphics

Post-match social graphics for grassroots cricket (Ovation app, PlayHQ / play.cricket.com.au data). Seven approved **looks** share one data shape and one set of **tenant slots** (team and competition colours, logos). The looks are fixed design; club and competition branding is placeholder and swaps per tenant.

Copied from the Claude Design project *Match Summary Template Suite*. Token notes and component docs paraphrase that project's readme and type descriptions.

## The seven looks

| Component | Look | Family |
|---|---|---|
| `BroadcastSummary` | Angled teal title bar, grey textured panel, circle logos | Barlow Condensed |
| `PanelSummary` | Brushed-chrome frame, glossy team headers, tiled rows | Barlow Semi Condensed |
| `CleanSummary` | Minimal dark glass panel led by the competition logo | Montserrat |
| `ClassicSummary` | White header, angled logo tiles, alternating grey rows, winner stripes | Barlow Condensed |
| `ScoreboardSummary` | Digital: navy LED board, glowing team-outlined boxes | Barlow Semi Condensed italic |
| `GroundScoreboardSummary` | Stadium board with an association panel | Barlow Semi Condensed |
| `T20Summary` | Big-Bash style: winner tile left, glass stripes, black rows | Archivo at 125% width |

### Layer components
Each look is assembled from its own layer components, grouped under the look's name, on a shared `Stage`. The looks render pixel-identical to the originals; the layers let you build variants (drop the result bar, swap a header, reorder innings) without forking a look.

| Look | Layers, top to bottom |
|---|---|
| Broadcast | `BroadcastPanel`, `BroadcastTitleBar`, `BroadcastInningsBar`, `BroadcastPlayerList` (`BroadcastBatterRow`, `BroadcastBowlerRow`), `BroadcastResultBar` |
| Panel | `PanelFrame`, `PanelHeader`, `PanelWell`, `PanelInningsHeader`, `PanelPlayerGrid` (`PanelPlayerRow`), `PanelResultBar` |
| Clean | `CleanHeader`, `CleanInningsBand`, `CleanInningsHeader`, `CleanPlayerList` (`CleanPlayerRow`), `CleanResultBar` |
| Classic | `ClassicStripes`, `ClassicHeader` (`ClassicLogoTile`), `ClassicContextStrip`, `ClassicInningsBar`, `ClassicPlayerRow`, `ClassicResultBar` |
| Digital Scoreboard | `ScoreboardFrame`, `ScoreboardScreen`, `ScoreboardHeader`, `ScoreboardInningsBox` (`ScoreboardLine`), `ScoreboardLogo`, `ScoreboardResult`, `ScoreboardTeamBand` |
| Ground Scoreboard | `GroundScoreboardBoard`, `GroundScoreboardHeader`, `GroundScoreboardInnings` (`GroundScoreboardTeamCell`, `GroundScoreboardScoreCell`, `GroundScoreboardCell`), `GroundScoreboardResult`, `GroundScoreboardAssociation`, `GroundScoreboardLed` |
| T20 | `T20Backdrop`, `T20Header` (`T20LogoTile`), `T20ContextStrip`, `T20InningsBar`, `T20PlayerRow`, `T20ResultBar` |

Layers inherit the look's font and uppercase from the look's root; set them yourself when using a layer alone. Palette helpers `broadcastBarColours()` and `panelPalettes()` give the colours the looks pass to their bars. Previews use a dashed grey LOGO roundel where a club or competition logo goes.

All looks take `match`, `teams`, `competition`, `format` (landscape · square · portrait), `rows`, `showBalls`, `background`, `scale`, `assetBase`. The bundle also exposes `SAMPLE_MATCH`, `SAMPLE_TEAMS`, `SAMPLE_COMPETITION` and the colour helpers (`shade`, `mix`, `isLight`, `readableOn`).

## Looks vs tenant slots

**Fixed per look:** layout, font, sizes, chrome, gradients, textures, neutral colours (`bc-*`, `panel-*`, `clean-*`, `classic-*`, `sb-*`, `gsb-*`, `t20-*`).

**Swappable per team (TeamTokens):** `colour` / `onColour` (identity colour and text on it), `colourOnDark` (readable on dark panels), `dark` / `bright` (dark bar and highlight text), `secondary` / `onSecondary` (header and tile surface), `logo`, `logoOnDark`. The `team-a-*` and `team-b-*` tokens hold the placeholder values (Warnbro Swans, Halls Head).

**Competition:** `name`, `association`, `logo`, `colour` (`competition-colour`), `accent` (`competition-accent`).

Looks derive every shade from these slots with `shade()` lighten/darken ramps. Never hard-code a club hex in a look.

### Rules
- **Winner rule:** `match.winner` drives the result fill (`colour` / `onColour`) or result text (`colourOnDark` on dark looks), the background stripes (Classic, T20) and left placement (T20 tiles). The loser takes the right.
- **Readability:** dark looks use `colourOnDark` and `logoOnDark`; light bars use `onColour`. Text needs 4.5:1. If a club colour fails, set a lighter `colourOnDark` rather than editing the look.
- **Ground Scoreboard:** batter cells in the batting team's `dark`, bowler cells in the bowling team's `dark`, names in `bright`.
- Use `match.result` verbatim. Scores `W/R` (Broadcast, Panel, Clean, Classic, T20) or `W-R` (scoreboards).

## Content fundamentals
- ALL CAPS for every graphic label (`text-transform: uppercase`); scoreboard player rows stay mixed case ("K Standing").
- Terse broadcast copy: "Match Summary", "Overs 49.4", "Halls Head won by 6 wickets". No sentences, emoji or exclamation marks.
- Names: full (Broadcast, Panel, Clean, Classic), initial and surname (scoreboards: "K Standing", "K.Standing"), surname only (T20). Hidden players stay `********`.
- Not out is `*` after runs; balls faced and overs bowled are small secondary numerals.
- Context line: competition and venue ("A Grade: Wyllie Cup · Peelwood Reserve"), separated by `·`, `|`, `—` or a small diamond per look.

## Visual foundations
- **Canvas:** 1080 wide (`canvas-width`); landscape 700, square 1080, portrait 1350. The graphic floats over a full-bleed ground photo; `scale` shrinks it to reveal the photo.
- **Type:** one condensed or expanded sports face per look, never mixed within a graphic. Heavy weights 700–900 for names and scores, 500–600 for meta.
- **Colour:** neutral chrome per look (teal, silver, navy, slate, black) plus two team colours and the competition colour. No decorative gradients beyond broadcast gloss.
- **Surfaces:** glossy bars (top highlight, bottom shade: `linear-gradient(180deg, rgba(255,255,255,.12) 0, rgba(255,255,255,0) 45%, rgba(0,0,0,.14) 100%)`), brushed chrome bevels (Panel), a 4px LED dot matrix (scoreboards), paper grain and angled light planes (Broadcast), glass stripes skewed −14° / −30° (Classic / T20), small `×` sparkle marks (T20).
- **Corners:** square almost everywhere (`radius-none`); Panel frame `radius-panel`; scoreboard frames `radius-board-sm` / `radius-board`.
- **Shadows:** one big drop shadow under the graphic (`shadow-graphic`); logos get `shadow-logo`; no inner card shadows besides bevels.
- **Layout:** two innings stacked; batting left, bowling right; header band → context strip → innings → result. Rows flex to fill the height; 2–3px gutters on tiled looks.
- **Transparency:** Clean panel alpha 0.9; vignettes and dim layers over the photo (`radial-gradient(ellipse at 50% 50%, rgba(0,0,0,.15), rgba(0,0,0,.55))`); stripes 0.1–0.75 alpha.
- **Imagery:** real ground photography, warm dusk or night tones; never illustrated.
- **Motion:** none — these are static exports.

## Iconography
No icon set. Only club and competition logos (PNG, transparent preferred), with a light-text `logoOnDark` version for dark looks. Unicode ornaments only: `×` (T20 sparkle), `·`, `|`, `—`, `*` (not out). No emoji, no SVG icons.

## Fonts
All Google Fonts — Barlow Condensed, Barlow Semi Condensed, Montserrat, Archivo — loaded by `components/bundle.css`. No proprietary files were supplied; send licensed broadcast fonts if Ovation has them.

## Not synced
- **Image files:** the sample logos (`wscc-logo.png`, `wscc-logo-white.png`, `hhcc-logo.png`, `pca-logo.png`), the sample ground photo (`ground-example.jpg`), the PNG exports and the uploaded reference images. Previews here render on black with blank logo slots until the logos and photo are dropped on this page.
- **Specimen pages:** the project's `guidelines/*.html` colour, type, format and rule cards and the `ui_kits/match-summaries` explorer; their values live in the tokens and this book.
- **Gradient effects** (`bar-gloss`, `led-dots`, `vignette`) can't be tokens here; their values are written out above.
