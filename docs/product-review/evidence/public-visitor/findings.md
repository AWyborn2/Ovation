# Public visitor experience — Mandurah CC (tenant 2, central-read) — findings

Reviewer area: anonymous/public visitor UX on a data-rich club site.
Target: `http://mandurah.ovation.test:24624` (tenant 2, `reads_from_central = true`, central club_id 2).
Date: 11 Jul 2026. Browser: Chromium 1194 via Playwright, desktop 1280x720 and mobile 375x812.

## What was tested

Scripts (in `../scripts/`, run from the scratchpad `pw` dir): `public-desktop.mjs`,
`public-mobile.mjs`, `public-followups.mjs`, shared `public-lib.mjs`, plus
`public-probe-overflow-*.mjs` (layout-overflow diagnostics). All record video and
screenshots, and capture console errors, pageerrors, failed requests, non-2xx responses,
broken images (`naturalWidth === 0`), horizontal overflow, header height and small tap
targets. Raw per-page logs: `console-log-desktop.md`, `console-log-mobile.md`,
`console-log-followups.md`. Videos: `desktop-walkthrough.webm`, `mobile-walkthrough.webm`,
`followups.webm`.

Flows covered: home (incl. first-visit welcome guide), players directory (+search, +empty
search), player detail, matches list (+grade/season filters), match detail scorecard, grades
index, A Grade leaderboard (+sort attempt), records, honour boards, premierships, compare
(two players picked), 404 URL, 9-step guided fan tour via the Help button, light/dark toggle,
and the mobile set (home, hamburger nav, players, player detail, matches, match detail).
UI-vs-DB spot checks ran against `postgresql://ovation:ovation@localhost:5432/ovation`
(schema `central`).

Environment caveat: the sandbox blocks external hosts, so Google Fonts and the Cloudinary
club logo fail to load here. Findings about those are limited to *how the product degrades*
when an external asset fails, not the failure itself.

## What works well

- **Compare / Head-to-Head** (27/28): pick-any-two-players with career totals, per-grade
  breakdown and winner-side highlighting. Genuinely good fan feature (but see issue 7).
- **Player detail milestone tracker** (05/06): "169 runs away from the 1,000 Runs Club" is
  exactly the emotional hook this product is selling. Share profile / trading-card actions
  are a nice touch.
- **Guided tour + welcome guide** (01a, 25a–25e): first-visit dialog offering a 9-step
  anchored tour ("A quick lap around the ground"), with sensible copy. Rare polish for this
  product category.
- **Dark mode** (30/31/32): anti-flash script in index.html, consistent tokens, scorecard and
  tables all restyle correctly.
- **Records page** (15/16): clean stat-card grid with grade badges and per-record downloads;
  values verified correct against the DB.
- **Match scorecard depth** (11): full batting/bowling per innings, share button,
  "All matches" breadcrumb.
- **Filters and empty states exist**: matches grade/season selects work (09); players empty
  search has a proper empty state (35); tenant theming (Mandurah blue `#0b3d91`) is applied
  consistently; 404 page is branded and on-voice ("Given Out!", 24).

## Issues (ranked)

### P1 — blockers for a paid public launch

1. **Sitewide horizontal overflow; mobile nav effectively unreachable.** The header control
   cluster (logo h-20 + section toggle + theme pill + help pill + hamburger, single
   non-wrapping row) needs ~568px. At 375px the hamburger, theme and help buttons are
   entirely off-screen — a phone visitor sees only the logo and a clipped SENIORS/JUNIORS
   toggle and has no visible navigation at all (40, 42, 43). Every page scrolls horizontally
   on mobile (scrollWidth 568 vs 375; in Chrome's mobile emulation the layout viewport is
   silently expanded to 568, i.e. real devices render the whole site zoomed out). Desktop is
   also affected: at 1280x720 the page is 1464px wide and the theme + Help buttons live
   off-viewport (01 vs 02-home-full; clicking them in the tour/dark-mode flows forced a
   sideways scroll — 25a, 31). Repro: open any page at 375 or 1280 wide.
   Evidence: 40-mobile-home.png, 42-mobile-nav-open.png, 01-home-top.png,
   console logs ("HORIZONTAL SCROLL" on every page), public-probe-overflow-header.mjs output.

2. **Home "Top Performers" is permanently empty on a central-read tenant.** The section shows
   "No data for this season yet." for 2025/26 while the same page's Recent Matches proves the
   season has data, and `/api/overview` returns top run-scorers. Root cause: `GET
   /api/overview/top-performers` has no central branch — it queries only the local tenant DB
   (`artifacts/api-server/src/routes/grades.ts:532`, contrast with `/records` at :595 which
   does `shouldReadCentral`). So the flagship first-screen module is dead on all tenants 2–11.
   Repro: load home, scroll to Top Performers; `curl /api/overview/top-performers` returns
   empty topRunScorers/topWicketTakers/availableGrades.
   Evidence: 02-home-full.png.

3. **Premierships page shows nothing despite a premiership in the central DB.** "No
   premierships found · 0 of 0 shown", yet `central.premiers` holds Mandurah's A Grade
   2023/24 flag (Grand Final v Rockingham Hornets, confidence=high). `/api/premierships`
   returns `[]` — the central `premiers` seed path isn't wired for tenants. For a product
   whose pitch is "instant full history", an empty honour page on day one is a sale-killer.
   Also: the empty-state helper text under "No premierships found" is dark-on-dark and
   near-illegible (20).
   Evidence: 19/20-premierships*.png; SQL below.

4. **Grade "leaderboard" has six permanently empty columns and no bowling data.** The A Grade
   table renders Wkts/Runs/Avg/BB/5WI/Ct/St/RO for every player as "–" although the club has
   231 A Grade wickets and 302 fielding rows in central (the players directory itself shows
   wicket counts). `lib/db/src/central-queries.ts:39` says the central leaderboard is
   batting-only by design — but the UI still renders the full column set, so the page looks
   broken and there is no way anywhere to see a grade bowling leaderboard. Related: honour
   boards headline tile says "0 TOTAL DISMISSALS" (18) against 302 central fielding rows.
   Evidence: 13/14-grade-leaderboard*.png, 18-honour-boards-full.png; SQL below.

### P2 — major

5. **Admin controls leak into the anonymous UI.** Public visitors see a primary "Add Player"
   button on the directory (03) which opens a working "Add New Player" dialog (33); an
   "Edit" column on every player-detail career row (06, 34); and the players empty state says
   "…or add a player to get started" (35). Writes correctly 401 at the API (verified: POST
   /api/players and PATCH /api/players/26 as anon return 401, no rows created), so this is
   not a security hole, but it reads as unfinished and invites failed actions.

6. **Home headline "748 GAMES" is wrong as any visitor will read it.** The club has played 68
   matches (SQL below); 748 is the number of roster appearances (player-games), per the
   `centralClubTotals` doc comment. The same 748 appears on honour boards as "TOTAL GAMES".
   Whatever the legacy HHCC semantics, a club officer evaluating the product will call this a
   data error on the first screen. Label it ("appearances") or count matches.
   Evidence: 01-home-top.png, 18-honour-boards-full.png, home-innertext.txt.

7. **Compare career batting average ignores not-outs.** Career totals show Cooper Lewis at
   39.43 (= 907/23 innings) while the By Grade table on the same page correctly shows 56.69
   (= 907/(23−7 NO)); Lucas White 34.40 vs correct 39.09. Two different numbers for the same
   stat on one page — cricket people will notice immediately.
   Evidence: 28-compare-two-players-full.png.

8. **The leaderboard isn't ranked by anything meaningful and can't be re-sorted.** Rows come
   back ordered by matches played; the club's top run-scorer (Lewis 907) sits 13th. Column
   headers are not clickable (verified: click on "Runs" changed nothing) and there is no
   sort affordance.
   Evidence: 14-grade-leaderboard-full.png, 36-leaderboard-after-sort-click.png.

9. **White-label leaks on a non-Halls-Head tenant.** (a) Honour boards banner hard-codes
   "Established 1991 • Career milestones…" for every tenant
   (`artifacts/cricket-club/src/pages/honour-boards.tsx:262`) — Mandurah now claims Halls
   Head's founding year. (b) The A Grade page shows the Halls-Head-specific caveat "Prior to
   MyCricket and PlayHQ, the club did not record stats for players who played fewer than 10
   games… Capped players…" — meaningless and false for Mandurah.
   Evidence: 18-honour-boards-full.png, 14-grade-leaderboard-full.png.

10. **Scorecard text-composition bugs.** (a) Dismissals render with doubled prefixes: "c c
    Ryan Ward b Lucas Williams", "st st Henry Wright b Tom Taylor" — the mode prefix is added
    to a dismissal string that already contains it. (b) "EXTRAS 0 (14W 7NB)" — the extras
    total contradicts its own breakdown. (c) When the club logo fails to load, the club's own
    innings header band shows a broken thumbnail and *no club name at all*, while the
    opponent's band shows a big text name — no fallback for the logo-based header.
    Evidence: 11-match-detail-scorecard-full.png.

11. **Broken brand logo everywhere with raw alt text.** Header + footer on every page show the
    missed-image icon and "Mandurah Cricket Club" alt string (all screenshots). Environmental
    trigger (blocked CDN) — but there is no graceful fallback (initials badge / text
    wordmark), and a tenant's mis-pasted logo URL will look exactly like this in production.

### P3 — minor / polish

12. **Console noise on every page**: anonymous visits fire `GET /api/auth/me` → 401 error in
    the console on each navigation. Handle the expected-unauthed case quietly.
13. **No loading skeletons observed** on home/players/matches/grades/records (0 loading
    affordance elements right after navigation in sampling; content pops in). On fast local
    the flash is brief; on real networks these pages will show blank cards.
14. **404 CTA says "Return to Dashboard"** — admin vocabulary on a public fan page; the copy
    around it ("Given Out!… retired to the pavilion") is otherwise the best in the app (24).
15. **Small tap targets on mobile**: theme/help pills 42x30, player-detail "Edit" 24x16,
    scorecard batter links ~64x15–30, footer links 17px tall (console-log-mobile.md).
16. **Welcome dialog overflows the mobile viewport**: at 375x812 the dialog's dismiss button
    sits below the fold (y≈834) and clicks get intercepted by the overlapping "Take a quick
    tour" button — automation could never land a trusted click; users must scroll inside a
    modal that doesn't look scrollable (40a-mobile-welcome.png).
17. **Result strings taken on faith**: "Halls Head Cricket Club won by 2 wickets" next to
    8/266 vs 8/417, bowling economies of 25–43 (11). Likely artifacts of the seeded data, but
    the UI displays result text and scores from independent fields with no consistency check —
    real-world dirty data will produce the same face-plant.
18. **Top Performers grade chips**: an "ALL GRADES" chip renders even when `availableGrades`
    is empty — a filter with nothing to filter (02).
19. **Footer contact is a dead end**: "please contact us via our official website" with no
    link, under a broken logo and a duplicated club-name string (02).

## UI-vs-DB spot checks (ground truth: schema `central`, club_id 2)

| # | Check | UI value | DB value | Verdict |
|---|---|---|---|---|
| 1 | Home totals: players | 30 | 30 (`count(distinct participant_id)` in match_rosters) | MATCH |
| 2 | Home totals: games | 748 | 68 matches (`home_club_id=2 OR away_club_id=2`); 748 is the roster-row count | **MISLEADING** (label says GAMES) |
| 3 | Home totals: runs / wickets | 18,886 / 412 | 18,886 (`sum(runs)` match_batting) / 412 (`sum(wickets)` match_bowling) | MATCH |
| 4 | A Grade leaderboard first row | White, Lucas 28 Mat, 25 Inn, 3 NO, 860 runs, HS 109, Avg 39.09 | identical (SQL grouped match_batting, grade='A Grade') | MATCH (but row 1 is games-sorted; top scorer 907 sits 13th) |
| 5 | A Grade leaderboard bowling cols | all "–" | 231 A Grade wickets; Flynn Collins 24 | **MISSING IN UI** |
| 6 | Records: Most Runs / Most Wickets | 907 Cooper Lewis / 24 Flynn Collins | 907 / 24 | MATCH |
| 7 | Player detail (Josh Bailey) | 27 Mat, 23 Inn, 6 NO, 831 runs, HS 139, Avg 48.88 | identical | MATCH |
| 8 | Premierships page | "No premierships found" (0 of 0) | 1 row in central.premiers (A Grade 2023/24, confidence high) | **MISSING IN UI** |
| 9 | Honour boards: total dismissals | 0 | 302 fielding rows for club 2 | **MISSING IN UI** |
| 10 | Compare career avg (Cooper Lewis) | 39.43 | 56.69 (runs / dismissed innings) | **WRONG IN UI** |

## Candid assessment

The bones here are genuinely good: the scorecard view-model, milestone tracker, compare tool,
tour and theming are ahead of anything a community cricket club has today, and most numbers I
checked were exactly right against the central database. But this build fails the one test
the product exists to pass — "sign a new club and their site is instantly complete and
credible." On the very first data-rich tenant: the homepage's hero module is permanently
empty, the premierships page denies a premiership the central DB knows about, the grade
leaderboard is half dashes and mis-ranked, the headline games count is inflated 11x, and
another club's founding year and record-keeping caveats leak through. Meanwhile the site
cannot be navigated on a phone at all — for a fan product whose traffic will be
overwhelmingly mobile (boundary-side score checking), the off-screen hamburger alone is a
launch blocker. The pattern behind most of the data issues is the one the team already
flagged: the local-vs-central read boundary is only half-migrated, and every endpoint that
missed the `shouldReadCentral` treatment renders as a confident-looking empty state rather
than an error — the most dangerous kind of failure, because nobody gets paged and the
visitor just concludes the club's history is missing. Priorities: (1) fix the header layout,
(2) sweep every public read for central-awareness with per-tenant consistency tests (top
performers, premierships, bowling/fielding aggregates), (3) strip admin affordances from the
anonymous surface, (4) finish the brand sweep with a lint rule, not another manual pass.
