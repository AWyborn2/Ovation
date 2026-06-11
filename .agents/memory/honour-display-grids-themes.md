---
name: Honour display grids & themes
description: How the admin TV honour-board display supports season-grid layouts and admin skins/themes; the opt-in rule and the default-grid exception.
---

# Honour display grids & themes

The admin-only Digital Honour Boards Display / kiosk supports a reusable **season-grid** layout (a matrix table) alongside the existing list/composite layouts, plus admin-authored skins/themes and per-board styling.

## Grid is opt-in (with one exception)
- A board renders as a grid ONLY when its `boardConfigs[id].gridColumns` is a non-empty array — server flips `board.layout` to `"grid"` and attaches `board.grid` data. Empty/unset → natural layout.
- **Exception:** the merged `award_winners` board (Season × award) ships as a grid by **default** (no config needed). committee / captains_grid / premierships_grid stay opt-in.
- `bundle.gridCatalog` lists the 4 grid-capable boards (`committee`, `award_winners`, `captains_grid`, `premierships_grid`) each with `options[{key,label}]` for the admin column-picker.

**Why:** committee/captains/premierships have an established list/board look the club expects; only surface the grid when an admin asks. Award winners had no good list form, so grid is its natural default.

## Theming model
- Settings jsonb carries `skins` (admin themes; built-ins are p1–p8, `isBuiltinSkin()`), `colourOverrides` (global bg/board/ink/muted/accent/accentInk), `defaultFont`. `defaultTemplate` is a loose string (built-in id OR a custom skin id).
- Per-board `boardConfigs[id]`: `heading`, `subtitle`, `textSize` (sm/md/lg), `density` (comfortable/compact), `font`, `logo` (crest on/off), `background` (HonourBackground `{kind:none|url|texture,value}`), `gridColumns`.
- Client `theme.ts` builds the `--hb-*` CSS var map; **built-in skins must stay pixel-identical when nothing is customised** (only emit overrides when set).
- Crest is a real `<img>` from `brand.logoUrl` with a monogram-initials fallback.

## Persistence / endpoints
- GET `/api/honour-display` (admin) → bundle: boards (+grid data), gridCatalog, brand, settings.
- PATCH `/api/honour-display-settings` (admin) validates + persists; only defined keys are written (partial patch).
- Background uploads go through the object-storage request-url flow; `useUpload` returns `{uploadFile, isUploading}`, store `/api/storage${objectPath}`.

**How to apply:** any new grid-capable board needs a builder in `honour-display.ts`, a `gridCatalog` entry, and the opt-in `gridCols(...)` wiring. Any new per-board style field must thread through schema jsonb, openapi `BoardDisplayConfig`, the renderer, and the admin `BoardConfigEditor`.
