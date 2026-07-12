# Onboarding & Platform findings — marketing site, self-serve signup, super-admin console

Area: apex host `http://ovation.test:24624` (landing page, `/signup`, `/platform-admin`)
plus follow-through to the freshly provisioned `dawesville.ovation.test:24624`.
Tester run: 11 Jul 2026, per `TESTER-BRIEF.md`. Scripts:
`evidence/scripts/onboarding-*.mjs`. Desktop 1280x720 (+ mobile 375x812 for landing).

## What was tested

1. Landing page, desktop + mobile: copy, CTAs, meta/OG, console errors, broken
   images, horizontal scroll (`onboarding-01-landing.mjs`; `01`–`04-*.png`,
   `landing-desktop.webm`).
2. Self-serve signup end-to-end for Dawesville Cricket Club (central club 12):
   club picker → taken slug (`mandurah`) → real slug (`dawesville`) → admin
   `dawesville-admin@example.com` → submit → follow-through to the new club URL and
   `/admin` (`onboarding-02-signup.mjs`; `10`–`18-*.png`, `signup-e2e.webm`).
   Result: tenant 12 provisioned, admin row created, club-admin login verified.
3. Edge cases: `/signup` revisited after the last club was claimed, claimed-club
   resubmission via API (409), unknown club id (400), 13 slug formats against
   `/api/platform/slug-available` (`onboarding-03-edgecases.mjs`; `20`–`21-*.png`,
   `signup-edgecases.webm`).
4. Post-provisioning state of Dawesville after the tenant-directory cache TTL:
   correct branding, admin login with the created credentials, branding settings
   page (`onboarding-03b-dawesville.mjs`; `22`–`26-*.png`, `dawesville-post-ttl.webm`).
5. Platform super-admin console: login gate, wrong password, tenants list (12
   tenants), Dawesville tenant detail incl. branding card, provision page
   (screenshot only), and cross-tenant access checks — club-admin session on the
   apex console at both UI and API level (`onboarding-04-platform-admin.mjs`;
   `30`–`37-*.png`, `platform-admin.webm`, `platform-admin-isolation.webm`).

## What works well

- **The wizard itself is genuinely good.** Three fields, live debounced slug
  availability with a green tick, clear inline "That address is already taken.",
  submit disabled until everything validates (`13`, `14`). Server-side provisioning
  took **150 ms** (api.log). Scripted end-to-end, landing → success screen was
  ~39 s *including* a deliberate slug-collision detour.
- Slug validation is thorough: min 2 / max 40 chars, lowercase/number/hyphen rule
  with a human message, reserved names (`www`, `admin`, `api`), taken-slug 409 at
  submit time even if the live check was bypassed.
- Claimed-club race is handled server-side: direct API resubmission of club 12
  returns 409 `"Dawesville Cricket Club has already been claimed."`; unknown club
  id returns a clean 400.
- Platform console is a solid internal tool: tenants list with plan badges, data
  source and admin counts (`32`); tenant detail with plan/custom-domain card,
  admin password-reset-link generator, and a branding card with live preview and
  an automatic **contrast warning** ("Low contrast against light surfaces.") (`33`).
- **Tenant isolation held everywhere I probed it**: a logged-in halls-head club
  admin visiting apex `/platform-admin` gets the login gate (`37`), and
  `GET /api/platform/admin/tenants` with that session returns 401. Bad platform
  password shows a clear "Incorrect email or password." (`31`).
- Landing page is clean, responsive (no horizontal scroll at 375px), no broken
  images, honest pilot framing ("Free during the pilot"). The "Why Ovation over a
  Facebook page or a spreadsheet?" section is exactly the right argument for a
  club committee audience.

## Issues

### CRITICAL

**C1. The post-signup redirect lands the new admin on the WRONG club's site.**
The single most important moment of the funnel is broken. Nine seconds after the
201 from `/api/platform/signup`, `dawesville.ovation.test` still served **Halls
Head Cricket Club** branding over an empty stats page, and the just-minted session
was rejected (`/api/auth/me` → 401, api.log 22:24:52; screenshots `17`, `18`).
Root cause (source-verified): the tenant host directory in
`artifacts/api-server/src/middlewares/tenant-context.ts:68-92` is cached for
**5 minutes** and `provisionTenant` / the signup route never invalidate it, so a
brand-new subdomain resolves to the fallback tenant (tenant 1) until the TTL
expires. A new club committee member's first impression of "their" site is a
different club's name on it — during exactly the window in which the wizard sends
them there. Fix is one line (invalidate the directory cache on provision).

**C2. Both success-screen CTAs are dead ends when the platform's base domain is
not explicitly configured.** The signup response builds
`redirectUrl: https://{slug}.{apex}/admin` (`routes/platform.ts:184`) and scopes
the auto-login cookie to `{apex}` (`lib/auth.ts:117-125`), where `{apex}` comes
from `platformBaseDomain()` (`lib/tenant-url.ts:10-22`) = first `PLATFORM_HOSTS`
entry when `PLATFORM_BASE_DOMAIN` is unset. In this environment that is
`127.0.0.1`, so "Set up branding now" tried to navigate to
`https://dawesville.127.0.0.1/admin` — the click does nothing visible (`16`), and
the cookie (Domain=127.0.0.1) never reaches the real tenant host, which is why
auto-login failed in C1's 401 even after the cache expired. The scheme (`https`)
and port are also hardcoded. In a perfectly configured production this works, but
one plausible config permutation silently kills onboarding with **no error shown
to the user** — they sit on "Your club's site is live!" with two buttons that do
nothing. At minimum: derive redirect scheme/host from the request, validate the
config at boot, and surface navigation failure.

### HIGH

**H1. The landing page's only proof point is a dead link.** "Visit Halls Head's
site" points to `https://hallshead.<apex>` (verified rendered href
`https://hallshead.ovation.test`) but the real tenant slug is `halls-head` —
`hallshead.*` is nobody. Hardcoded in
`artifacts/cricket-club/src/pages/landing/landing-page.tsx:46-48`; also assumes
https/default port. Every prospect who clicks "See it in action" gets a
connection error. This should come from the tenants table, not a string literal.

**H2. Default club logo is a broken image on every self-serve tenant.**
`artifacts/cricket-club/public/ovation-logo.svg` contains `--` inside XML
comments ("pure shapes only -- no external font dependency", "flourish -- a
bright arc"). `--` is illegal in XML comments, so strict SVG-as-`<img>` parsing
fails: naturalWidth 0, alt text rendered in the header, footer, and the admin
branding live-preview of every tenant without an uploaded logo (`22`, `23`, `26`;
minimal repro: `placeholder-club-logo.svg` loads fine, `ovation-logo.svg` does
not). The new admin's first look at "their" site has a broken-image icon top-left.
Two-character fix (remove the double hyphens).

**H3. Members of already-claimed clubs hit a misleading dead end.** The picker
silently filters claimed clubs, so a second Mandurah (or Dawesville) committee
member searching their club sees *"No clubs match 'Mandurah'. Only Peel Cricket
Association clubs are available during the pilot."* (`11`, `21`) — which reads as
"your club isn't supported", when it is in fact already live at
`mandurah.ovation.test`. No "already on Ovation — go to your site / ask your
admin for access" path exists anywhere. This will generate support load and
lost users, and it gets worse as more clubs claim. Once all clubs are claimed
the picker shows `No clubs match “”.` — literal empty quotes (`20`; same string
on the platform provision page, `35`).

### MEDIUM

**M1. "Log in" on the marketing header goes to the super-admin console.**
`landing-page.tsx:57` links to `/platform-admin`. A club admin clicking the only
login affordance on ovation's front page lands on an internal email/password
gate they can never pass (`30`). There is no "find your club's site" login flow
on the apex at all.

**M2. The wizard throws away the server's good error messages.** The API returns
specific 409s ("Dawesville Cricket Club has already been claimed.") but the form
always renders the generic "Couldn't complete signup. The address or club may
already be taken." (`signup-page.tsx:258-262`). Given C1/C2, precise errors here
matter.

**M3. The public "Welcome to the club portal" tour modal opens ON TOP of the
admin sign-in gate at `/admin`** (`23`), and (being a dialog) removes the login
form from the accessibility tree — my scripted "click Sign in" literally could
not find the button until the modal was dismissed. A brand-new admin following
"log in at /admin" is greeted by a visitor tour offering "Take a quick tour" of
public pages.

**M4. Signup collects "Admin email"; the login gate asks for "Username"** (`24`).
It accepts the email as the username value, but after C1/C2 forced this user to
log in manually, the label mismatch is one more coin-flip moment.

**M5. Browser tab title on the marketing site is "Cricket Club".** The served
HTML has `<title>Ovation</title>` and correct OG/twitter tags, but the SPA
overwrites `document.title` to the generic "Cricket Club" at runtime (verified
`page.title()` = "Cricket Club"). The brand in the tab bar of every prospect is
wrong.

**M6. Slug checker inconsistencies.** `UPPER` is reported *available* (the rule
message elsewhere says lowercase only; it is silently lowercased at submit), and
`platform-admin` is not in the reserved list while `www`/`admin`/`api` are —
`platform-admin.ovation.app` as a club site is confusing at best.

**M7. Post-signup empty state undercuts the promise.** The landing page says
"populated in seconds"; the wizard says "we'll populate its full history
instantly". Dawesville's central seed has no club-12 rows (test-data artifact,
verified: 0 central matches for club 12), and the resulting site is "0 PLAYERS /
No data for this season yet" with zero explanation for visitors and no
data-status callout for the admin (`22`). Whatever the data situation, the first
render after signup needs a state between "instant full history" and silent
zeros. Relatedly, the canned welcome-modal copy told this central-read tenant
that "stats reflect what club admins have recorded after each round" — the
opposite of the product's automation pitch.

### LOW

- **L1.** Landing and club pages load Google Fonts from `fonts.googleapis.com`
  (blocked in this sandbox → fallback fonts in all screenshots). Self-hosting
  would remove a third-party dependency and metric variance on match-day TVs.
- **L2.** No product imagery anywhere on the landing page — for a product whose
  pitch is "beautifully", the page is all text; the one visual proof (H1) 404s.
  No hard numbers either, when "24 seasons, 11,604 matches" is sitting in the DB.
- **L3.** Footer has no contact/privacy/terms links (data-governance posture
  matters here, per project constraints); "Contact us" mailto is
  `hello@ovation.app` while the page runs on `.test` — fine, just confirm it's
  real before launch.
- **L4.** Tenants list has no "visit site" link per tenant; getting from the
  console to a club's actual site is copy-paste.

## Signup time-to-value narrative (the key onboarding moment)

Timeline from api.log + video (`signup-e2e.webm`):

| t | Event |
|---|---|
| 0 s | `/signup` loads; picker shows the one unclaimed club instantly |
| +8 s | Dawesville picked; suggested slug `dawesville-cricket-club` pre-filled, live-checked ✓ |
| +14 s | Tried `mandurah` → inline "That address is already taken.", submit disabled |
| +28 s | `dawesville` ✓, email + password entered |
| +39 s | POST `/platform/signup` → **201 in 150 ms**; "Your club's site is live!" |
| +41 s | Clicked "Set up branding now" → **nothing happens** (navigates to `https://dawesville.127.0.0.1/admin`, C2) |
| +48 s | Manually opened `dawesville.ovation.test` → **Halls Head-branded empty site** (C1), `/api/auth/me` 401 |
| +5 min | Cache TTL expires; site now Dawesville-branded (broken default logo, H2), `/admin` shows a public tour modal over a login asking for a "Username" (M3/M4); manual login with the created email works |

Forty seconds from landing to "live" is genuinely excellent — better than almost
any club SaaS I've seen. Then the product breaks its own promise in the ten
seconds that matter most.

## Candid PM assessment of the funnel

The bones are very good: the pitch is the right pitch ("your whole history,
instantly, branded as your own"), the wizard is short and honest, provisioning is
effectively instant, and the platform console suggests real operational maturity
(contrast warnings, reset links, plan/data-source visibility). Isolation — the
thing that would kill this product commercially — passed every check I threw at it.

But the funnel, walked as an actual club secretary would walk it, currently goes:
generic "Cricket Club" tab title → dead demo link → (if they persist) a lovely
40-second wizard → a success screen whose buttons do nothing → a site wearing
*another club's name* → a rejected login. Each break is small and cheap to fix —
a cache invalidation, an SVG comment, a slug string, a redirect built from config
that nobody validates — but they compound at the exact moment of maximum trust
transfer. None of the five critical/high issues would be caught by the existing
route-level tests, because they live in the seams (cache lifetime, deploy config,
static asset validity, cross-host cookies). Before any friendly-club demo:
fix C1, C2, H1 and H2 (about a day of work), then re-run
`scripts/onboarding-02-signup.mjs` as the regression gate — signup → *correctly
branded* site → *authenticated* admin, inside 60 seconds, with no manual steps.
That is the moment this product is selling; it has to be flawless.

## Environment notes for re-runners

- This env runs the API with `PLATFORM_HOSTS=127.0.0.1,ovation.test` and no
  `PLATFORM_BASE_DOMAIN`, which is what exposes C2's `127.0.0.1` apex; on https
  with `PLATFORM_BASE_DOMAIN` set, C2's cookie/redirect would work (C1 would not).
- Dawesville (tenant 12) is now claimed; re-running the signup flow needs the
  tenant + admin rows removed (`tenants` id 12, `admins` username
  `dawesville-admin@example.com`) or a different unclaimed central club.
- `fonts.googleapis.com` is unreachable in the sandbox; all screenshots use
  fallback fonts.
