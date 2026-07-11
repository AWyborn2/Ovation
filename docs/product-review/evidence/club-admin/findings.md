# Club Admin console — UX tester findings (tenant 1, halls-head)

Reviewed 11 Jul 2026 against `http://halls-head.ovation.test:24624/admin` (login `owner`),
desktop 1280×720, Chromium via Playwright. Scripts: `../scripts/admin-*.mjs` (run from the
scratchpad `pw` folder). Videos: `admin-01…07.webm` here; console/network logs: `log-0*.txt`;
machine-readable tab sweep: `tab-sweep-report.json`. All test data (import, extra admin,
brand change) was reverted — tenant 1 ends the session empty, brand restored, one admin.

## What was tested

1. Login gate logged-out, wrong credentials, correct credentials (`admin-01-login.mjs`).
2. Admin hub tile layout + all 28 tabs across the four consolidated groups, each deep-linked
   directly (`admin-02-tabs.mjs`, screenshots `11`–`47`).
3. Branding: renamed club + switched accent to green, verified via PATCH `/api/tenant-brand`
   200 + fresh GET, checked public home, reverted exactly via API (`admin-03-branding.mjs`).
4. Eight legacy flat URLs → new group+tab redirects (`admin-04-redirects.mjs`, `60`–`67`).
5. Live CSV import of `A_Grade_2025.26_season_stats_1780356874929.csv` end-to-end: preview,
   confirm, verify in admin stats + public directory + cap register + social queue, then
   delete the import and verify full rollback (`admin-05-import.mjs`, `admin-07-import-cleanup.mjs`).
6. `/admin/users`: create second admin (201), verify it can log in (200), delete (204);
   also probed admin self-deletion via API (`admin-06-users-logout.mjs`).
7. Sign out → admin pages gated again, `/api/auth/me` 401.
8. Console errors / failed requests captured on every page; entitlement gating inspected.

## What works well

- **Every one of the 28 tabs renders with zero JS errors and a designed empty state**
  ("No players found — Add a player to get started", "No premierships yet…", etc.). No blank
  panels, no crashes, no dead tab anywhere (`tab-sweep-report.json`: 28/28, `hasErrorText` false).
- **Deep-linking is real**: every tab is its own URL and loads directly with the right tab
  active; all 8 legacy flat URLs (`/admin/premierships`, `/admin/awards`, `/admin/players`,
  `/admin/stats`, `/admin/life-members`, `/admin/trading-cards`, `/admin/match-display`,
  `/admin/junior-committee`) redirect to the correct group+tab with the tab activated (`60`–`67`).
- **The CSV import pipeline is the best flow in the product** (`70`–`79`): clear
  preview-before-commit ("Nothing is applied until you Confirm"), rows/matched/suggested/new
  summary tiles, per-player resolution ("will create new player" / link-to-existing combobox),
  cap-eligibility notice with Debut badges, totals-to-apply table, backfill checkbox, past-imports
  ledger, and a red "Undo a season's matches" panel. Commit: 20 rows applied, stats visible in
  admin and the public Player Directory immediately, **cap register auto-synced 20 caps with
  player links** (`76`). Deleting the import rolled back everything — players 0, caps 0 —
  a genuinely reversible import. Volunteer-proof design.
- **Branding saves repaint the whole app instantly** (`51`/`52`): name + accent applied to
  header, footer, sidebar, buttons, banner without reload. PATCH returned the updated brand;
  fresh GET confirmed persistence. Accent constrained to 5 vetted tokens = clubs can't pick
  unreadable colours. Sensible copy ("used for buttons, highlights, and every number that
  matters"). Public site cache (5 min) is the only delay, as designed.
- **Admin users flow is solid**: create 201 and the new login works immediately; delete 204;
  last-admin deletion is blocked server-side ("Cannot delete the last remaining admin",
  `api-server/src/routes/admins.ts:131`); a deleted admin's session dies instantly
  (`/api/auth/me` → 401 right after self-delete).
- Wrong password gets a clear inline "Incorrect username or password." under the button (`03`).
- Sign-out fully re-gates the console (`85`/`86`), API confirms 401.
- The "Finish setting up your club" branding nudge on the hub (`04`) is exactly the right
  onboarding prompt for a fresh tenant.

## Issues (by severity)

### High

1. **Horizontal overflow on every page at 1280px — the site scrolls sideways on a standard
   laptop.** The desktop header nav (`div.hidden.md:flex`, measured 1237px wide after the logo)
   pushes document width to 1470–1557px at a 1280 viewport; the SENIORS/JUNIORS toggle, theme
   and HELP buttons hang off-screen (`04`, right edge; probe: `admin-probe-overflow.mjs`,
   scrollWidth 1470 vs clientWidth 1280). Affects public + admin alike. The nav simply has too
   many top-level items to fit; it needs a responsive collapse well above the current `md`
   breakpoint.

2. **The public-site "Welcome to the club portal" tour modal pops over the admin sign-in gate
   and blocks the form** (`02`). An admin heading to `/admin` in a fresh browser must first
   dismiss a visitor-onboarding dialog about browsing stats before they can type a password.
   Automation also trips on it (our first run failed on the intercepted click). The tour should
   be suppressed on `/admin*` routes.

### Medium

3. **The tenant logo renders as alt text everywhere — header, footer, sign-in — on the flagship
   demo tenant** (`02`, `04`, all screenshots). Cause: `/ovation-logo.svg` (HTTP 200) has a
   `viewBox` but **no `width`/`height` attributes**, so Chromium reports `naturalWidth: 0` and
   draws the broken-image alt text "Halls Head Cricket Club" (probe in `admin-03-branding.mjs`).
   One-line SVG fix, big first-impression payoff — right now the default brand looks broken.

4. **Admin gate has no loading state** — first paint is a solid blank pale-blue screen
   (`01-login-gate-loading.png`), then the full page appears. No skeleton or spinner during the
   SPA boot; on a slow club Wi-Fi this reads as "site is down".

5. **Hub tile grid duplicates the group IA and dumps ~17 tiles in no clear order** (`05`):
   "Admin users" appears twice (sidebar and first tile), import appears twice, and tiles are
   flat (Stats next to Social cards next to Cap register) while the sidebar/groups are already
   the taxonomy. For a volunteer, two competing menus to the same 28 destinations is noise —
   either group the tiles under the four headings or drop the grid.

6. **Raw float formatting in the admin Stats table** (`74`): "16.88889", "6.8333335",
   "33.466667", "52.666668" — averages should be 2 dp everywhere (public pages format them;
   admin does not).

### Low

7. **Entitlement-locked tabs vanish silently with no upsell.** `admin-groups.tsx:64` filters
   tabs the plan lacks and deep-links fall back to the first visible tab. Tenant 1 has every
   feature so all 28 tabs showed; but on a lower plan the whole Social group (all 7 tabs
   `feature: socialStudio`) would disappear without a trace or an "upgrade to get this" hook —
   a missed revenue surface and a support-ticket generator ("where did my cards go?").
8. **Import page's "Undo a season" defaults to 2026/27** while the import just committed was
   2025/26 (`73`) — an easy off-by-one for a hurried volunteer to undo the wrong season
   (mitigated by the rebuild-from-what's-left semantics).
9. **Import preview player list is a cramped inner scroll region** showing ~5 of 20 players
   (`72`); reviewing all resolutions means scrolling a small box inside a long page.
10. **Google Fonts hard dependency**: every page requests fonts.googleapis.com (two different
    stylesheets; the social studio pulls a second serif/mono set). Offline/blocked networks get
    fallback fonts and a console error on every navigation (all `log-*.txt`). Consider
    self-hosting.
11. **Console noise when logged out**: each gated visit fires `/api/auth/me` 401 + a red console
    error. Expected behaviour, but it pollutes error monitoring; treat 401 from `me` as a
    normal signed-out signal.
12. **Admin self-deletion is allowed** (probed via API: fresh admin deleted its own account,
    204). Session is killed correctly and the last admin is protected, so this is defensible —
    but the confirm dialog doesn't call out "this is you" beyond the list's "(you)" tag.

## Verification table (UI vs API/DB)

| Action | UI evidence | Server truth |
|---|---|---|
| Wrong login | inline error (`03`) | POST /api/auth/login 401 |
| Brand change | live repaint (`52`) | PATCH 200; GET `/api/tenant-brand` name="Halls Head CC (Review Test)", secondary=#3FC98B |
| Brand revert | `54` | GET returns original (#94A3B8, original name) |
| CSV import | preview `72`, success banner `73` | POST preview 200 (20 rows, 20 new); commit 200 status=committed, capsSync created 20 |
| Import visible | stats table `74`, public directory `75`, caps `76` | — |
| Import delete | `79` | DELETE 204; `/api/players` total 0; `/api/caps?grade=A Grade` 0 rows |
| Create admin | `82` | POST 201 id=4; login as new admin 200 |
| Delete admin | `84` | DELETE 204; `/api/admins` = owner only |
| Sign out | gate `86` | `/api/auth/me` 401 |

## PM assessment — will a volunteer club secretary cope?

**Mostly yes — this console is unusually humane for a stats product, but the front door
undermines it.** The parts a secretary touches weekly (import a CSV, fix a name, add a
premiership, add an admin) are genuinely well-designed: previews before commits, undo for the
scariest action, empty states that say what to do next, and branding that repaints before your
eyes. The consolidation into four groups with real URLs and working legacy redirects is the
right IA, and the tab labels speak club language ("Cap register", "Life members", "Junior
office bearers"), not database language.

The failures are all first-impression failures, and first impressions are where volunteers give
up: a visitor-tour popup sitting on top of the login form, a broken logo image on the default
brand, a blank screen while the app boots, sideways scrolling on an ordinary laptop, and a hub
that shows two different menus to the same places. None of these are deep; all of them are what
a 60-year-old club secretary sees in their first 90 seconds. Fix the five cosmetic/layout items
(1–5) and this admin is honestly ready for concierge-onboarded clubs. The one structural
decision to make before self-serve: what a downgraded plan looks like — today features
silently vanish (issue 7), which is the worst of both worlds (no upsell, maximum confusion).
