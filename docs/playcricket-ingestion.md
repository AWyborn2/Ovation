# PlayCricket ingestion — spike findings & recommendation

**Date:** 2026-05-27
**Status:** **No-go for now. Stay on CSV.**
**Author:** Spike investigation (task #26)

## TL;DR

We investigated whether we can pull Halls Head's stats from
`play.cricket.com.au` directly so the user no longer has to download/upload
CSVs. The answer for now is **no**:

- `play.cricket.com.au` is operated by Cricket Australia and runs on
  [PlayHQ](https://playhq.com). The only sanctioned automated access path is
  the PlayHQ External API.
- PlayHQ's public API does **not** expose per-grade season aggregates for
  cricket — i.e. the exact shape the CSV gives us. The closest public
  endpoint (`GET /v1/grades/{id}/profiles/statistics`) is documented as
  *"not applicable to Cricket at present"*.
- The richer cricket stat endpoints
  (`/partner/v1/profiles/{id}/statistics/...`) are private and gated behind
  a PlayHQ partner agreement.
- The CSV the user already exports is the canonical, complete dataset and
  is two clicks to obtain. The CSV import pipeline (separate task) gives us
  90% of the automation value with zero of the legal/operational risk.

The recommended next concrete piece of work is **none** — finish the CSV
import flow first, see whether the manual step is actually painful in
practice, and only revisit this if/when the user wants weekly auto-sync.

## Platforms & terminology

There are three names that all get confused:

| Name | URL | What it is |
|---|---|---|
| **PlayCricket AU** | `play.cricket.com.au` | Cricket Australia's grassroots site. SPA frontend over PlayHQ. |
| **PlayHQ** | `playhq.com`, `api.playhq.com` | Sports-management platform that powers the above. Owns the data API. |
| **play-cricket.com** | `play-cricket.com` | UK / ECB platform. Different system, different API. Not relevant here. |

So when we say "scrape PlayCricket", in practice we mean "talk to PlayHQ's
API" — there is no separate AU data API.

## Access paths investigated

### 1. PlayHQ public API (`api.playhq.com`)

- OpenAPI spec: <https://docs.playhq.com/tech/openapi.yml>
- Auth headers required on every call:
  - `x-api-key` — Client ID (UUID) issued by PlayHQ
  - `x-phq-tenant: ca` — tenant short-name for Cricket Australia
- The Client ID is **not self-serve**. You apply through PlayHQ /
  Cricket Australia and get approved. Free, but a manual process.
- Cricket-relevant public endpoints that **do** work:
  - `GET /v1/organisations/{id}/seasons`
  - `GET /v1/seasons/{id}/grades`
  - `GET /v1/seasons/{id}/teams`
  - `GET /v1/grades/{id}/games`, `/ladder`
  - `GET /v1/teams/{id}/fixture`
  - `GET /v2/games/{id}/summary` — per-game appearances + per-player
    batting/bowling/fielding lines
- Cricket-relevant public endpoint that **does not** work:
  - `GET /v1/grades/{id}/profiles/statistics` — spec explicitly says
    *"Please note, this API is not applicable to Cricket at present."*
    This is the one that would have mapped 1:1 onto the CSV.

So to reproduce the CSV via the public API we would have to:

1. Resolve the season → grades → games for Halls Head.
2. Fetch `/v2/games/{id}/summary` for **every game in the season** for
   every grade we care about (hundreds of calls per refresh).
3. Aggregate batting/bowling/fielding lines per `(player, grade)`
   ourselves — re-implementing PlayHQ's roll-up logic, including the
   awkward edges (forfeits, abandoned games, walkovers, retro corrections,
   captain/keeper flags, dismissal-status flags that affect the
   `High Score` cell, etc.).

Doable. Not cheap. And we'd own the discrepancies forever.

### 2. PlayHQ private/partner API

- `GET /partner/v1/profiles/{id}/statistics/career`
- `GET /partner/v1/profiles/{id}/statistics/seasons`
- `GET /partner/v1/profiles/{id}/statistics/seasons/{seasonID}`

These return cricket stats roll-ups directly. They require JWT
authentication via `/auth` using a `clientId` + `clientSecret`, and are
only granted to approved PlayHQ partners (typically commercial partners of
Cricket Australia, not community clubs). Unlikely to be approved for HHCC
on its own.

### 3. Undocumented XHR on `play.cricket.com.au`

The site is a Next.js SPA that calls the same PlayHQ API behind the
scenes. There is nothing materially different to be scraped from the
browser layer that we wouldn't already get from `api.playhq.com` — only
more fragility, since the front-end can change at any time without notice.

### 4. HTML scraping / browser automation

Same as #3 — the page bodies are React-rendered from the underlying API,
so HTML scraping is strictly worse than calling the API. Browser
automation (Playwright) on top would also require us to handle PlayHQ
login if any data is behind auth, which raises the next concern.

## Legal / ToS check

- `https://play.cricket.com.au/robots.txt` — `User-agent: *  Disallow:`
  (i.e. *allows* all crawlers).
- `https://www.playhq.com/robots.txt` — `User-agent: *  Allow: /`.
- PlayHQ Terms of Use page is a client-rendered SPA that we couldn't
  fetch as static markdown in this spike — re-read in a browser before
  productionising anything. The pertinent question for us is whether
  automated retrieval + redistribution of player stats on a public club
  site is permitted; the public API's existence and PlayHQ's
  documentation of it strongly suggests yes for the API path, and the
  permissive robots.txt suggests yes for read-only scraping, but **do
  not productionise without re-reading the live ToS.**

If the public site is ever locked down or its ToS changes to prohibit
automated access, the answer collapses immediately to "no".

## Recommendation, ranked

1. **(Chosen) Stay on CSV.** The PlayCricket CSV export is one click
   per grade, exact, official, and consumed losslessly by the CSV
   import flow (separate task). No legal risk, no API approval to
   chase, no aggregation logic to maintain. Manual cost is ~5
   minutes per season-end, ~30 seconds per round if used mid-season.
2. **Apply for a PlayHQ API key, then build a per-game aggregator.**
   Only worth it if (a) the user explicitly wants weekly auto-sync,
   and (b) approval comes through. Effort estimate post-approval:
   ~1–2 weeks to do it well, including a `(season, grade) → CSV`
   shim that produces the same column shape the import flow accepts,
   plus reconciliation tests against a known-good CSV export.
3. **Pursue PlayHQ partner-tier access** for the private profile
   stats endpoints. Lowest engineering effort if granted, but the
   approval bar is high enough that it's not realistic for a single
   community club. Skip.
4. **Browser automation against `play.cricket.com.au`.** Strictly
   worse than option 2 for the same data — same legal surface, more
   fragility. Skip.

## Why no prototype was written

The brief said *"Prototype (only if viable)"*. The viable path
(option 2) requires a PlayHQ API key that we don't have and can't
obtain in the time-box, and the per-game-aggregator approach is large
enough that doing it on speculation would burn most of the import-flow
budget. The recommendation is to revisit only on explicit user demand.

## If we ever revisit

Concrete first slice of work, in order:

1. Apply for a PlayHQ API key
   (<https://support.playhq.com/hc/en-au/sections/23966738628252-PlayHQ-APIs>).
   Specify Cricket Australia (`ca`) tenant, single-club read-only use.
2. Once issued, write a script in `scripts/src/` that, given
   `(organisationId, seasonId, gradeId)`, walks
   `/v1/grades/{id}/games` → `/v2/games/{id}/summary`, aggregates
   per-player batting/bowling/fielding totals, and emits a CSV with
   the exact column set of the existing PlayCricket export
   (see `attached_assets/2026-05-27-combined-batting-bowling-fielding_1779858636202.csv`).
3. Reconcile its output for one finished grade-season against a real
   PlayCricket CSV export; investigate every diff before trusting it.
4. Only then talk about scheduling, retries, monitoring.

## References

- PlayHQ API docs: <https://docs.playhq.com/tech/>
- PlayHQ OpenAPI spec: <https://docs.playhq.com/tech/openapi.yml>
- PlayHQ "How to use the APIs":
  <https://support.playhq.com/hc/en-au/articles/5692630887065>
- Halls Head on PlayCricket:
  <https://play.cricket.com.au/club/halls-head-cricket-club/4559f1b9-86d8-eb11-a7ad-2818780da0cc>
- Sample PlayCricket CSV (target shape):
  `attached_assets/2026-05-27-combined-batting-bowling-fielding_1779858636202.csv`
