# Club sweep 1 — data-accuracy tester panel (tenants 2–6)

**Scope:** Mandurah (tenant 2), White Knights (3), Shoalwater Bay (4), Secret Harbour (5), Waroona (6) — all central-read tenants. Per club: home, /players, one player detail, /matches, one match detail, /grades → A Grade leaderboard, /premierships, plus a cross-club shared match (275, Waroona v Mandurah) opened from both sides.

**Method:** Playwright (Chromium, 1280×720 desktop, one context per club, video on) — `scripts/sweep1-sweep.mjs`. UI values extracted from the rendered DOM (`sweep1-extract.json`). Ground truth via direct SQL against the `central` schema — `scripts/sweep1-groundtruth.sql` — mirroring the leaderboard semantics in `lib/db/src/central-queries.ts` (innings exclude "did not bat"; not-outs from dismissal_type/dismissal text; games = distinct matches from batting∪roster restricted to players with a batting line). Videos: `<slug>-sweep.webm`. Screenshots: `<slug>-NN-*.png` (first-visit welcome modal dismissed via "Maybe later" before capture).

## Verdict in one line

**The numbers are right; the presentation layer around them has bugs.** Every headline total, leaderboard row, player career figure and scorecard line sampled matched the central DB exactly across all five clubs — but the scorecard view-model misparses central score strings and dismissal text, the placeholder logo is a broken image on four of five clubs, and several Halls Head-specific artefacts leak into other tenants' sites.

## 1. Brand check table

| Check | mandurah | white-knights | shoalwater-bay | secret-harbour | waroona |
|---|---|---|---|---|---|
| document.title | Mandurah Cricket Club ✓ | White Knights Cricket Club ✓ | Shoalwater Bay Cricket Club ✓ | Secret Harbour Cricket Club ✓ | Waroona Cricket Club ✓ |
| Header club name / footer copyright | ✓ | ✓ | ✓ | ✓ | ✓ |
| Header logo renders (naturalWidth>0) | ✗ remote PlayHQ URL blocked in sandbox (env) | ✗ `/ovation-logo.svg` broken (Issue #3) | ✗ same | ✗ same | ✗ same |
| Tenant `primary_colour` (DB) | `#0b3d91` | `#4b4b4b` | `#00707e` | `#b33000` | `#5d3a9b` |
| Rendered `--primary` token | `217 89% 63%` (blue) | `37 100% 61%` (amber) | `217 89% 63%` (blue) | `9 85% 62%` (red) | `247 81% 68%` (purple) |
| Exact colour match? | ✗ by design | ✗ by design (grey→amber!) | ✗ by design (teal→blue, same as Mandurah) | ✗ by design | ✗ by design |
| Favicon | `/favicon.svg` platform default (no tenant favicon_url set) | same | same | same | same |
| meta description / og:title | "Ovation — white-label…" / "Ovation" (generic, not per-tenant) | same | same | same | same |
| "Halls Head"/"HHCC" in rendered HTML | opponent mentions (legit) + Issue #4 items | same | Issue #4 items only | Issue #4 items only | Issue #4 items only |

Colour note: `deriveThemeTokens` (`artifacts/cricket-club/src/lib/theme-tokens.ts`) deliberately snaps the stored hex to the **nearest of five fixed accent tokens** via `resolveAccentToken` (`lib/scorecard/src/brand.ts`). So no tenant ever renders its exact brand colour. Mostly reasonable, but degenerate inputs surprise: **White Knights' grey `#4b4b4b` renders as bright amber**, and Shoalwater Bay's teal lands on the same blue as Mandurah. Worth a PM decision: constrain onboarding colour input to the five tokens instead of silently snapping.

Halls Head grep classification: on /matches and match-detail pages "Halls Head Cricket Club" appears as a **legitimate opponent** (both Mandurah's and White Knights' most recent match was vs Halls Head) and "Halls Head Oval" as a venue — expected. The **illegitimate** occurrences are the two systemic items in Issue #4 (HHCC crest PNG in every grade badge — 6–40 DOM hits per page; HHCC historical note on every A Grade page). No other leakage; /premierships pages had zero hits.

## 2. UI-vs-DB comparison matrices

### 2a. Home headline tiles (vs central.match_rosters/match_batting/match_bowling/matches)

Semantics per `centralClubTotals`: players = distinct roster participants; games = roster rows (appearances, NOT matches); runs = Σ batting runs; wickets = Σ bowling wickets.

| Club | Metric | UI | DB | Verdict |
|---|---|---|---|---|
| mandurah | Players/Games/Runs/Wickets/Grades | 30 / 748 / 18,886 / 412 / 2 | 30 / 748 / 18886 / 412 / 2 | MATCH ×5 |
| white-knights | same | 30 / 693 / 16,154 / 347 / 2 | 30 / 693 / 16154 / 347 / 2 | MATCH ×5 |
| shoalwater-bay | same | 30 / 682 / 16,191 / 333 / 2 | 30 / 682 / 16191 / 333 / 2 | MATCH ×5 |
| secret-harbour | same | 30 / 682 / 16,380 / 346 / 2 | 30 / 682 / 16380 / 346 / 2 | MATCH ×5 |
| waroona | same | 30 / 704 / 17,026 / 404 / 2 | 30 / 704 / 17026 / 404 / 2 | MATCH ×5 |

Labelling nit: the "Games" tile is player **appearances** (Mandurah 748), not matches played (68) — accurate to spec but easy to misread. Bonus: Mandurah's /grades A Grade card (players 15, games 36, innings 329, runs 10,733, wickets 231, catches 108, stumpings 35, run outs 28) — all eight MATCH SQL.

### 2b. A Grade leaderboard top 3 (evidence `<slug>-07*.png`)

Format Mat/Inn/NO/Runs/HS/Avg. All UI = DB.

| Club | Row | UI values | Verdict |
|---|---|---|---|
| mandurah | White, Lucas | 28/25/3/860/109/39.09 (100s 2, 50s 5) | MATCH incl. 100s/50s |
| mandurah | Stewart, Hunter | 28/23/4/634/93/33.37 | MATCH |
| mandurah | James, Mitch | 27/24/5/873/134/45.95 | MATCH |
| white-knights | Martin, Riley | 27/23/3/803/163/40.15 | MATCH |
| white-knights | Martin, Oliver | 27/24/7/763/124/44.88 | MATCH |
| white-knights | Nelson, Mitch | 26/19/4/570/116/38.00 | MATCH |
| shoalwater-bay | Rogers, Kane | 25/16/4/447/115/37.25 | MATCH |
| shoalwater-bay | King, Oliver | 25/16/3/445/95/34.23 | MATCH |
| shoalwater-bay | Gray, Sam | 25/14/2/286/97/23.83 | MATCH |
| secret-harbour | Martin, Brad | 28/22/4/682/99/37.89 | MATCH |
| secret-harbour | Collins, Troy | 28/21/0/658/99/31.33 | MATCH |
| secret-harbour | Watson, Henry | 27/22/8/1009/165/72.07 | MATCH |
| waroona | Nguyen, Josh | 26/18/6/501/158/41.75 | MATCH |
| waroona | Parker, Dylan | 26/18/5/496/**93\***/38.15 | MATCH (not-out star present) |
| waroona | Murphy, Max | 25/18/5/739/141/56.85 | MATCH |

Ordering (games desc, runs desc) matches. **However all bowling columns (Wkts/Runs/Avg/BB/5WI) render "-" for every player on every club** — Issue #5a; DB holds 333–412 wickets per club.

### 2c. Player detail careers (first /players entry per club; GUID via `player_id_map`)

| Club | Player | UI Mat/Inn/NO/Runs/HS/Avg | UI Wkts/RunsC/Avg/BB | Verdict |
|---|---|---|---|---|
| mandurah | Josh Bailey (/players/26) | 27/23/6/831/139/48.88 | 12/575/47.92/2-39 | MATCH ×10 |
| white-knights | Dylan Adams (/players/25) | 23/17/7/366/62\*/36.60 | 7/349/49.86/2-10 | MATCH ×10 (62\* not-out verified in DB) |
| shoalwater-bay | Ethan Bailey (/players/1) | 21/15/3/328/85/27.33 | 16/620/38.75/3-31 | MATCH ×10 |
| secret-harbour | Lachlan Anderson (/players/25) | 16/11/5/328/87/54.67 | 3/516/172.00/2-35 | MATCH ×10 |
| waroona | Henry Anderson (/players/10) | 24/21/5/664/118/41.50 | 10/847/84.70/3-14 | MATCH ×10 |
| waroona | Henry Anderson Ct/St/RO | "-"/"-"/"-", milestone "Dismissals 0" | central.fielding: 6 ct, 1 st, 3 ro | **MISMATCH** (Issue #5b) |

### 2d. Match detail (each club's most recent match; evidence `<slug>-05*.png`)

| Club | Match | Comparison | Verdict |
|---|---|---|---|
| mandurah | 341 (v Halls Head, B, R11) | scores 8/266 & 8/417, venue Lark Hill Sportsplex, date, result text | MATCH |
| mandurah | 341 batting ×3: Scott Wilson 75(100), Josh Wright 3(7), Riley Hill 26(40) | runs/balls/SR | MATCH; dismissal text corrupted (Issue #2) |
| mandurah | 341 bowling ×2: Scott Wilson 9-1-26-2, Riley Hill 8-2-52-3 | O/M/R/W/econ | MATCH |
| white-knights | 336 (v Halls Head, B, R10) | 8/309 & 219; HHCC all-out innings footer renders "**219/0**" | totals MATCH; footer wrong (Issue #1) |
| white-knights | 336 batting ×3: Tom Taylor 59(127), Lucas Williams 28(40), Will Adams 12(25) ("lbw b Archie Martin" → UI "lbw") | | MATCH; LBW bowler dropped (Issue #2) |
| white-knights | 336 bowling ×2: Dean Bell 8-2-29-2, Troy Lewis 9-0-71-2 | | MATCH |
| shoalwater-bay | 342 (v Singleton Irwinians, B, R11) | 9/244 & 4/275; batting ×3 (Tom Parker 8(18), Archie Lewis 9(18), Ben Nguyen 50(107)); bowling ×2 (Hunter Johnson 9-2-50-3, Henry Thompson 9-2-38-3) | MATCH |
| secret-harbour | 343 (v Warnbro Swans, B, R11) | 6/393 & 6/421, "won by 28 runs"; batting ×3 (Mitch Hill 5(9), Brad Lewis 112(152), Troy Morris 158(155)); bowling ×2 (Ben Ward 8-1-66-2, Dylan Green 9-2-146-3) | MATCH |
| waroona | 344 (v Rockingham Hornets, B, R11) | 8/309 & 6/74, "won by 235 runs"; batting ×3 (Max Gray 8(14), Liam Hill 15(19), Cooper Baker 99(114)); bowling ×2 (Max Gray 6-1-19-2, Ben Ward 4-2-11-2) | MATCH |
| all | EXTRAS line | UI "EXTRAS 0 (…W …NB)" on every wickets/runs-format innings | **MISMATCH** (Issue #1) |

Innings order matched `central.match_batting.innings` in every sampled match. Seed-data observation (not an app bug): some generated `result_text` values are internally implausible (match 341 "won by 2 wickets" when the winner batted first and won on runs; a bowler conceding 304 off 7 overs). The UI reproduces the DB faithfully.

## 3. Cross-club consistency (match 275, Waroona v Mandurah, A Grade R9 2025/26)

Opened as `/matches/275` on both sites (evidence `mandurah-09*`, `waroona-09*`). **Verdict: CONSISTENT.** Identical data both sides: "Waroona Cricket Club won by 60 runs", 5/313 and 8/253, all 22 batting lines (incl. same DNB lists), all 9 bowling figures, same innings order — all verified against DB, MATCH. Presentation differences (expected): each site titles the match tenant-first and shows the tenant's score first; theme accent differs (blue vs purple); own-club players hyperlinked, opposition plain, symmetrically. Issues #1 and #2 reproduce identically on both sides — the bug is in the shared view-model, not tenant-specific.

## 4. Issues by severity

### HIGH

**#1 — Scorecard view-model swaps runs and wickets for central score strings; EXTRAS always 0.** `parseScore` (`lib/scorecard/src/mapping.ts:40`) parses `"(\d+)/(\d+)"` as **runs/wickets** (legacy tenant format "187 / 10"), but central scores are **wickets/runs** ("5/313") → internally `totalRuns=5, wickets=313`. The footer score only *looks* right because it re-prints both numbers in input order. Damage: (a) `buildExtras` computes `max(0, 5−292)=0` so **every innings shows "EXTRAS 0" beside its own contradictory "(4W 4NB)" breakdown** and batting lines never reconcile to totals (292 vs 313, 21 runs unexplained); (b) all-out innings stored as bare numbers render "**219/0**" (white-knights match 336); (c) any consumer of `totalRuns`/`wickets` semantics is silently swapped. Every match page, every central tenant. Evidence: `mandurah-09b-crossmatch-full.png`, `white-knights-05-match-detail.png`.

**#2 — Dismissal text corrupted on all central scorecards.** `formatDismissal` (`lib/scorecard/src/dismissal.ts`) expects legacy colon-delimited formats (`"c: X b: Y"`, `"lbw: Y"`); central stores conventional notation. Results: caught → "**c c** Ryan Ward b Lucas Williams"; stumped → "**st st** Henry Wright b Tom Taylor"; LBW → **bowler credit silently dropped** ("lbw b Archie Martin" → "lbw"). Bowled/run-out/not-out correct by coincidence. Evidence: `mandurah-05-match-detail.png` (all three visible).

**#3 — Platform placeholder logo is a broken image on every tenant without a custom logo.** `artifacts/cricket-club/public/ovation-logo.svg` contains `--` inside XML comments (lines 6, 15) — illegal XML. Served 200/`image/svg+xml` but Chromium refuses to decode (`naturalWidth 0`), so header AND footer show the broken-image glyph on White Knights, Shoalwater Bay, Secret Harbour, Waroona and any future signup. Trivial fix; `placeholder-club-logo.svg` in the same folder parses fine. (Mandurah's remote PlayHQ logo failure is sandbox-environmental.) Evidence: `waroona-01-home.png` top-left.

### MEDIUM

**#4 — Halls Head leakage on other tenants (white-label debt).** (a) The A Grade note "Prior to MyCricket and PlayHQ, the club did not record stats for players who played fewer than 10 games…" is HHCC's own history hard-coded for all tenants (`artifacts/cricket-club/src/pages/grade-leaderboard.tsx`, echoed at `player-detail.tsx:460`) — factually wrong on tenants 2–6; evidence `waroona-07-a-grade.png`. (b) Every grade badge platform-wide is built from `HHCC_Icon_Gold_1779853335292.png` (`components/grade-badge.tsx:1`); the HHCC filename ships in the rendered DOM sitewide. (c) `meta description`/`og:title` are generic "Ovation", not tenant-branded (document.title is, so the plumbing exists).

**#5 — Central data present in DB but not surfaced (reads as "no data").** (a) Leaderboard bowling columns permanently "-": `centralGradeLeaderboard` returns bowling fields as null (`lib/db/src/central-queries.ts:533-540`) while player pages DO show bowling — inconsistent. (b) Fielding omitted from player careers: Ct/St/RO "-" and milestone tracker "Dismissals 0" though `central.fielding` has rows (Henry Anderson 6ct/1st/3ro); `catches: null` hard-coded at `central-queries.ts:1110`; meanwhile /grades summary cards DO read central fielding — three surfaces, three behaviours. (c) /premierships shows "No premierships found" on all five clubs though `central.premiers` holds premierships for Mandurah (2023/24 A), Secret Harbour (2024/25 B), Waroona (2025/26 B) — central seeding per the roadmap not implemented. Evidence `<slug>-08-premierships.png`.

### LOW

**#6 — Admin "Edit" affordance shown to anonymous visitors** on the player-detail career table, linking `/stats/:id` ungated (`pages/player-detail.tsx:675,704`); on central tenants the id is the resolved playerId, not a real stat row, so the link is doubly wrong. Evidence `waroona-03-player-detail.png`.

**#7 — Console noise on every public page:** 401 from `GET /api/auth/me` for anonymous visitors; Google Fonts CDN fetch fails in sandbox (typography depends on a third-party CDN — worth noting for a white-label product).

### Environment notes (not product bugs)

Google Fonts and Mandurah's remote logo blocked by the sandbox proxy; generated seed data contains implausible result texts (§2d) which the app mirrors faithfully; the first-visit welcome modal appears on every hard load until dismissed once (dismissal persists — verified).

## What works well

- **Perfect numeric fidelity**: ~200 sampled datapoints all matched SQL, including subtle semantics (DNB exclusion, not-out HS stars, retired handling, games = batting∪roster, avg denominators, leaderboard ordering, innings ordering, grade filtering).
- Tenant stat isolation correct everywhere; shared match renders symmetrically and identically from both clubs.
- Titles, header/footer names, copyright and theme accents all pick up tenant values.

## Evidence index

Screenshots `<slug>-01…08` (+`05b`/`07b`/`09b` full-page, `*-09*-crossmatch-275*`), videos `<slug>-sweep.webm` (5), raw extraction `sweep1-extract.json`, scripts `../scripts/sweep1-sweep.mjs` and `../scripts/sweep1-groundtruth.sql`.
