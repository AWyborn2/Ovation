---
name: Cricket-club admin consolidated groups
description: The web admin is 6 top-level entries + Hub, four of them tabbed group pages; how tabs/URLs/redirects work.
---

The cricket-club web admin menu is consolidated to **6 top-level entries + Hub** (was ~21 flat entries):
Hub `/admin`, Social Media `/admin/social`, Display & Settings `/admin/settings`, People `/admin/people`,
Honours & Records `/admin/honours`, Import CSV `/admin/import` (standalone), Admin users `/admin/users` (standalone).

The four group pages are shadcn `Tabs` driven by a shared `AdminTabGroup` (in `pages/admin-groups.tsx`):
- Active tab comes from the **URL**, not local state. First tab lives at the group base path (e.g. `/admin/people` → Players);
  every other tab is one segment under it (e.g. `/admin/people/stats`). Each tab is therefore deep-linkable.
- Inactive `TabsContent` stays **unmounted** (Radix default), so each leaf page's queries only fire when its tab opens.
- Leaf admin pages no longer render their own `<h1>` — the group shell owns the title. When adding a NEW admin page,
  add it as a tab in the right group and do NOT add a page `<h1>` (descriptions/buttons stay).

**Old flat `/admin/*` URLs redirect** to their new group+tab via `<Redirect>` routes in `App.tsx` (back-compat for
bookmarks + in-app cross-links). When you rename/move an admin page, keep/extend these redirects.

**Why:** 21 flat side-nav entries were unmanageable. **How to apply:** new admin surface → pick a group, add a tab
(path = base or one segment), keep the drafts-review badge on the Social Media entry. The hub uses `TILES_FALLBACK`
in `pages/admin.tsx` (the `nav_items` `admin_tiles` surface is empty in DB, so the fallback is what renders).

Drift: the old `/admin/people` (non-player people editor) is now the People GROUP; non-player people moved to the
`non-players` tab at `/admin/people/non-players`. An old `/admin/people` bookmark lands on the Players tab.
