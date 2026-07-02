---
title: Ovation Platform Hardening - Plan
type: fix
date: 2026-07-01
topic: ovation-platform-hardening
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Ovation Platform Hardening - Plan

## Goal Capsule

- **Objective:** Make Ovation's already-built features actually work and look right for any club — not just Halls Head — and prove it on a real second club. Launch-readiness first.
- **Product authority:** Ash (directs outcomes, reviews results not code, approves each phase before the next).
- **Open blockers:** None gating planning. The "M Brown" wrong-merge diagnostic (one query against the central database, credentials held by Ash) is folded in as the first step of the stats phase; the identity fix is designed to handle all three possible causes until that query narrows it. See Outstanding Questions.

---

## Product Contract

### Summary

A hardening pass over the existing platform, sequenced launch-readiness-first: fix stats correctness so every club shows trustworthy numbers, kill the remaining Halls Head brand leaks, close the tenant-isolation gaps, then harden the social studio and refresh the UI. The audit found the studio, onboarding, and theming are ~80% built — the gap is correctness, brand-bleed, and polish, not missing features.

### Problem Frame

The app is a fork of a single-club Halls Head site, mid-transformation into multi-tenant SaaS. The brief framed the work as "rebuild the social studio, rethink onboarding, redo the UI" — but a code audit showed all three are substantially built and tested. What's actually wrong is that a club which *isn't* Halls Head can't yet be trusted or shipped:

- Its stats render wrong — player links are dead (the identity crosswalk was only ever built for Halls Head), some players are impossibly merged (one "M Brown" showing 214 innings), and totals can be another club's data leaking through.
- Its brand leaks — the Halls Head logo and a hard-coded Halls Head background texture still show through.
- Its data isn't fully separated — a few settings tables and captain logins are still single-club global.

So the value at stake is trust: a club site that shows wrong numbers or a rival's logo is unusable, no matter how many features sit behind it.

### Key Decisions

- **Harden, don't rebuild.** The existing social studio (cards in every kind, PNG/GIF/MP4, sponsors, draft-approve, tracked links), the 3-step onboarding wizard, and per-tenant colour/logo theming all exist and are tested. Work targets correctness and polish on top of them.
- **Digital-era data only, this pass.** Fix how the 24 seasons of existing PlayHQ/MyCricket central data render. Merging pre-digital handwritten history is a separate, larger later project.
- **Accuracy over speed on identity.** Include a per-club curation tool (merge/split/rename players) alongside the automated crosswalk, rather than shipping the crosswalk alone. This also fixes display-name quality ("M Brown" → "Michael Brown" becomes a curation action).
- **Richer milestones for central clubs.** Invest to derive career crossings (games/runs/wickets) from central scorecards, rather than limiting central clubs to the smaller centuries-and-five-fors set.
- **Launch-readiness before showcase.** After stats, prioritise brand-leak fixes and isolation (so a real club can onboard safely and look fully its own) ahead of studio polish and UI redesign.

### Actors

- A1. Club admin — a volunteer who runs one club's site: brands it, curates players, approves social content. Never sees or edits another club's content.
- A2. Platform super-admin — provisions and oversees all tenants from the platform console.
- A3. Club viewer — members, players, and supporters who read the club's stats, records, and history.

### Requirements

**Phase 1 — Stats correctness (the trust foundation)**

- R1. Every central-data club has a player identity crosswalk built automatically at provisioning and backfilled for existing tenants, so any player with a stable PlayHQ ID resolves to a correct, clickable, correctly-separated career profile.
- R2. Stat aggregation keys on the stable PlayHQ ID, never on display name. Scorecard lines with no ID still appear in match views by name, but are never rolled into a career total and are not clickable — so two different "M Brown" entries are never merged into one impossible career.
- R3. Club admins have a tenant-scoped curation tool to merge, split, and rename players within their own club, correcting identity and display-name quality where the club knows the truth. Curation never affects another club.
- R4. For central-data clubs, milestone detection covers centuries, five-wicket hauls, and career crossings (games, runs, wickets) derived from central scorecards. Debuts and hat-tricks stay native-data-only. Halls Head keeps its full milestone set.

**Phase 2 — Brand leaks (every club looks fully its own)**

- R5. No Halls Head asset ever renders for another club. The brand resolver never falls back to the Halls Head logo; a club with no logo set gets a neutral placeholder.
- R6. The site background is per-tenant, or a neutral default — replacing the hard-coded Halls Head texture currently forced on every club.
- R7. Social card rendering (trading, milestone, match-result) defaults to the current tenant's brand — colours, logo, club name — not Halls Head constants.
- R8. Per-tenant favicon and page/social metadata (title, Open Graph / share tags) are served from the tenant brand, not a static Halls Head default.

**Phase 3 — Isolation gaps (safe to onboard real clubs)**

- R9. Settings currently stored as single-club global singletons (display and config tables keyed to a fixed id) are tenant-scoped, so each club has its own independent settings.
- R10. Captain logins are tenant-scoped, so captain usernames can't collide or cross clubs (they are globally unique today).
- R11. Isolation tests are extended to cover the newly tenant-scoped settings and captain auth, proving no cross-tenant read or write.

**Phase 4 — Social studio hardening (reliable, on-brand output)**

- R12. The existing card studio reliably produces correct, on-brand output across its current card kinds and export formats (PNG / GIF / MP4) for any tenant — a defect-and-polish pass on the builder, not new capability. Specific defects to be enumerated during planning.

**Phase 5 — UI / design refresh**

- R13. Light and dark mode are fully wired: a working toggle plus OS-preference detection, with a genuinely distinct dark palette (today the dark styles are scaffolding identical to light and never applied).
- R14. The default design language reads as club-neutral — it works for any club's colours and logo rather than looking Halls-Head-specific.

### Key Flows

- F1. New club onboarding to a trustworthy site
  - **Trigger:** A club is provisioned (self-serve signup or platform console).
  - **Actors:** A2, A1, A3
  - **Steps:** Club is picked and provisioned; the identity crosswalk is built as part of provisioning; the site loads showing the club's own correct, clickable stats and its own brand.
  - **Outcome:** Day-one site with trustworthy linked stats and no Halls Head bleed.
  - **Covered by:** R1, R2, R5, R6, R8

- F2. Player identity curation
  - **Trigger:** A club admin opens the curation tool and sees ambiguous, duplicated, or poorly-named players.
  - **Actors:** A1
  - **Steps:** Admin merges duplicates, splits a wrongly-merged entry, or renames "M Brown" to a full name; the club's site, profiles, and cards reflect the correction.
  - **Outcome:** Club-verified player identities, scoped to that club only.
  - **Covered by:** R3

### Acceptance Examples

- AE1. Covers R2. **Given** two scorecard lines "M Brown" with no PlayHQ ID, **when** the club's leaderboard renders, **then** each line shows in its match scorecard by name, neither is clickable, and neither is added to any career total — no merged "300-game" career appears.
- AE2. Covers R4. **Given** a central-data club, **when** a player reaches their 200th game, **then** a career-crossing milestone appears; **but** a hat-trick produces none. **Given** Halls Head (native data), **then** both appear.
- AE3. Covers R5. **Given** a club that has not uploaded a logo, **when** any page or card renders, **then** a neutral placeholder shows — never the Halls Head logo.

### Scope Boundaries

**Deferred for later**

- Pre-digital history merge (handwritten scorebooks, pre-digital honour boards) — a separate, much larger project touching data-entry tooling and cross-era identity matching.
- Native posting to Instagram / Facebook and post scheduling — the studio's real remaining capability gap, but not this effort.
- Billing and entitlements activation — the code exists but stays dormant.
- Custom domains — already a roadmap TODO, not pulled into this pass.
- Mobile (Expo) app changes — not in scope unless a fix is shared through the common view-model.

**Outside this product's identity (for now)**

- Commercialising on scraped scorecard data — governance constraint; framing stays pilot / non-commercial until partner or licence access is secured.

### Dependencies / Assumptions

- The central PCA database is read-only from the app; all central reads funnel through the existing central-queries layer and are guarded by consistency tests.
- `CENTRAL_DATABASE_URL` credentials are held by Ash and are required for the R2/R3 diagnostic (below).
- OpenAPI-first workflow holds: any API change edits the spec then regenerates the client/validators — generated files are never hand-edited.
- Juniors isolation and the fill-in-player exclusion (`player_id >= 90000`) invariants continue to hold per tenant.

### Outstanding Questions

**Deferred to planning**

- "M Brown" root cause (shapes R2/R3): as the first step of the stats phase, run a diagnostic query against the central database to confirm whether the impossible merge is caused by ID-less lines falling back to name-keying, one PlayHQ ID covering several real people, or several IDs for one person. Assumption until then: the fix must handle all three causes. Requires Ash to run the query (central credentials).
- Enumerate the specific social-studio defects behind R12 via a QA pass across the card kinds and export formats.
- Whether Phase 1 is sub-split into separately-approved increments (crosswalk + merge-fix → curation tool → career-crossing milestones) — recommended, given the small-approved-pieces working style.
- The exact look of the neutral default brand/background (R6) and the club-neutral design language (R14) — a design decision for planning.

### Appendix — new feature ideas (react later, not committed)

Candidate future work suggested by what the platform already does; each would be its own brainstorm:

- Sponsor value report — sponsor logos already appear on cards and tracked links already count clicks; turn that into a monthly "your logo appeared on X posts, Y clicks" report to give sponsors proof of value and clubs a retention lever.
- Player self-claim — let a player claim their profile and share their own trading card, driving organic distribution without volunteer effort.
- Weekend auto-recap pack — the roundup/recap engines already exist; auto-assemble a "this weekend" post pack every Sunday for admins to approve.
- Milestone-approach alerts — notify admins when a player is one game / a handful of runs from a milestone, with the card pre-built.
- Awards-night pack — auto-build presentation cards, team-of-the-year, and season records for a club's awards night.
