# Juniors section + brand-new-club empty-state audit — findings

**Tested:** Seniors/Juniors toggle + all `/juniors/*` routes on mandurah and halls-head (desktop 1280x720 with video, mobile 375x812), including nonexistent detail routes; juniors isolation (senior-name grep of every junior page + full API-request capture); halls-head empty-club walk of `/`, `/players`, `/matches`, `/records`, `/honour-boards`, `/premierships`, `/compare` (picker opened), `/grades`. Console errors, page errors, failed requests, broken images, and unresolved spinners captured on every page. Environment caveat: sandbox proxy blocks fonts.googleapis.com and res.cloudinary.com — noted where relevant.

## Juniors isolation verdict: PASS

- Zero senior-player names (6 known Mandurah seniors probed) rendered on any junior page of either tenant.
- Junior pages call **only** `/api/juniors/*` data endpoints plus tenant-neutral `/api/tenant-brand`, `/api/nav-items`, `/api/tour-content`, `/api/auth/me` — no senior stats endpoint is ever hit.
- Juniors-mode nav and footer quick-links contain only junior routes; the "JUNIOR CRICKET" banner makes mode unambiguous. Junior tables confirmed empty via psql (all 0 rows), and all junior endpoints correctly return `[]`/zeros.

## What works well

- The Seniors/Juniors toggle is genuinely good: persistent header pill, coloured mode banner, nav swap, one-click return (`03/04`, `13/14`).
- Most empty states are designed components (icon + heading + explainer in dashed card); `/juniors/office-bearers` has the best copy ("No junior office bearers have been published yet.") (`08`).
- Server-side auth is correct even where UI is wrong (POST /api/players is `requireAdmin`).
- Honour Boards degrades gracefully on zero data (`35`). First-visit welcome modal (`01`,`11`) sets expectations and advertises the juniors side.

## Issues (ranked)

1. **CRITICAL — `/records` white-screens the entire SPA on an empty club** (desktop + mobile). `/api/records` returns `{"mostGames":null,...}` and `artifacts/cricket-club/src/pages/records.tsx` lines 628–644 read `r.value` on null → `TypeError: Cannot read properties of null (reading 'value')`; no error boundary, so the visitor gets a totally blank page with no nav. A top-nav item on a club's day one. Evidence: `34`, `42`, `empty-state-audit-log.json`, `juniors-hallshead-empty-desktop.webm`.
2. **HIGH — default placeholder logo is a broken image on every page of every new tenant.** `artifacts/cricket-club/public/ovation-logo.svg` is malformed XML — `--` inside comments at lines 6 and 15 — so Chromium refuses to render it despite a 200 response; header AND footer show broken-image alt text on every halls-head page (`12`,`31`,`35`). Related fragility: Mandurah's `tenants.logo_url` hot-links PlayHQ's Cloudinary (`02`,`04`).
3. **HIGH — header overflows the viewport: horizontal scroll on every page on mobile** (~193–199px at 375px; the Seniors/Juniors pill cluster ~356px wide doesn't wrap), and 184px overflow even at 1280px on senior pages. The right third of every mobile screen is dead gutter. Evidence: `22`,`24`,`40`, overflow probe output.
4. **HIGH — premierships boards (senior and junior) are embarrassing when empty:** broken logos at both hero corners, "0 of 0 shown", near-illegible low-contrast empty-state subtext on the dark board, then 350–800px of dead dark canvas. The page a club president checks first. Evidence: `06`, `16`, `36`.
5. **MEDIUM — nonexistent junior match/player detail = infinite spinner.** API 404s correctly but UI shows "Loading match…/Loading player…" forever; stale links never resolve. Evidence: `09`,`10`,`19`,`20`.
6. **MEDIUM — admin actions leak to the anonymous public on `/players`:** primary "Add Player" button + copy "…or add a player to get started" shown logged-out; the dialog can only end in a 401 (UI has no gating — `pages/players.tsx:42-62`; server is safe). Evidence: `32`,`41`.
7. **MEDIUM — white-label leak: "Established 1991" hard-coded** in `honour-boards.tsx:262` for every tenant; Mandurah would show Halls Head's founding year. Evidence: `35`.
8. **LOW — Top Performers season selector renders as a blank, optionless combobox** on empty clubs (home + juniors dashboard) — looks like a rendering failure. Evidence: `04`,`31`,`40`.
9. **LOW — empty-state copy problems:** junior matches/players blame "these filters" when the club simply has no data; senior matches/grades use pipeline jargon ("once per-match imports are committed"); no empty state offers a CTA (e.g. "Club official? Sign in to load your history").
10. **LOW — `/api/auth/me` logs a 401 console error on every anonymous page view** (noise on all captures).

## Empty-state scorecard

| Page | Type | Grade |
|---|---|---|
| `/` home | designed, wall of zeros, blank dropdown | C+ |
| `/players` | designed + misplaced admin CTA | B- |
| `/matches` | designed, jargon copy | B |
| `/records` | **SPA crash, blank page** | **F** |
| `/honour-boards` | designed, graceful (wrong year) | B+ |
| `/premierships` | designed but visually broken | D |
| `/compare` | designed ("No players found.") | B |
| `/grades` | designed, jargon copy | B |
| `/juniors` dashboard | designed, 5 zero tiles, blank dropdown | C+ |
| `/juniors/matches`, `/juniors/players` | designed, filter-blaming copy | B |
| `/juniors/premierships` | designed but visually broken | D |
| `/juniors/office-bearers` | designed, best copy | A- |
| missing junior match/player detail | **infinite spinner** | **F** |

**PM summary:** structurally strong (real EmptyState components nearly everywhere, excellent juniors separation), but a new club's first session currently includes a broken club logo in every header, horizontal scroll on every phone screen, a top-nav page that white-screens the app, and an abandoned-looking premierships board. Issues 1–4 are cheap fixes with outsized first-impression cost — fix before any friendly-club demo.
