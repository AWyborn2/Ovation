---
name: wouter nested catch-all routing
description: wouter v3 path param catch-all (:rest*) only matches a single segment; use bare * for multi-segment nested routes.
---

# wouter v3 nested catch-all only matches one segment

In wouter v3.10, an outer route like `<Route path="/admin/:rest*" component={AdminRoutes} />`
matches single-segment children (`/admin/users`, `/admin/social`) but NOT multi-segment
paths (`/admin/social/queue`, `/admin/social/create`) — those silently fall through to the
next route (e.g. the public catch-all → 404).

**Fix:** use the bare wildcard instead — `<Route path="/admin/*" component={AdminRoutes} />`.
Keep a separate `<Route path="/admin" .../>` for the bare prefix since `*` needs the trailing slash.

**Why:** `:name*` is parsed as a named param that does not cross `/`, so it captures at most
one segment. The bare `*` wildcard matches the remainder of the path including slashes.

**How to apply:** when adding any 2nd-level admin route in `artifacts/cricket-club/src/App.tsx`,
the parent catch-all must be `/admin/*`. Symptom of regression: a nested admin URL renders the
public "GIVEN OUT!" 404 instead of the AdminShell login gate. A single-segment admin route
showing the login gate while a 2-segment sibling 404s is the tell.
