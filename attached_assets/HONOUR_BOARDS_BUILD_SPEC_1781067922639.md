# Honour Boards Feature — Build Spec (for Replit Agent)

**Goal:** Add a "Digital Honour Boards" feature to the cricket club stats app. The club **administrator picks a board template (skin) from a gallery**, the board then renders the club's honours data (premierships, centuries, 5-wicket hauls, life members, club champions, records) in that style. Includes an auto-rotating **kiosk mode** for clubroom TVs.

**Reference implementation:** the accompanying `Honour Board Presets — Previews.html` file is a working, self-contained demo of every template and the kiosk loop. Treat its CSS/JS as the source of truth for the visual design — port it, don't redesign it. Preset CSS blocks are clearly commented (`/* ===== P1 HERITAGE TIMBER ===== */` etc.), and the kiosk logic is the last `<script>` block.

---

## 1. Core concepts

### 1.1 One data model, many skins
A **board** is a category of honours with entries. A **template (skin)** is purely presentational. Any board can render in any template. Do not couple data to styling.

```ts
type BoardCategory =
  | 'premierships' | 'centuries' | 'five_wicket_hauls' | 'life_members'
  | 'club_champions' | 'captains' | 'club_records' | 'awards';

interface HonourBoard {
  id: string;
  category: BoardCategory;
  title: string;            // e.g. "First Grade Premiers"
  subtitle?: string;        // e.g. club name
  entries: BoardEntry[];
}

interface BoardEntry {
  season: string;           // "2024/25"
  primaryText: string;      // name / captain
  detail?: string;          // "147* v Mandurah", "def. Pinjarra", "642 pts"
  meta?: { venue?: string; date?: string; motm?: string; captain?: string;
           grade?: string; competition?: string };
  playerId?: string;        // link to player profile when known
  matchId?: string;         // link to match/scorecard when known
}
```

Data comes from the existing DB tables: `premierships`, `centuries`, `five_wicket_hauls`, `life_members`, `season_aggregate_winners`, `honour_board`, `club_records`, `awards`, joined to `players` via player id for profile links (and `premiership_players` / `match_rosters` for premiership squads).

### 1.2 Tenant theme layer
All templates consume CSS variables — never hardcode club colours inside a template:

```css
:root {
  --club-primary:   #0b3d2e;  /* admin-configurable */
  --club-secondary: #c9a227;  /* accent / "gold"     */
  --club-accent:    #1a6b50;
}
```

Club crest (image URL) and club name are injected as props. The HTML demo uses a 2-letter monogram as crest fallback — keep that fallback.

### 1.3 Admin template picker
- Admin settings page: **"Honour Boards → Template"** showing a card gallery of the 7 templates below, each with a live thumbnail preview (render the actual component scaled down in an iframe or with `transform: scale()` — not screenshots) and a one-line description.
- Selecting a template applies it club-wide to all public honour board pages. Store as `club_settings.honour_board_template` (enum `p1..p7`).
- Optional per-board override: a board can pin a different template (e.g. Premierships uses P7 while everything else uses P1). Store as nullable `boards.template_override`.
- Admin also configures: kiosk rotation (which boards, order, dwell seconds), and whether the public page shows the category tabs.

---

## 2. The 7 templates

Port each from the HTML file's CSS. Class names below match the demo.

| ID | Name | Look | Best for | Key CSS cues (from demo) |
|----|------|------|----------|--------------------------|
| `p1` | **Heritage Timber** | Gold-leaf serif caps on dark timber grain, double gold pinstripe border, crest centred | Traditional clubs; premierships, captains | `repeating-linear-gradient` wood grain, `border:3px double #c9a227`, fonts **Cinzel** (headers) + **EB Garamond** (ledger), `YEAR | NAME | detail` table rows, alternate-row darkening |
| `p2` | **Club Colours** | Painted-board: flat `--club-primary` field, gold roman lettering, single pinstripe frame | Cheap "feels like ours" per club | Same ledger as P1; colours entirely from theme vars |
| `p3` | **Glass / Etched** | Frosted translucent panel, etched white lettering, chrome stand-off corner dots | Newer clubs, indoor centres | `rgba(255,255,255,.07)` panel + `backdrop-filter:blur(4px)`, corner dots via pseudo-elements, wide letter-spacing |
| `p4` | **Modern Minimal** | Light flat UI, white cards, Montserrat, accent-coloured category labels | In-app default; mobile rendering of all others | Card grid `repeat(2,1fr)`, rows `season / name / detail`, season chips |
| `p5` | **Broadcast** | Dark TV-graphics: condensed Oswald type, oversized stat callouts, gold edge-glow, scrolling ticker | Clubroom screens, season-in-review | `.stat` blocks with `border-left:4px solid var(--club-secondary)`, marquee ticker (`@keyframes tickmove`) |
| `p6` | **Interactive Hall of Fame** | Dark card grid with photos/initials, search + filter chips, tap → player profile, QR code | Flagship engagement mode | `.pc` cards with gradient photo block, hover lift, filter chips |
| `p7` | **App Style — Premierships** | Navy sports-card grid (matches app's player-card design language): accent top bar, grade badge like a jersey number, captain + player-of-the-final, venue/date footer, grade filter chips, flag counter | Premierships specifically; any match-anchored honour | `.flag` cards `linear-gradient(160deg,#171c47,#10153a)`, `::before` accent bar, `::after` diagonal stripe texture, working filter logic in demo JS |

**Layout notes that apply to all templates:**
- Ledger templates (P1–P3): cap ~80 rows per rendered "board"; auto-paginate long categories into continuation boards ("Centuries 1998–2012", "2013–") like physical boards do.
- P4 is also the **responsive fallback**: below ~720px every template may degrade to P4's stacked layout (the demo includes a basic media query; productionise it).
- Every entry with a `playerId` is clickable → player profile. P7 cards with `matchId` get a "View team" action → premiership squad (via match roster).

---

## 3. Kiosk mode (auto-rotating TV loop)

Port the kiosk logic from the demo's final `<script>` block:

- Route: `/honour-boards/kiosk` (or `?kiosk=1`). Intended use: clubroom TV / Chromecast / mini-PC pointed at the URL, no interaction needed.
- Behaviour (matches demo):
  1. Fullscreen, chrome hidden, cycles through the admin-configured board list on a loop with ~1s cross-fade.
  2. Each board holds (`DWELL`, default 3.5s). If content is taller than the viewport, **credits-style auto-scroll** at `SPEED` (default 36 px/s) with a soft-start ease, hold at bottom (`ENDHOLD`, default 3s), then advance.
  3. Rows/cards stagger-reveal on board entry (`@keyframes rowin`, ~70ms per row, capped at ~2.2s total delay).
  4. Esc / ✕ exits (web); on a dedicated TV there is nothing to exit to.
- Make `DWELL`, `SPEED`, `ENDHOLD`, board list and order **admin-configurable** per club; persist in club settings.
- Kiosk must auto-refresh data (poll or re-fetch each full cycle) so a premiership added after a grand final appears without touching the TV.

---

## 4. Suggested implementation shape (app is React + Express/Drizzle)

```
/components/honour-boards/
  BoardRenderer.tsx        // switch on template id → template component
  templates/
    HeritageTimber.tsx     // p1
    ClubColours.tsx        // p2
    GlassEtched.tsx        // p3
    ModernMinimal.tsx      // p4
    Broadcast.tsx          // p5
    HallOfFame.tsx         // p6
    AppStyleFlags.tsx      // p7
  KioskLoop.tsx            // rotation engine (port demo JS to React: refs + rAF)
  TemplatePicker.tsx       // admin gallery with live scaled previews
```

- Each template component takes `{ board: HonourBoard, theme: ClubTheme }` and nothing else.
- API: `GET /api/clubs/:id/honour-boards` returns all boards with entries (server assembles from DB tables); `GET .../honour-boards/:category`; `PUT /api/clubs/:id/settings/honour-board` for template/kiosk config (admin-auth).
- Fonts: load Cinzel, EB Garamond, Montserrat, Oswald (Google Fonts) — only Montserrat is global; the rest can be lazy-loaded with the template that needs them.
- New entries flow in automatically from the PlayHQ ingest pipeline. Add a `pending_approval` flag on auto-detected entries so an admin confirms before a name appears on a board.

---

## 5. Acceptance criteria

1. Admin can open a template gallery, see live previews of all 7 templates rendered with the club's real data and colours, and select one; the public honour board page updates immediately.
2. Per-board template override works (e.g. P7 for premierships, P1 for everything else).
3. All templates render every board category from the single `HonourBoard` data shape — no template contains data-fetching or category-specific logic except P7's grade-filter chips.
4. Changing club primary/secondary colours re-skins P2/P4/P5/P6/P7 with no code changes.
5. Kiosk URL runs unattended: rotates, auto-scrolls long boards, stagger-reveals rows, recovers from data refresh, never shows scrollbars or browser chrome.
6. Entries link to player profiles where a player id exists; P7 premiership cards link to the GF match/squad where a match id exists.
7. Long ledgers paginate at ~80 rows per board face.
8. Mobile (<720px) renders legibly (P4-style stacking acceptable for all templates).

---

## 6. Sample data in the demo file

- P1–P6 sections use **illustrative sample data** (placeholder names) — replace with real queries.
- **P7 contains the club's real premierships data** (54 flags, 1991/92–2025/26) embedded as the `PREMS` JSON array — useful as a fixture for development and for verifying the grade-filter groupings: A, B, C, D, E, F, PPL/T20, Female (`Female A`/`Female B`), Colts (`U21 Colts`). Note `pg` (parent grade) is the filter key, `g` is the display grade (e.g. `Mid-Year T20 D` → parent `D`).
