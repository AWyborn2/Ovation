---
name: Admin-configurable navigation
description: How the cricket-club site's nav (menus, junior cards, admin tiles) is driven by config with a hard-coded fallback.
---

Four `nav_items` surfaces drive the cricket-club web UI: `senior_menu`, `junior_menu`, `junior_quick_links`, `admin_tiles`. Public components fetch via `useNavSurface(surface, fallback)` (`src/lib/use-nav.ts`) and render the fallback list when config is empty/unloaded, so the site is never blank and is visually unchanged until edited.

**Cross-file constraint:** the server icon allow-list `ICON_KEYS` (`routes/nav-items.ts`) and the client `NAV_ICON_MAP` (`src/lib/nav-icons.tsx`) must stay in sync — a key with no client mapping silently renders no icon. Add to BOTH when introducing an icon.

**Why fallbacks are duplicated:** each consumer keeps its own hard-coded fallback array mirroring the seed (`scripts/src/seed-nav-items.ts`). The seed is idempotent per-surface (only seeds a surface with zero rows) so re-running never clobbers admin edits.

**How to apply:** the senior "Admin" entry is auto-appended in `layout.tsx` for signed-in admins and is deliberately NOT a configurable nav_item. Admin reads use `includeHidden=true` (requires admin session server-side); public reads exclude hidden items. Follows the `match_display_settings` app-config / OpenAPI-first conventions.
