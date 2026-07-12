# Ovation — Product Review (July 2026)

Senior-PM-level review of Ovation, the white-label cricket club stats platform, verified
against a real running full stack rather than static code reading. This is the entry point —
see companion docs for the details:

- **`RECOMMENDATIONS.md`** — 10 improvement recommendations, each with 2–3 solution options
- **`AB-TESTING-PLAN.md`** — the executed 11-club tester panel results + designed live-traffic experiments
- **`CLUB-FEEDBACK-PACK.md`** — ready-to-send pilot-club outreach + survey
- **`evidence/`** — every screenshot, video, log, and script referenced below, organised per test area

## Method — how this review was actually verified

Everything here was produced against a live local instance of the app, not inferred from
reading source. The environment (`evidence/TESTER-BRIEF.md`):

- Postgres 16 with the real app schema, plus a **stand-in central PCA database** — a
  deterministic generator (`evidence/generate-central.mjs`) built a `central` schema matching
  the production Supabase structure and seeded a fully internally-consistent mini-league (11
  clubs, 3 seasons, 2 grades, full round-robin + finals — 670 innings validated: batting-line
  sums, wicket counts, and bowling credits all reconcile to the published scores). The real
  central DB was unreachable in this sandbox (no `CENTRAL_DATABASE_URL`, Supabase connector
  unauthorized); this stand-in exercises the exact same code paths the real dataset would.
- **All 11 clubs named for the pilot were provisioned as real tenants** through the production
  `provisionTenant` code path (the same one self-serve signup uses) — Halls Head, Mandurah,
  White Knights, Shoalwater Bay, Secret Harbour, Waroona, Pinjarra, South Mandurah, Rockingham
  Hornets, Warnbro Swans, Singleton Irwinians — served on production-style subdomain routing
  (`<slug>.ovation.test`).
- **Backend:** full monorepo typecheck, the complete api-server vitest suite, and a scripted
  black-box API probe matrix (auth, tenant isolation, entitlements, security headers, rate
  limits).
- **Frontend:** Playwright, with **video recording and screenshots on every flow** — six tester
  passes covering public visitor, juniors, club admin, onboarding + platform console, captain
  portal + clubroom-TV kiosk, and two 11-club sweeps comparing every rendered stat against
  direct SQL.

## Executive summary

**The stats engine is trustworthy. The presentation layer around it is not yet pilot-ready.**

Across ~400 UI-vs-database datapoints sampled from all 10 central-read clubs — home totals,
leaderboard rows, player careers, full match scorecards — **every single value matched
independently-computed SQL exactly**. The aggregation logic in `central-queries.ts` (a genuinely
intricate piece of code: did-not-bat exclusion, not-out classification from free-text
dismissals, best-bowling tie-breaks, games as a batting∪roster union) is correct across every
club tested. That is the single most important finding in this review, and it wasn't a given —
`AGENTS.md` itself flags the dual local/central read boundary as the top correctness risk in the
codebase.

But six independent testers, walking the product like real visitors, admins, captains and
committee members, converged on the same pattern: **every defect found was systemic (the same
bug, the same symptom, on every affected club) and concentrated in the first-impression
surfaces** — the placeholder logo, the mobile header, the onboarding handoff, the scorecard
formatter, and a couple of genuinely serious gaps (a privacy leak, a wrong-records bug). None of
this requires architectural change. All ten recommendations in `RECOMMENDATIONS.md` are
day-to-week-scale fixes, and because the bugs are systemic rather than per-tenant, each fix
pays off across every current and future club at once.

## What works well (don't break these)

- **Data correctness**, as above — the hardest part of a white-label stats platform to get
  right, and it's right.
- **Tenant isolation** — verified at every layer: sessions can't cross tenants (401 on
  cross-tenant reuse, tested both directions), stats never bleed between clubs, a shared match
  renders byte-identical from both participating clubs' sites, juniors data never touches
  seniors surfaces.
- **CSV import flow** — "the best flow in the product" per the club-admin tester: preview
  before commit, per-player resolution UI, automatic cap-register sync, and a delete that
  rolled back every side effect cleanly.
- **Kiosk token lifecycle** — short typeable codes, regenerate, revoke, custom codes with
  server-side validation — genuine product thinking, let down only by what happens once you're
  on the TV (see Recommendation 6).
- **Onboarding wizard mechanics** — 3 fields, live slug validation, ~150ms provisioning,
  ~40 seconds landing-to-live. The wizard itself is excellent; it's the moment right after
  submission that breaks (Recommendation 4).
- **Admin tab architecture** — all 28 tabs across the four consolidated groups render clean
  with designed empty states and zero JS errors; all legacy flat URLs redirect correctly.
- **Theming system** — CSS-token-based brand injection worked cleanly across all 10 newly
  provisioned tenants with zero code changes required.

## Findings by severity

Full detail, reproduction steps and evidence links are in each area's `evidence/*/findings.md`
and consolidated with solutions in `RECOMMENDATIONS.md`. Summary:

### High severity (fix before any pilot club sees the product)

1. **Scorecard view-model misparses central data on every match page** — runs/wickets swapped,
   EXTRAS always shows 0, dismissal text corrupted ("c c X b Y"), LBW silently drops the
   bowler. → Recommendation 3.
2. **Placeholder logo is broken XML** — every tenant without a custom logo shows a broken image
   in the header, footer, and every clubroom-TV board. → Recommendation 1.
3. **Mobile header is unusable** — the nav cluster doesn't wrap; at 375px the hamburger menu
   itself is off-screen, so mobile visitors cannot navigate at all. → Recommendation 2.
4. **Onboarding handoff breaks right after "Your club's site is live!"** — a stale tenant-cache
   serves the new admin the wrong club's branding; success-screen CTAs dead-end without
   `PLATFORM_BASE_DOMAIN` set. → Recommendation 4.
5. **`/records` white-screens the entire app on an empty (new) club** — a top-nav page, a new
   club's near-certain first click. → Recommendation 5.
6. **Private player names leak on opponent sites and in dismissal text** — `is_private`
   redaction isn't applied to opposition-side scorecard lines. A real data-governance
   obligation, not just a UX nit. → Recommendation 7.
7. **Records "Total Club Records" reports per-grade maxima as career records** — wrong number
   or wrong holder for any player who's played more than one grade. → Recommendation 8.
8. **Kiosk fails silently** — a wrong token and "no honours data yet" render the exact same
   permanent black screen, with no way to tell them apart. → Recommendation 6.

### Medium severity (fix during pilot)

- Central-read tenants show confident empty states over real data (Top Performers,
  premierships, leaderboard bowling columns) where an endpoint lacks a central-read branch.
- Visitor onboarding tour modal opens on top of the admin login form.
- Entitlement-locked admin tabs vanish silently instead of showing an upsell.
- Compare's career batting average ignores not-outs.
- Several Halls Head-specific hard-codings still leak onto other tenants' sites (a founding
  year, a historical note, a branded icon asset).

### Low severity / polish

- Admin-only controls (Add Player, Edit links) visible to anonymous visitors, though the
  server correctly rejects the underlying writes.
- Console noise (401 on every anonymous `auth/me` probe), raw unformatted floats in admin
  stats, a duplicated admin hub tile.
- Brand colours snap to the nearest of 5 fixed accent tokens, occasionally landing oddly (a
  grey club rendering bright amber) — a PM call on whether to widen the palette.

## Backend verification results

- **Typecheck:** clean across the whole monorepo (`evidence/typecheck.log`).
- **Vitest:** 159/159 passing in CI mode (`CI_SKIP_DATA_TESTS=1`, matching the real CI
  pipeline); 198/205 in full mode against the freshly-seeded local DB — the 7 failures are all
  in suites explicitly marked `DATA_DEPENDENT` in `vitest.config.ts`, asserting on data this
  particular fresh database doesn't carry (documented pre-existing behaviour, not a regression
  introduced by this review). Full logs: `evidence/vitest.log`, `evidence/vitest-ci.log`.
- **API probe matrix** (`evidence/api-probes.sh` + `.log`): auth happy/sad paths, session-cookie
  tenant-scoping (cross-tenant reuse correctly rejected both directions), admin-write
  authorization, entitlement pass-through behaviour (billing dormant as documented), security
  headers (CSP/HSTS/nosniff/frame-options all present), signup discovery rate limiting, and
  problem+json error shape — all behaved as designed.

## Known limitations of this review

- The central PCA dataset used throughout is a **synthetic stand-in**, not the real 24-season
  Supabase data (unreachable in this sandbox). The generator is fully documented and
  internally validated, and the UI-vs-DB comparison methodology is identical to what would run
  against real data — but absolute numbers (player names, exact stats) are not the real
  club histories. Re-running the same tester scripts against the real
  `CENTRAL_DATABASE_URL` is a same-day follow-up once that connection is available.
- Billing and entitlement gating are dormant in the running server (by design, per
  `AGENTS.md`) — the probe matrix confirmed pass-through behaviour but did not exercise real
  Stripe checkout.
- "Send off for A/B testing" and "request feedback from possible clubs" are delivered as
  ready-to-execute plans and packs (`AB-TESTING-PLAN.md`, `CLUB-FEEDBACK-PACK.md`) — this
  review environment has no path to real club contacts or live production traffic.

## Bottom line

Ship the Week 1 fixes in `RECOMMENDATIONS.md` (roughly a week of focused work: logo, mobile
header, scorecard formatter, onboarding handoff, crash guards, privacy leak) and this product
is genuinely demo- and pilot-ready — the hard part, correct multi-tenant stats aggregation
against a shared association database, already works.
