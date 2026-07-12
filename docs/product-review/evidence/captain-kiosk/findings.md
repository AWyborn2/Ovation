# Captain portal · Honours display / clubroom-TV kiosk · Award voting — findings

Tester area: captain setup (admin), `/captain` portal, `/admin/honours/display`, `/honours-display`, `/tv/:token` kiosk, award-voting flow. Tenant 1 (`halls-head.ovation.test:24624`, empty stats/honours by design). Desktop 1280×720 (+1920×1080 TV stills). All accounts, seeded honours rows, and the kiosk token created during testing were deleted afterwards (verified in DB).

## What was tested

1. **Captain setup** — admin → People → Captains: create (`review-captain`, grades A + B), blank-form validation, duplicate username, edit form. Evidence: `01`–`07-*.png`, `captain-01-setup.webm`.
2. **Captain portal** — fresh context → `/captain`: login gate, wrong password, empty voting board, privilege escalation check against `/admin` and admin APIs, sign-out. Evidence: `10`–`14-*.png`, `captain-02-portal.webm`.
3. **Award-voting flow (empty season)** — captain board empty state; admin Honours → Awards empty state + New-award form (where 3-2-1 voting would be enabled). With no imported scorecards there are no rounds, so the flow ends at well-worded empty states on both sides. Evidence: `12`, `50`, `51`.
4. **Honours display & kiosk (admin)** — `/admin/honours/display`: skin picker, kiosk sequence/timings, sponsor advertising, per-board tuning, composites, custom grids; kiosk token generate → custom code (`review-tv`) → invalid code → revoke. Evidence: `20`–`25-*.png`, `captain-03-kiosk-admin.webm`.
5. **Admin-only display preview** — `/honours-display` with no data (`26`) and with seeded data (`27`).
6. **Token kiosk, fresh cookie-less contexts** — valid token with empty data (`30`,`31`, `captain-04a-kiosk-empty.webm`); wrong token on both URL forms (`32`,`33`, `captain-04b-kiosk-wrong-token.webm`); rotation with seeded data (3 premierships + 3 life members) at 1280×720 (`40`–`42`, `captain-05-kiosk-rotation.webm`) and 1920×1080 TV stills (`43`,`44`).
7. Console errors / failed requests / broken images logged on every page (`captain-0*.log`).

## What works well

- **Captain auth boundary is solid.** With a captain session: `/api/captains`, `/api/admins`, `/api/honour-display` all return 401; `/admin` shows the sign-in gate (`13`). Captain session survives navigation; sign-out works.
- **Captains CRUD is simple and forgiving.** Create disabled until valid; duplicate username → friendly "That username is already taken." (409 handled); edit form pre-fills with "Leave blank to keep the current password" (`06`,`07`).
- **Empty-state copy on the voting board is genuinely helpful** — "Once an admin opens an award for one of your grades and a match scorecard is imported, the rounds will appear here." (`12`). The admin Awards tab mirrors it (`50`).
- **Kiosk token UX is well designed.** Short `/tv/<code>` link, copy button, regenerate, revoke, custom code with server-side validation (403 on bad token; `kioskToken` omitted from the public feed; legacy `?token=` form still works).
- **Rotation works** with sensible default timings (3.5 s dwell / 3 s hold), row reveal animation, 10-minute feed refresh guard. The p1 "Heritage Timber" skin is handsome (`40`–`44`), and the admin settings page offers unusual depth (skins, per-board overrides, composite boards, custom grids, sponsor strip/slides/ads).

## Issues (by severity)

### High

1. **Wrong/revoked kiosk token fails silently — permanent "Preparing honour boards…" black screen.** The feed 403s (3 react-query retries, then gives up) and the UI never leaves the loading state; no error, no hint, no retry loop. A volunteer typing the code into a TV cannot tell a typo from a working-but-empty kiosk. Repro: `/tv/definitely-wrong-token` and `/honours-display/kiosk?token=also-wrong`. Evidence: `32`, `33`, `captain-04b-kiosk-wrong-token.webm`, log shows 3× HTTP-403.
2. **Valid token + no honours data = the exact same dead screen.** `boards: []` → zero frames → eternal "Preparing honour boards…" (still there after 14 s and indefinitely). A new club that generates a TV link before curating honours gets a black TV with no guidance — indistinguishable from failure mode #1. Evidence: `30`, `31`, `captain-04a-kiosk-empty.webm`. The admin `/honours-display` preview with no data is nearly as bad: hero + "Launch kiosk" button above a totally blank page, no "add premierships/life members to populate this" pointer (`26`).
3. **The club crest is a broken image on every page and every kiosk board.** The placeholder logo `/ovation-logo.svg` is malformed XML — `--` inside XML comments (illegal) at `artifacts/cricket-club/public/ovation-logo.svg` line 6 (and the `dist/public` copy). Browsers reject the SVG (served 200 but `naturalWidth 0`), so header/footer show alt text, and on the kiosk the stacked alt text "Halls Head Cricket Club" bleeds over the board title on a premium TV surface (`40`–`44`, `27`). One-file asset fix; severity high because it defaces the flagship visual product everywhere.

### Medium

4. **Kiosk doesn't use the TV.** Boards are top-aligned in a narrow band; at 1920×1080 the bottom ~60 % of the screen is empty black (`43`, `44`). Small boards (3 rows) are never vertically centred or scaled up. On a wall-mounted TV this reads as unfinished, not premium.
5. **Site-wide horizontal overflow at 1280 px.** `document.scrollWidth` = 1470 on `/captain` (1557 on admin full-page shots) vs 1280 viewport — the SENIORS/JUNIORS/theme/HELP header cluster overflows, producing a horizontal scrollbar and cut-off pills on every chrome page (`02`, `06`, `12`, `13`). (Cross-cutting; also visible in other testers' areas.)
6. **Captain grade list is hard-coded.** The 10 checkbox grades (A–F, Female A/B, PPL, Colts) are a constant in `artifacts/cricket-club/src/pages/admin-captains.tsx`, not derived from the club's actual grades. Any club whose grades differ (i.e. most white-label tenants) assigns captains to grades that don't exist for them, and voting boards key on these strings. Direct white-label debt.

### Low

7. **Raw HTTP prefix leaks into admin error copy.** Invalid custom kiosk code shows "HTTP 400 Bad Request: Custom kiosk code must be 3–40 characters…" (`25`). The constraint copy is good; the prefix isn't.
8. **Stale error banner.** "That username is already taken." persists on the Captains tab after the create form is closed and an unrelated Edit form is opened (`07`).
9. **Kiosk loading text isn't centred** — "Preparing honour boards…" hugs the top edge of the black screen (flex container has no height) (`30`).
10. **Console noise:** every page fires a 401 `GET /api/auth/me` before login, including the captain portal (which probes admin auth it can never have); the kiosk retries the 403 feed with console errors each time.
11. **"✕ Exit kiosk (Esc)" button is permanently on screen** in token/TV mode (`40`–`44`) — pointless on a TV with no keyboard, a burn-in/distraction risk, and it navigates nowhere for token kiosks.
12. (Environmental) Google Fonts blocked in the sandbox — `fonts.googleapis.com` fails on every load; harmless here, and the kiosk's own font stacks are deliberately web-safe, which is good.

## Kiosk product verdict

**Concept: strong. Execution: not TV-ready yet.** The admin side is genuinely impressive — short typeable `/tv/<code>` links, revocation, skins, per-board transitions, sponsor strip/slides/ad creatives show real product thinking, and the heritage-timber skin with staggered row reveals looks the part. But what actually lands on the TV today undermines it: a broken crest image with alt-text spilling over the title on every single board, content confined to the top third of a 1080p panel with a black void below, an always-visible exit button, and — worst — the two most common real-world states for a new club (typo'd code, no honours entered yet) both produce an identical, silent, permanent black screen. Fix the SVG, centre/scale boards to the panel, and add explicit "invalid code" / "no boards yet — add honours in the admin" screens, and this becomes a compelling, sellable clubroom feature; ship it as-is and the first thing a pilot club's committee sees on their TV is a dead screen.

## Evidence index

- Screenshots `01`–`07`: captain setup · `10`–`14`: captain portal + privilege check · `20`–`27`: honours display settings, token lifecycle, display preview (empty/with data) · `30`–`33`: kiosk empty-data + wrong-token failure modes · `40`–`44`: kiosk rotation with data (1280×720 + 1920×1080) · `50`–`51`: admin awards empty state / new-award form
- Videos: `captain-01-setup.webm`, `captain-02-portal.webm`, `captain-03-kiosk-admin.webm`, `captain-04a-kiosk-empty.webm`, `captain-04b-kiosk-wrong-token.webm`, `captain-05-kiosk-rotation.webm`
- Logs: `captain-0*.log` · Scripts: `evidence/scripts/captain-*.mjs` (`captain-lib.mjs` shared helpers)
