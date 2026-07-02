# Ovation — One-Pager

**A white-label cricket stats-and-history platform.** Any club signs up, brands it as their own, and instantly gets its full history — stats, records, honour boards, milestones — drawn from a shared association database that stays current automatically.

---

## What it is

Ovation turns a cricket association's data into a polished, club-branded website for every member club. Clubs don't rebuild their history or maintain a database — they pick their club, apply their colours and logo, and their site is populated on day one. The platform is built for Peel Cricket Association clubs as the pilot, with Halls Head as the demo/tenant #1.

The core idea: one central, always-current association database feeds many independent, branded club sites. When a player passes a milestone or a weekend result lands, every relevant club site reflects it without anyone re-entering data.

---

## Key features

**Club-branded sites (true white-label)**
Each club gets its own look — name, colours, logo, favicon, page titles and social/share tags — served per club. Subdomains today, custom domains on the roadmap.

**Live central stats**
Batting, bowling and fielding stats spanning 24 seasons (2002/03–2025/26): ~11,600 matches, ~218k batting and ~129k bowling records across 27 clubs. Each club's site is filtered to its own players and matches, and updates automatically as new data lands.

**Records, leaderboards & honour boards**
All-time and per-season leaderboards by grade, club records, premierships, and honour boards. Curated content (life members, awards, committee history, hand-kept records) stays with the club as its differentiating asset.

**Milestones**
Automatic milestone tracking — centuries, five-wicket hauls, and (for native data) career crossings, debuts and hat-tricks — surfaced as recent-highlight cards.

**Player careers & profiles**
Every player's career across grades and seasons, keyed on stable identities so history follows the player.

**Complete history — pre-digital records merged in**
The central database only reaches back to the digital scorecard era (MyCricket, then PlayHQ). Many clubs, though, hold decades of earlier stats in handwritten scorebooks, spreadsheets and honour boards. Ovation needs to ingest and merge those manually-kept historical records with the digital data — reconciling players and matches across both — so career totals, club records, milestones and honour boards reflect a club's *complete* history, not just the PlayHQ-era portion.

**Seniors + juniors, kept separate**
Junior data is fully isolated from senior stats — never blended — per club, an invariant enforced throughout the platform.

**Social media & shareable content**
Turns stats and moments into ready-to-post content so volunteers aren't building graphics by hand:

- **Auto-generated share cards** — branded player "trading cards", milestone cards (centuries, five-fors, debuts, career achievements) and match-result cards, styled in the club's own colours and logo.
- **Card studio** — themes, layouts and visual effect presets, plus audio tracks for animated/video cards.
- **Sponsor placement** — sponsor logos baked into cards, giving sponsors airtime on every post.
- **Milestone boards** — configurable boards that surface recent achievements as social-ready highlights.
- **Draft-and-approve workflow** — posts prepared as drafts with a pending-approval step, so content is reviewed before it goes out.
- **Tracked links** — short, click-tracked links (built-in redirect service) to measure engagement and traffic back to the club site.

**Self-serve onboarding & admin tooling**
"Pick your club" signup with an instantly populated site, per-tenant club admins, a super-admin/platform console, and tenant-scoped auth so one club can never see or edit another's curated content.

**Web + mobile**
A React/Vite web app and an Expo mobile app share a single scorecard view-model, so match views are consistent across platforms.

---

## How it's built (brief)

pnpm monorepo — React + Vite + Tailwind web, Expo mobile, Express + Drizzle + Postgres API, OpenAPI-first. Two data sources: each club's own tables for curated content, and a shared read-only central association database for live stats, filtered per club. Per-tenant theming is token-based; tenants are resolved per request by subdomain/domain.

---

## Status & caveat

Pilot / non-commercial phase. The stats core is mid-migration to the central-read model, self-serve onboarding and admin auth are live, and billing/entitlements are built but dormant. Deep scorecard data is currently sourced for the pilot only — commercial launch depends on securing partner/licence access (PlayHQ partner / Fixtura), so framing stays pilot/non-commercial until then.
