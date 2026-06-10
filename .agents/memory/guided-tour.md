---
name: Guided tour (driver.js)
description: How the cricket-club web onboarding tour is wired, and the responsive-marker gotcha.
---

Web-only first-time onboarding for `artifacts/cricket-club` (Expo mobile is out of scope).

- Library: `driver.js` (devDependency). Core helper `src/lib/tour.ts` exposes `launchFanTour(navigate, location, content?)`, `launchAdminTour(content?)`, `hasSeenWelcome()`, `markWelcomeSeen()`.
- **Tour copy is admin-editable; structure is not.** Step DOM target/side/align live in `FAN_STEP_DEFS`/`ADMIN_STEP_DEFS` (each has a stable `key`); only title+description (and welcome title/body) are overridable. Singleton `tour_content` table + `/tour-content` GET/PATCH (`routes/tour-content.ts`) store overrides ONLY — blank field falls back to the in-code default (code is the source of truth for structure). Merge happens client-side: launchers pass `useGetTourContent().data` in; admin editor at `/admin/settings/tour` (`admin-tour-content.tsx`) shows defaults as placeholders. Adding/removing a step = code change to the `*_STEP_DEFS` array.
- First-visit welcome: `src/components/welcome-guide.tsx` (`<WelcomeGuide/>` rendered once in `layout.tsx`). Auto-opens when localStorage key `hhcc.welcome.seen.v1` is unset; bump the suffix to re-show to everyone.
- Tours target `[data-tour="..."]` markers (NOT testids): `section-toggle`, `main-nav`, `home-totals`, `quick-links`, `recent-matches`, `top-performers`, `help-button`; admin: `admin-nav`, `admin-nav-/admin/<group>`.
- Header `Help` button (in `layout.tsx`) launches the admin tour when a signed-in admin is on `/admin*`, else the fan tour. Admin hub (`pages/admin.tsx`) also has a "Take the admin tour" button.

**Why the runTour resolver picks the first VISIBLE match (not querySelector):**
The same `data-tour` marker is placed on BOTH a desktop control (hidden on mobile via `hidden md:flex`) and a mobile control (e.g. `main-nav` on the desktop `<nav>` AND the mobile hamburger). `document.querySelector` would return the hidden desktop one on small screens. `runTour` instead does `querySelectorAll(...).find(rect w&h > 0)` and passes the resolved Element to driver.js, so it always highlights what the user can see and silently drops markers absent from the current page (graceful degradation). The fan tour navigates to `/` first so home-page section markers exist.

Brand styling: popoverClass `hhcc-tour`, CSS overrides appended to `src/index.css` (dark slate card + gold headings/buttons matching the theme).
