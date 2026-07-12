# Ovation — 10 Improvement Recommendations

Senior-PM product review, July 2026. Every recommendation is grounded in verified evidence
from the full-stack test campaign (see `PRODUCT-REVIEW.md` and `evidence/*/findings.md`;
screenshots/videos referenced are committed beside the findings). Ordered by
impact-on-a-pilot-club ÷ effort. Each carries 2–3 achievable solution options — pick one per
item; none requires a rewrite.

---

## 1. Ship a brand that isn't broken by default (placeholder logo)

**Problem.** The default club crest `artifacts/cricket-club/public/ovation-logo.svg` is
malformed XML (`--` inside XML comments). Browsers reject it, so **every tenant without an
uploaded logo shows a broken-image icon in the header, footer, admin, branding preview, and on
every clubroom-TV board** (alt text bleeds over kiosk board titles). Found independently by
four testers. Evidence: `juniors-empty/12,31,35`, `captain-kiosk/40–44`,
`onboarding-platform` findings #4.

**Impact.** First impression of every self-serve club and every demo is a defaced product.

**Solutions (pick 1):**
- **(a) Two-character fix now:** remove the `--` sequences from the SVG comments; add a CI
  check that every `public/*.svg` parses as XML. *(minutes)*
- **(b) Better:** also add explicit `width`/`height` to the SVG root (one tester measured
  `naturalWidth=0` even when parsed) and an `onError` fallback in the logo component that
  swaps to a monogram chip (club initials on the primary colour) so a dead logo URL can never
  render broken chrome again. *(hours)*
- **(c) Belt-and-braces:** at provision time, copy the club's PlayHQ logo to owned object
  storage instead of hot-linking Cloudinary (Mandurah's logo is a hot-link today — a PlayHQ
  URL change breaks the site). *(half-day)*

## 2. Make the header responsive — the product is currently unusable on phones

**Problem.** The header cluster (logo + nav + SENIORS/JUNIORS pill + theme + Help + hamburger)
lays out in one non-wrapping row ~568px wide at minimum. At 375px the hamburger, theme and
Help buttons are **off-screen — mobile visitors cannot open navigation at all** — and every
page scrolls horizontally; even at 1280px, scrollWidth measures 1470–1557px. Found by four
testers on public, admin, captain and juniors surfaces. Evidence: `public-visitor/40,42`,
`club-admin` findings #1, `captain-kiosk` #5, `juniors-empty/22,24,40` + overflow probes in
`evidence/scripts/`.

**Impact.** Club stats are consumed on phones at training and in the clubrooms; this is the
single highest-leverage UX fix in the product.

**Solutions:**
- **(a) Quick containment:** allow the header to wrap (`flex-wrap`), collapse
  Seniors/Juniors into the hamburger below `lg`, and add `overflow-x: clip` on the shell +
  one Playwright assertion (`document.scrollWidth <= innerWidth`) to CI. *(day)*
- **(b) Proper mobile header:** two-tier mobile pattern — top row logo + hamburger; mode
  toggle and theme/help live inside the drawer; sticky compact on scroll. Reuse the existing
  drawer component. *(2–3 days)*
- **(c) Add the missing viewport test layer:** land the review's overflow probe scripts as a
  standing Playwright smoke suite (see rec 10) so regressions can't ship. *(with rec 10)*

## 3. Finish the central-read surface — real data must never render as "no data" or garble

**Problem (two halves, same boundary).** The 11-club sweep proved the *numbers* are perfect
(~200 UI-vs-DB datapoints, all exact matches) — but the presentation layer around central data
is broken in two ways:

*Missing branches* — central-read tenants get **confidently empty sections over real data**
wherever an endpoint lacks a `shouldReadCentral` branch: home "Top Performers" ("No data for
this season yet." despite a full season — `grades.ts:532`), `/premierships` ("No premierships
found" while `central.premiers` holds the club's flag), leaderboard bowling/fielding columns
permanently "-" (`central-queries.ts:533-540` returns nulls while player pages DO show
bowling), player fielding "Dismissals 0" vs real fielding rows (`central-queries.ts:1110`).

*Wrong parsing* — the shared scorecard view-model mangles central formats on EVERY central
match page: `parseScore` (`lib/scorecard/src/mapping.ts:40`) reads central "5/313"
(wickets/runs) as runs=5/wickets=313, so **EXTRAS is always 0**, batting lines never reconcile
to totals, and all-out innings render "219/0"; `formatDismissal`
(`lib/scorecard/src/dismissal.ts`) expects legacy colon formats, producing "**c c** Ryan Ward
b…", "**st st**…" and silently **dropping the bowler from LBWs**. Evidence: `public-visitor`
P1-2/3/4, `club-sweep-1/findings.md` #1/#2/#5 with SQL cross-checks and videos.

**Impact.** A pilot club's premierships, best players and scorecards are the emotional core of
the pitch; showing "none" — or a scorecard a cricketer instantly spots as wrong — kills trust
on day one. This is exactly the dual-read boundary risk `AGENTS.md` calls the top correctness
risk, observed live.

**Solutions:**
- **(a) Fix the view-model format handling first** (biggest visible win): teach
  `parseScore`/`formatDismissal` the central conventions (detect wickets/runs order — wickets
  ≤ 10 disambiguates; pass central dismissal text through untouched). Add scorecard fixture
  tests for both formats in `@workspace/scorecard`. *(1–2 days)*
- **(b) Close the read gaps:** central branches for top-performers, premierships seeding, and
  leaderboard bowling/fielding in `central-queries.ts` (bowling data exists —
  `centralPlayerDetail` already derives it), extending the `*-consistency.test.ts` pattern per
  flipped read. *(days, endpoint by endpoint)*
- **(c) Guard-rail while migrating:** per-tenant capability map — sections whose data source
  isn't central-ready are hidden for central tenants instead of rendering "your club has
  none"; plus run the committed sweep scripts (`evidence/scripts/sweep*-*.mjs`) nightly
  against staging and alert on UI-vs-DB mismatch. *(1–2 days, reuses committed scripts)*

## 4. Fix the onboarding handoff — the wizard is great, the landing is broken

**Problem.** Signup provisions a tenant in ~150ms and ~40s end-to-end (excellent), then: the
new admin lands on **the wrong club's site** (slug→tenant directory cache in
`tenant-context.ts:68-92` is never invalidated on provision, 5-min TTL); both success-screen
CTAs are **silent dead ends** when `PLATFORM_BASE_DOMAIN` is unset (`lib/tenant-url.ts:10`
falls back to `PLATFORM_HOSTS[0]`, `https` + port hardcoded in `routes/platform.ts:184`); the
landing page's only proof link 404s (`hallshead` vs `halls-head`, `landing-page.tsx:46-48`);
and a second committee member of a claimed club hits "No clubs match…" with no path forward.
Evidence: `onboarding-platform/findings.md` #1–#5 with videos.

**Impact.** This is the moment of maximum trust — the product breaks its own promise seconds
after "Your club's site is live!".

**Solutions:**
- **(a) The one-liners first:** invalidate/bust the tenant directory cache inside
  `provisionTenant` success path; fix the demo-link slug; validate `PLATFORM_BASE_DOMAIN` at
  boot (refuse to serve signup without it, or derive redirect scheme/port from the request).
  *(day, including tests)*
- **(b) Claimed-club path:** picker shows claimed clubs greyed with "Already live — visit
  site / ask your club admin / contact us" instead of hiding them. *(day)*
- **(c) Regression gate:** adopt the tester's `onboarding-02-signup.mjs` as a CI/staging
  smoke: signup → correctly-branded site → authenticated admin in <60s. *(with rec 10)*

## 5. Crash-proof the first session: error boundaries, real 404s, no infinite spinners, no misplaced modals

**Problem.** `/records` **white-screens the whole SPA** on an empty club
(`records.tsx:628-644` reads `.value` on null; no error boundary; top-nav item, day-one page).
Nonexistent match/player detail URLs spin "Loading…" forever (API 404s correctly; UI never
resolves) — including the link every redacted "Private Player" leaderboard row points at. The
admin gate and SPA boot show bare "Loading…" text / blank pale-blue screen while polished
skeleton primitives already exist in `data-states.tsx`. And the public "Welcome to the club
portal" tour modal opens **on top of the admin login form** (it broke test automation; it will
confuse volunteers). Evidence: `juniors-empty` #1/#5, `club-admin` #2/#4, `club-sweep-2` #7.

**Solutions:**
- **(a) Null-safe records + route-level error boundary** with the branded 404/error component
  (one exists — the 404 page is good) so one page's crash never blanks the app. *(day)*
- **(b) Detail-page 404 handling:** `useQuery` error → "This match/player doesn't exist"
  state with a back link, replacing the eternal spinner; don't link redacted rows at all.
  *(hours per page type, ~4 pages)*
- **(c) Swap the three bare loading gates** (`admin-shell.tsx:12`,
  `platform-admin-shell.tsx:26`, `App.tsx:230`) to the existing `LoadingState`/skeletons, and
  suppress the visitor tour on `/admin*`, `/captain`, and kiosk routes. *(hours)*

**Also in scope (same "first 90 seconds" bucket, `club-admin` findings #4/#5):**
entitlement-locked tabs **vanish silently** instead of showing an upsell
(`admin-groups.tsx:64` — on a lower plan the whole Social group disappears with no
explanation, and this is also the upsell surface billing needs once 2c/2d activate); the
admin hub duplicates the sidebar IA as ~17 unordered tiles (Admin Users listed twice); raw
floats leak into admin stats display ("6.8333335" instead of a formatted number). Fix: gate
locked tabs behind a visible lock badge + "See plans" sheet, curate the hub to 6–8
task-oriented tiles, and round through one shared `formatStat` helper. *(1–2 days, bundle
with (a)–(c))*

## 6. Make the clubroom TV genuinely TV-ready

**Problem.** The kiosk's two most common real-world states — typo'd token and
no-honours-yet — both produce an **identical, silent, permanent black screen**; boards occupy
only the top third of a 1080p panel; a useless "✕ Exit kiosk (Esc)" button burns in; the
broken crest defaces every board. The underlying feature (short `/tv/<code>` links, revoke,
skins, sponsor slots) is genuinely sellable. Evidence: `captain-kiosk/30–33,40–44` + videos.

**Solutions:**
- **(a) Explicit failure/empty screens:** 403 → "This TV code isn't valid — check the code in
  Admin → Honours → Display"; empty boards → branded "No honour boards yet" with the club
  crest. *(day)*
- **(b) Panel fit:** vertically centre and scale boards to viewport height (the skin system
  already abstracts layout); hide the exit button when token-authenticated. *(1–2 days)*
- **(c) Sponsor-slot upsell:** the sponsor strip/ads already built are a monetisation story
  for clubs — surface them in the pricing/plan copy once billing wakes up. *(product decision,
  no code)*

## 7. Close the private-player privacy gap before any real data ships

**Problem.** `is_private` redaction works on the player directory ("Private Player" on
leaderboards, excluded from the directory) but **fails on scorecards**: the OPPONENT club's
site renders the private player's real name in full (`oppositionLines[].name` is never
redacted — verified via API and UI on Pinjarra's view of Warnbro's private player), and
dismissal free-text ("c Hunter Reed b …") carries private names on EVERY club's site,
including their own. With the real PCA dataset this is a live privacy obligation
(`central.players.is_private` exists precisely because some participants opted out), a
data-governance commitment in CLAUDE.md, and plausibly a legal exposure for junior-adjacent
players. Evidence: `club-sweep-2/findings.md` privacy verdict + screenshots
`pinjarra-09-*`, `singleton-irwinians-09-*`.

**Solutions:**
- **(a) Redact at the read boundary:** apply the privacy mask in `central-queries.ts`
  scorecard/opposition reads (one place, both sides of the match), replacing name AND
  scrubbing it from dismissal text (substring replace with "Private Player" / fielder
  initials). Add a consistency test with an is_private fixture. *(1–2 days)*
- **(b) Defence in depth:** a serializer-level guard in the API layer that refuses to emit
  any `display_name` belonging to an is_private participant on public routes, whatever the
  source path — cheap insurance against future read paths repeating the miss. *(day)*
- **(c) Also fix the UX artefact:** redacted leaderboard rows currently link to a dead,
  forever-spinning player page — render them unlinked. *(hours, covered by rec 5b)*

## 8. Stats surfaces that answer the fan's question — and get records right

**Problem.** The A Grade leaderboard ships **six permanently empty bowling/fielding columns**
(central bowling data exists but isn't read — see rec 3), defaults to sort-by-games (the
season's top scorer, 907 runs, sat 13th), and **headers aren't sortable**. The Records page's
"Total Club Records" tab shows **per-(player,grade) maxima labelled as all-time career
records** — 7 of 25 values checked were wrong across 3 of 5 clubs (Warnbro's real Most Games
holder has 47, page shows 30; Rockingham Most Wickets shows the right holder with the wrong
number, 20 vs 27). Compare's career batting average ignores not-outs (39.43 vs correct 56.69 —
the same page's By Grade table gets it right); home headline says "748 GAMES" counting roster
appearances, not the 68 matches played. Evidence: `public-visitor` P1-4/P2,
`club-sweep-2/findings.md` §e — all SQL cross-checked.

**Solutions:**
- **(a) Fix the two wrong-number bugs first** (records tab: aggregate across grades before
  taking the max — the By Grade tab already has the per-grade view; Compare: reuse the By
  Grade average helper). Clubs forgive missing features, never wrong records. *(day)*
- **(b) Sortable columns + runs-desc default** on leaderboards; hide columns whose whole
  dataset is null for the tenant; label the home tile "Appearances" or count distinct
  matches. *(1–2 days)*
- **(c) Column-config per tenant** (curation feature): let clubs choose default leaderboard
  columns per grade — differentiator for stat-obsessed clubs. *(later, plan-gated)*

## 9. Retire the last Halls Head hard-codings from the white-label surface

**Problem.** Runtime leaks a tester can see on OTHER clubs' sites: "Established 1991"
(`honour-boards.tsx:262`), the Halls-Head record-keeping caveat on every tenant's grade and
player pages (`grade-leaderboard.tsx`, `player-detail.tsx:460`), every grade badge platform-wide
built from `HHCC_Icon_Gold_*.png` (`grade-badge.tsx:1`), the hard-coded 10-grade captain
checkbox list (`admin-captains.tsx`), generic footer contact block (`layout.tsx:290` TODO),
generic "Ovation" og:/meta tags (document.title is tenant-branded, so the plumbing exists),
marketing tab title degrading to "Cricket Club". The theming/token system itself passed
cleanly across all 10 provisioned tenants — the debt is now copy/asset-level, not
architectural. One PM decision surfaced by the sweep: brand colours silently snap to the
nearest of 5 fixed accent tokens (White Knights' grey renders bright amber; Shoalwater Bay's
teal renders the same blue as Mandurah) — either constrain the onboarding colour picker to the
5 tokens or widen the palette. Evidence: `juniors-empty` #7, `captain-kiosk` #6,
`public-visitor` P2, `club-sweep-1/findings.md` #4 + brand table.

**Solutions:**
- **(a) Tenant fields:** add `established_year`, `contact_*` to the tenants row + branding
  tab; footer and honour-board hero read from brand context. *(day)*
- **(b) Grades from data:** captain grade checkboxes and grade filters derive from the
  tenant's actual grades (central `matches.grade` distinct → app grades — helper exists:
  `listCentralGradesForClub`). *(day)*
- **(c) Finish the literal sweep with a lint:** CI grep gate for "Halls Head|HHCC|1991" in
  `src/` (allowlist the tenant-1 seed data), burning down the remaining ~48 files. *(hours,
  then incremental)*

## 10. Instrument the product and keep this review's tests alive

**Problem.** There is **no product analytics** (no funnel events, no admin telemetry), so
none of the A/B experiments in `AB-TESTING-PLAN.md` can run, activation can't be measured,
and nobody will know if pilot clubs use what they're given. And with **zero frontend tests**
in CI (all 28 test files are backend), every P1 above shipped invisibly — the review's
Playwright scripts already cover the critical paths and caught all of them.

**Solutions:**
- **(a) Analytics:** self-hosted Plausible/Umami (privacy-friendly, tenant-dimension) with
  the 8 canonical funnel/activation events listed in `AB-TESTING-PLAN.md`. *(1–2 days)*
- **(b) Frontend smoke suite in CI:** promote `evidence/scripts/*.mjs` into a
  `@workspace/e2e` package — signup handoff, mobile overflow assertion, empty-club walk
  (records crash), kiosk states, one UI-vs-DB leaderboard check against seeded fixtures. The
  repo's CI already boots Postgres for the API job; reuse it. *(2–3 days)*
- **(c) Cheapest viable start:** run the scripts nightly against staging via a GitHub Action
  and post failures to the club Slack/Discord — no packaging work. *(half-day)*

---

### Sequencing suggestion (impact ÷ effort)

**Week 1 (demo-safe):** 1a/1b · 3a (view-model format fix) · 4a · 5a/b/c · 7a/b — the
broken-logo, garbled-scorecard, wrong-club-handoff, white-screen/tour-modal, and
privacy-leak fixes make the product safe to demo or pilot with a real club.
**Week 2–3 (pilot-ready):** 2a/2b · 3b/3c · 6a/6b · 8a/8b.
**Week 4+ (self-serve-ready):** 8c · 9a/9b/9c · 10a/10b.
