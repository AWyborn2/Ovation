---
name: Honour custom grids, per-board skins, wrap fill, kiosk ads & custom token
description: The flexible honour-board grid builder + kiosk advertising/token additions layered on the single-skin display.
---

# Custom grids, per-board skins, wrap fill, kiosk ads, custom token

Extends the honour-display/kiosk (see `honour-display-rework.md`, `honour-display-grids-themes.md`,
`honour-kiosk-flex-scroll.md`). All additive — the single club-wide skin still exists; these layer on top.

## Data model (settings = `honour_display_settings` singleton, jsonb)
- **`customGrids: CustomGridDefJson[]`** — admin-built season-grid boards. `id` = `grid:<uuid>`.
  Each has `title/subtitle/footnote/skin/seasonFrom/seasonTo/fillMode/wrapBlocks` + `columns`.
  A column's `source` ∈ `office|award|grade|premiership|manual`; non-manual carries `sourceKey`
  (office role / award key / grade / prem grade); `manual` carries `manualValues` (season label → text).
- **`kioskAds: KioskAdJson[]`** — full-screen ad creatives (`id` = `ad:<uuid>`, `name`, `imageUrl`).
- **`kioskSponsorIds: number[]`** — subset of active sponsors to show (empty = all).
- **`kioskSponsorSlideStyle: "grid" | "single"`** — all-sponsors grid vs one-large-sponsor-per-slide.
- **`BoardDisplayConfigJson`** gained `skin` (per-board, p1..p9 or `custom:`), `footnote`,
  `transition: "wrap"`, `wrapBlocks` (2..4).
- **`BoardGridEntry`** gained `note` (cell marker, e.g. "Premiers", "*").

## Server (`artifacts/api-server/src/routes/honour-display.ts`)
- `buildCustomGrids()` resolves each column from preloaded clubRoles/awards/premierships (or
  `manualValues`) and `composeCustomGrid()` builds the matrix. `composeCustomGrid` spans an explicit
  season range (`from/to`) → rows newest→oldest with **blank future seasons**; premiership columns
  auto-set `note:"Premiers"`. Custom grids are appended in `assembleBoards` and stamped from the def
  (`skin/footnote/fillMode/wrapBlocks`); other boards take `skin/footnote` from `boardConfigs`.
- `DisplayBoard` output now carries resolved `skin` + `footnote`; `BoardDisplay` carries `wrapBlocks`.
- Kiosk token: `POST /honour-display/kiosk-token` accepts optional `{ token }` custom code
  (`normalizeCustomKioskToken`, 3–40 `[A-Za-z0-9-]`, no leading hyphen). `kioskTokenMatches` is
  case-insensitive for any all-alnum/hyphen code (auto OR custom); legacy base64url stays exact.
- Pure helpers (`composeCustomGrid`, `normalizeCustomKioskToken`, `kioskTokenMatches`) are exported
  and unit-tested in `honour-custom-grid.test.ts` (runs without a DB — needs a dummy `DATABASE_URL`
  only because importing the route pulls in `@workspace/db`).

## Client
- **Per-board skin**: built-in skin CSS selectors were changed from `.hb.skin-pX` to `.skin-pX` so a
  board wrapper can apply a skin (overriding the club-wide root skin). `BoardRenderer` applies
  `skinClass(board.skin)` (built-in) or `boardSkinStyle(board.skin, skins)` inline vars (custom) on
  the wrapper, plus the footnote. **If you add skin structural rules, keep them `.skin-pX ...`.**
- **P9 "Printed Board"** skin = white plaque + filled club-colour grid header row (Hillston style).
- **Grid wrap** (`GridBoard`): `board.display.transition==="wrap"` splits rows into `wrapBlocks`
  side-by-side tables (W.R. Warren two-half style); else single scroll/slide table.
- **Kiosk** (`honours-kiosk.tsx`): `Frame` is now `board | sponsor | ad`. `kioskSequence` may contain
  board ids AND tokens `"sponsor"` / `"ad:<id>"` for **manual placement**; auto every-N sponsor
  insertion still works. Sponsor slides honour `slideStyle` (single → one frame per sponsor) and the
  `kioskSponsorIds` subset. `SponsorSlideSingle` + `AdSlide` are new.
- Admin (`admin-honours-display.tsx`): custom-grid builder, ad-creative manager, sponsor pick +
  slide-style controls, per-board skin/footnote/wrap, custom kiosk code input.

## Deploy note
New jsonb/text columns need `pnpm --filter @workspace/db run push` (no migrations dir; push workflow).
