---
title: Junior PlayHQ Sync - Plan
type: feat
date: 2026-10-14
topic: junior-playhq-sync
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Junior PlayHQ Sync - Plan

## Goal Capsule

- **Objective:** Let any enabled club's junior teams sync from PlayHQ like its senior teams do — fixtures, team lists with shirt-number cards, results and scorecards, and junior result cards — with junior data kept separate from senior data and from other clubs.
- **Product authority:** Ash (Ovation). Halls Head and its 14 junior teams are the first club and the acceptance case.
- **Open blockers:** None blocking planning. See Outstanding Questions.

---

## Product Contract

### Summary

Juniors becomes a per-club feature of the PlayHQ sync.
For each enabled club, the sync reads that club's junior teams from its own PlayHQ organisation, from the 2026/27 season onward.
It brings in junior fixtures, selected sides as junior team lists, and results and scorecards wherever PlayHQ publishes them.
It creates junior players as they first appear, so the juniors shirt-number register can match them.
Junior team-list cards show shirt numbers, and junior result cards are drafted for review.

### Problem Frame

Halls Head wants its junior season to appear in the app the way its senior season does, and other clubs will want the same.

Today the PlayHQ sync deliberately discards junior grades at every step, from the scraper through ingest to every downstream reader.
The junior match history in the app came from a one-off bulk load and is not kept up to date.
So there are no junior fixtures, team lists or team-list cards.
Junior results exist only for seasons that were bulk-loaded.
New junior players never reach the app, which also means the juniors shirt-number register cannot match them: a club uploading this season's junior numbers sees most new players come back unmatched.

### Key Decisions

- **Separate junior pipeline.** Junior fixtures, team lists, results and players get junior-only stores, screens and routes. They never reuse senior fixture, team-list or stats storage. This keeps the juniors isolation rule (junior tables, juniors routes only, never blended) for every club.
- **Lift the "juniors excluded at ingest" rule, for enabled clubs only.** The sync captures junior grades only for clubs with juniors switched on. For all other clubs, junior grades are still dropped exactly as today.
- **Gated by plan, switched on by the platform admin.** Juniors is a plan entitlement, ready for when billing goes live. While billing is dormant, the platform admin switches juniors on per club, so no club gets it by default.
- **This season onward.** The sync owns 2026/27 and later. Seasons already loaded stay exactly as they are, which keeps the one-ingestion-method-per-grade-and-season rule.
- **Per-grade scoring.** Grades where PlayHQ publishes scorecards get results, stats and result cards. Unscored grades get fixtures, team lists and team-list cards only.
- **Club-controlled naming.** Each club chooses how junior players are named on public pages and social cards, for example full name, first name and initial, or first name only. Admins can also override PlayHQ's private flag for individual players.
- **Club-controlled publishing per junior team.** For each junior team, the club chooses whether its cards always need admin approval or follow the club's auto-post settings.

### Actors

- A1. Platform admin — switches juniors on per club while billing is dormant.
- A2. Club admin — picks the naming style, the publishing rule per junior team and privacy overrides; reviews junior cards; manages junior shirt numbers.
- A3. PlayHQ sync — captures, loads and projects an enabled club's junior grades.
- A4. Public visitor / social audience — sees junior fixtures, team lists, results and cards.

### Requirements

**Enablement**

- R1. Juniors is a plan entitlement. While billing is dormant, a club gets junior sync only when the platform admin switches it on for that club.
- R2. A club without juniors switched on sees no change: its junior grades are still dropped at ingest, and nothing junior is projected for it.
- R3. A club's juniors area appears once the club has junior data, as it does today.

**Capture and identification**

- R4. For each enabled club, the sync captures that club's junior teams from its own PlayHQ organisation, from the 2026/27 season onward.
- R5. Junior grades are recognised across associations' naming styles, for example PCA's "Year 4 Gold" and WA's own labels.
- R6. A club's grades that cannot be classified as junior or senior are reported to the platform admin and never guessed.
- R7. The sync schedule covers junior matches for enabled clubs, alongside senior matches.

**Junior data**

- R8. Upcoming junior games appear as junior fixtures in the club's juniors area and admin.
- R9. A junior team's selected side in PlayHQ becomes that fixture's junior team list. An admin-saved junior team list is never overwritten by the sync.
- R10. Finished junior matches with published scorecards flow into the club's junior match pages, stats and player profiles.
- R11. Junior players are created the first time they appear for the club, keyed on their PlayHQ identity, so later uploads and the juniors shirt-number register can match them.
- R12. Junior seasons already in the app before 2026/27 are not changed by the sync.
- R13. Junior and senior data are never blended. A player who appears in both keeps a separate junior record, linked to their senior record only through the existing senior link.
- R14. One club never sees or edits another club's junior data.

**Display and naming**

- R15. Each club chooses a naming style for junior players on public pages and social cards. Admins and admin screens always see full names.
- R16. PlayHQ's private flag withholds a junior player's name publicly by default. A club admin can override it per player, and the admin screen shows a warning while the override is set.

**Social**

- R17. Each junior team list produces a junior team-list card showing players' shirt numbers for the season, using the club's naming style.
- R18. Each finished, scored junior match can produce a junior result card. Unscored grades produce no result cards.
- R19. For each junior team, the club chooses whether its cards always need admin approval or follow the club's auto-post settings. The default is admin approval.
- R20. Junior cards come only from junior data and are labelled as junior content, separate from senior cards.

### Key Flows

- F1. Club enables juniors
  - **Trigger:** Platform admin switches juniors on for a club.
  - **Actors:** A1, A3
  - **Steps:** The next sync captures that club's junior grades. Unclassified grades are reported. Fixtures, team lists and any finished scored matches for 2026/27 are loaded. Junior players are created. The juniors area appears.
  - **Covered by:** R1, R3–R8, R11
- F2. Match week
  - **Trigger:** A junior team is named in PlayHQ before its game.
  - **Actors:** A3, A2
  - **Steps:** The sync copies the side into the junior team list. A junior team-list card is drafted with shirt numbers and the club's naming style. It is held for approval, or follows auto-post, according to that team's setting.
  - **Covered by:** R9, R15–R17, R19
- F3. After the game
  - **Trigger:** A scored junior match finishes and PlayHQ publishes the scorecard.
  - **Actors:** A3, A2
  - **Steps:** The match, batting, bowling and roster land in the junior match pages and stats. A junior result card is drafted and routed by the team's publishing setting.
  - **Covered by:** R10, R13, R18–R20
- F4. Shirt numbers for new juniors
  - **Trigger:** A club uploads its junior shirt-number sheet after the sync has run.
  - **Actors:** A2
  - **Steps:** Players created by the sync match by PlayHQ identity, so their numbers are assigned instead of coming back unmatched.
  - **Covered by:** R11

### Acceptance Examples

- AE1. **Covers R1, R2.** Given billing is dormant and juniors is off for a club, its junior grades are dropped at ingest and its juniors area shows no new data. After the platform admin switches juniors on, the next sync loads that club's 2026/27 junior fixtures.
- AE2. **Covers R12.** Given Halls Head's 2025/26 junior matches came from the one-off load, after juniors is enabled those 2025/26 matches are unchanged and only 2026/27 onward comes from the sync.
- AE3. **Covers R16.** Given a junior flagged private in PlayHQ and a club naming style of first name and initial, that player shows as withheld on public pages and cards. When an admin overrides the flag, the player shows as "Ollie G" and the admin screen warns that a private player is being named.
- AE4. **Covers R18.** Given a Year 4 grade with no published scores and a Year 9 grade with scorecards, the Year 9 match produces a result card and stats, while the Year 4 match produces a team-list card only.
- AE5. **Covers R19.** Given Year 10-11 is set to auto-post and Year 5 Gold to admin approval, a Year 10-11 team-list card follows the club's auto-post window, while the Year 5 Gold card waits in the queue for approval.
- AE6. **Covers R13, R14.** Given a Year 10-11 player who also plays senior grades, their junior innings never appear in senior stats and their senior innings never appear in junior stats. Another club's admin cannot see either.

### Scope Boundaries

- Re-pulling or replacing junior seasons loaded before 2026/27.
- Juniors for clubs not on PlayHQ sync.
- Turning billing or entitlement enforcement on.
- Junior statistics records, honour boards or milestones beyond what the existing juniors area already derives from junior match data.
- Commercial use of scraped junior data (see Dependencies / Assumptions).

### Dependencies / Assumptions

- The juniors shirt-number register (`docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md`) is in place; R11 is what lets it match new players.
- Junior data from PlayHQ is scraped, so it is used for the pilot only and not commercialised, per the project's data-governance rule. This applies with extra care because the data concerns children.
- PlayHQ publishes junior fixtures and named sides for the junior grades in the same way it does for senior grades. Scorecard availability varies by grade.
- The PlayHQ Profile ID in a club's participant export is assumed, not verified, to be the same identifier the sync uses for junior players. Matching does not rely on that assumption without a fallback.

### Outstanding Questions

**Deferred to Planning**

- How junior grades are recognised across associations, and where unclassified grades are reported.
- How junior fixtures and team lists are stored and edited, keeping juniors isolation, and how the existing junior match pages read them.
- How the sync schedule weights junior match days against senior ones within the hourly budget.
- How the naming style and privacy override apply consistently to every public junior surface, including existing junior pages.
- How junior cards slot into the social queue and auto-post rules per team.

### Sources / Research

- `artifacts/api-server/src/lib/playhq-ingest.ts` — `dropJuniorGrades` removes junior grades on ingest.
- `.claude/skills/playcricket-stats-scraper/harness.js` — the harness defaults to `includeJuniors: false` and filters grades by its junior pattern.
- `lib/db/src/playhq-ingest/load.ts`, `project.ts`, `central-project.ts`, `cadence.ts` — each downstream step reads senior grades only.
- `lib/db/src/schema/juniors.ts` and `scripts/sql/juniors-etl.sql` — junior tables, loaded today only by the one-off load.
- `artifacts/api-server/src/routes/juniors-tenant-isolation.test.ts` — junior data is scoped by club, independent of central reads.
- `artifacts/api-server/src/routes/juniors-shirt-numbers.ts` — junior routes refuse clubs with no junior data.
- `artifacts/api-server/src/lib/entitlements.ts` — plan entitlements, dormant until billing is enabled.
- `docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md` — the sync this extends; records "juniors are excluded at ingest" as the rule now being lifted for enabled clubs.
