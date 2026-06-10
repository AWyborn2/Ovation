# Digital Honour Board Presets — Research & Recommendations

**Date:** 10 June 2026 · **For:** HHCC app / White-Label Cricket Stats Platform
**Companion file:** `Honour Board Presets — Previews.html` (live renders of each preset with sample HHCC data)

---

## 1. Market scan — how digital honour boards are done today

### honourboards.com.au (Wilsons Sign Solutions, WA) — your starting point
A 100-year-old traditional signwriter that moved digital. Their model is instructive for what clubs currently *buy*:

- **Hardware:** Intel mini PC plugged into the club's own TV via HDMI, CMS pre-installed, connects over club wi-fi.
- **Content model:** *managed service* — their designers build the slides, club emails updates, changes pushed via cloud same-day, included in an annual subscription.
- **UX:** rotating slide sequence on the TV; optional dedicated tablet nearby so users can pick which board/sequence to view.
- **Quoting dimensions:** number of "honour board slides" (1–5 / 6–10 / 11–20 / 20+) and number of screens.
- They still sell traditional timber boards alongside — the digital product visually mimics the traditional ones.

**Takeaway for the app:** their entire paid service (designer builds slides, pushes updates) is what your app automates — presets + live PlayHQ data replaces the designer and the update fee. The slide-sequence-on-a-TV and optional tablet controller are the two display modes clubs already understand.

### Solid Display Systems (solid.com.au, VIC)
Scoreboard company (notably with **PlayHQ scoreboard integration** — relevant adjacency) selling honour board software:

- Software + mini PC package ~**$1,900 AUD**; Life Member board add-on $275; annual update of a board $120; spreadsheet creation from $85.
- Sells **"gold-converted" club logos** ($65+ each) — i.e. recolouring a club crest to gold-leaf style to sit on the traditional-look board. Confirms the dominant aesthetic demand is *digital that looks traditional*.
- Data intake is an **Excel spreadsheet** of names/years — your structured DB is a generational leap over this.

### Creative Honour Boards (UK)
The most mature software offering found:

- Interactive touchscreen **or** "Honours in a Box" (plug-and-play box for the club's own TV).
- Cloud-hosted DB, admin panel (desktop/tablet/mobile), instant updates, **search functionality**, fully responsive, demo at boards.creativehonourboards.co.uk/Merryford-Golf-Club.
- Pre-set templates of common board layouts, tweakable (fonts, colours, logos), populated by **Excel import**.
- Product ladder mirrors physical styles: Traditional (oak moulding, veneered MDF), Budget, **Glass-effect acrylic** — these physical tiers are exactly the preset skins a digital product should offer.
- Traditional lettering guide: ~12.5mm cap height Lato fits **80–90 entries on a 600×1200mm board** — a useful density benchmark for slide layouts.

### US interactive systems (Rocket Alumni, Touch Recordboard, Digital Record Board, Hall of Fame Wall)
The "modern" end of the spectrum:

- Touchscreen wall of fame: searchable, filter by sport/season, **tap a name → full player profile** (photo, career stats, narrative, video from YouTube/Hudl, social embeds).
- No space limits — every record holder ever, not just what fits on timber.
- **QR code on screen** opens the same board on a visitor's phone.
- Record-comparison features (current vs historical).

**Takeaway:** the interactive tier is where your app is unbeatable — you already hold full careers, milestones, and PlayHQ-linked player IDs, so "tap name → profile" is a query, not a content project.

---

## 2. Traditional honour board conventions (what the skins must reproduce)

From signwriting trade sources (Throwers, Signet, Cheshire Brush, Premier Awards, Legacy Signs, Corporate Awards AU):

- **Materials:** stained timber — mahogany, red cedar, jarrah (WA), oak mouldings; gloss/semi-gloss lacquer. Modern tiers: veneered MDF, frosted/green-edge acrylic with chrome standoffs.
- **Lettering:** 22–24ct gold leaf traditionally; vinyl for cheaper updates. Colour is *gold on dark* almost universally; silver occasionally for runner-up/secondary boards.
- **Typography:** Roman (serif) capitals or block lettering. Headers larger, often arched or with the club crest centred at top. Names in caps or small caps; consistent cap heights (9–12.5mm physical).
- **Layout:** centred title block (club name, board title, crest), then a two-column **YEAR | NAME** ledger, sometimes Year | Name | Detail (e.g. score). Gold pinstripe rules and a border frame. Multiple boards per wall, one per honour category.
- **Standard cricket club board categories:**
  - Premierships (by grade)
  - Club Champions / Best & Fairest (by grade)
  - Captains, Presidents, Coaches
  - Centuries (name, score, opponent, season)
  - 5-wicket hauls / hat-tricks (figures, opponent, season)
  - Life Members
  - Association representatives / state honours
  - Notable partnerships & club records

---

## 3. Recommended preset library (6 presets, traditional → modern)

All presets share one data model (board = category + entries; entry = season/year, name(s), detail, optional player-link) and one **tenant theme layer** (club primary/secondary colours, crest, font override). Only the skin changes.

### P1 · Heritage Timber *(traditional)*
The pavilion classic. Dark timber-grain background (jarrah/mahogany tone), gold-leaf serif capitals (Cinzel/Trajan class), gold pinstripe double border, crest centred in the header, two-column year/name ledger. Subtle vignette + grain texture sells the effect. Use Solid-style gold-converted crest. **Default for long-established clubs.**

### P2 · Club Colours Painted Board *(traditional)*
The painted-board look: flat field in club primary colour, gold or club-secondary roman lettering, single pinstripe frame. Same ledger layout as P1 but tenant-coloured — the cheapest way to make a traditional skin feel "ours" per tenant.

### P3 · Glass / Etched Acrylic *(transitional)*
Frosted-glass panel effect over a soft club-colour gradient; "etched" white/silver lettering with light letter-spacing, thin hairline rules, chrome-standoff corner dots as a styling nod. Modern serif or light sans. Suits newer clubs and indoor centres.

### P4 · Modern Minimal *(modern — app-native)*
Flat light/dark UI in the app's own design language: **Montserrat**, club accent colour, card per category, generous whitespace, season chips, optional player avatar thumbnails. This is the in-app default and the responsive/mobile view of every other preset.

### P5 · Broadcast / Stadium *(modern)*
TV-graphics style for clubroom screens: dark gradient background, bold condensed type (Oswald/Archivo class), oversized stat callouts (e.g. "147* — A. Smith"), club colour edge-glow, designed for **auto-rotating full-screen slides** with motion (fade/slide between categories). The "match day" skin.

### P6 · Interactive Hall of Fame *(modern — flagship)*
Card-grid of honourees with photos; tap/click → player profile pulling live career stats, milestones and honours from the database; search + filter by grade/era/category; QR code to open on phone. This is the differentiator no slide-based vendor can match — it's powered by the participant-id player links you already have.

### Cross-cutting options (apply to any preset)
- **Display modes:** in-app page · full-screen kiosk rotation (TV/mini-PC, configurable dwell time per board) · touchscreen interactive · QR/mobile.
- **Entry density:** benchmark ~80–90 rows max per traditional slide; auto-paginate ("Centuries 1998–2012", "2013–") like physical board continuations.
- **Auto-population:** new premiership/century/5fa flows straight from PlayHQ ingest into the board with a "pending approval" state for the club admin — this replaces the $120/yr "annual update" line item competitors charge.
- **Gold crest treatment:** offer an automated gold-tone crest filter per tenant (P1/P2).

---

## 4. Positioning notes

- Competitors charge **~$1,900 setup + annual fees** for static slides updated by email. Your marginal cost of an honour board is ~zero because the data already lives in the DB — price it as an app feature/tier, and pitch "your honour board updates itself the night the game is played."
- The market explicitly wants *both* ends: traditional-look digital (gold-on-timber) for heritage clubs, interactive profiles for engagement. Ship P1 + P4 + P6 first; P2/P3/P5 are skin variants.
- Hardware story stays simple: any TV + cheap mini-PC/Chromecast in kiosk mode pointed at the board URL — no proprietary box.

---

## Sources

- [Digital Honour Boards — honourboards.com.au (Wilsons)](https://honourboards.com.au/)
- [Traditional Honour Boards — honourboards.com.au](https://honourboards.com.au/traditional-honour-boards/)
- [Digital Honours Board — Creative Honour Boards (UK)](https://creativehonourboards.co.uk/digital-honours-boards/)
- [Digital Honour Boards — Solid Display Systems (AU)](https://solid.com.au/collections/digital-honour-boards)
- [Why a digital Honour Board — Solid Display Systems](https://solid-display-systems.myshopify.com/pages/why-a-digital-honour-board)
- [Virtual Honor Board — Rocket Alumni Solutions](https://www.rocketalumnisolutions.com/touchscreen/virtual-honor-board)
- [Touch Recordboard](https://touchrecordboard.com/)
- [Digital Record Board](https://digitalrecordboard.com/)
- [Hall of Fame Wall](https://halloffamewall.com/)
- [Dinosign Digital Honours Boards](https://www.dinosign.co.uk/digital-honours-board)
- [Throwers Signs — gold leaf honours boards](https://www.throwersigns.co.uk/sectors/honours-boards/)
- [Signet Signs — honours board lettering](https://signetsigns.co.uk/sign/honours-board-lettering/)
- [Premier Awards — all about honour boards](https://www.premierawards.com.au/all-about-honour-boards)
- [Corporate Awards AU — timber honour boards](https://www.corporateawards.com.au/product-category/honour-boards/timber-honour-boards/)
- [Aria Digital — sporting club signage](https://ariadigital.com.au/industry/sporting-clubs/)
