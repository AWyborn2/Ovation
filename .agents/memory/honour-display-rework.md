---
name: Honour display + kiosk (admin-only, single-skin)
description: How the digital honour-board display/kiosk is structured after the single-skin rework.
---

# Honour display + kiosk

Admin-only digital honour boards (the clubroom-TV surface), separate from the public `/honour-boards`, `/records`, `/premierships` pages.

- **Three render layouts only**, dispatched on `board.layout` (`premiership` | `teamOfDecade` | `list`) in `BoardRenderer.tsx`. Every server board carries `layout`. Adding a new board = pick one of these three layouts server-side; no new frontend layout needed.
- **Single skin model.** The admin picks ONE skin (`p1`..`p7`); it is applied once as a CSS class `.hb.skin-pX` at the `.hb` root. Skins are cosmetic ONLY — they re-define CSS custom properties (`--hb-*`) in `honour-boards.css`; layout markup is shared. There is deliberately NO per-board override, NO viewer skin switcher, NO category tabs (all removed). Brand colours flow in via inline vars `--club-primary/secondary/accent` from `theme.ts` and skins reference them.
- **Recently-achieved milestones** come from the server (reuses the exported `buildMilestones()` in `milestones.ts`). **Approaching milestones** have no route — they are computed client-side and injected as an extra board via `useApproachingBoard.ts` (uses `getApproachingMilestones` + `aggregateCareer` over per-grade leaderboards, gated on the milestone settings `displayMode` being `approaching`/`both`).
- **Admin gating is route-level**, not just nav. `/honours-display` and `/honours-display/kiosk` are wrapped in an `AdminOnly` component in `App.tsx` (uses `useCurrentAdmin`; redirects non-admins to `/admin`). Removing the nav entry alone is NOT enough — the routes themselves must be gated. The entry was also removed from `SENIOR_NAV_FALLBACK` in `layout.tsx`.
- **Settings schema** dropped `boardOverrides` / `showTabs` / `allowViewerTemplateSwitch` (raw-SQL ALTER + drizzle push; openapi + codegen updated). `category` on a board is a free string. Kiosk sequence is a list of board ids; timings are dwell/scrollSpeed/endHold.

**Why single-skin:** the per-board/viewer switching added complexity with no real use; one consistent skin reads better on a TV and keeps each board in its natural layout.

## Per-board display config + composites + kiosk frames (later enhancement)

- **Every board carries a resolved `display` `{columns,transition,fit}`.** The server (`assembleBoards` in `honour-display.ts`) stamps it from `DEFAULT_DISPLAY` merged with `settings.boardConfigs[id]`. `columns` (1–3) only applies to `list` layout; other layouts force 1.
- **The client-only `approaching` board has NO server row**, so it is never in the bundle and never gets stamped. Its display config is plumbed separately: admin saves `boardConfigs['approaching']`, the admin page injects a *synthetic* tunable row for it (it won't appear in `bundle.boards`), and the public display/kiosk merge it via `applyBoardConfig(board, settings.boardConfigs)` in `useApproachingBoard.ts`. **Easy trap:** filtering only `bundle.boards` for the per-board controls silently makes the whole `applyBoardConfig` path dead code — there must be a synthetic admin row.
- **Composite "columns" boards** are admin-defined in `settings.composites` (jsonb). IDs are **client-generated `composite:<uuid>`** (server validates the prefix). `buildComposites` filters refs: drops `approaching`, nested `composite:*`, missing boards, and any non-`list` board; a composite with zero surviving columns is dropped entirely. Composites carry their OWN `transition`/`fit` (not in `boardConfigs`) and render at `columns:1` on the display stamp.
- **`seasonAligned` is a guarded transform**, not a guarantee: applied ONLY when every chosen column has a non-empty `season` on every entry; otherwise it falls back to plain side-by-side columns (so a season-less board like Most Games never collapses to empty). The admin eligibility hint mirrors this guard client-side.
- **Kiosk = single frame index.** `frames = sequence.flatMap(b => b.display.transition === "slide" ? paginate(b, rowsPerPage) : [scrollFrame])`; scroll frames keep the rAF credit-scroll, slide frames dwell+fade. Always index via `index % frames.length` so a frames array that shrinks after a refetch/resize can never overrun. `rowsPerPage` is viewport-derived (nominal row px, recomputed on resize) — a deliberate v1 tradeoff vs full DOM measurement.
- **`boardConfigs` (jsonb default `{}`) + `composites` (jsonb default `[]`)** were added to `honour_display_settings`; jsonb columns need defaults for a clean drizzle push.
