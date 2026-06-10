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
