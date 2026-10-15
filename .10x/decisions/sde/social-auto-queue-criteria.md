# SDE — social-auto-queue-criteria

Plan: `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md`. Branch `claude/social-auto-queue-criteria`. ADRs 004–006.

## Built (2026-10-15)

### Milestone A — model and gates (U1, U2; T1.1–T2.4)

- `lib/scorecard/src/posting-plan.ts` rewritten as **version 2**: rows `results` ("Match result"), `bigMoments` ("Big Moment"), `milestones`, `debuts`, `gameDay`, `teamLists`, `clubLeaderboards`, `ladders`; packaging `individual | round` (no "both"); per-row `juniors?: "combined" | "separate"` (default separate); `bigMoments.juniorRunsBar: 50 | 100`; `defaultPostingPlan(central)`; `postingStyles(central)`; `rowHasJuniors`, `rowJuniorPackaging`; `invalidPostingPlan` rejects unsupported packaging, central-only round on a non-central club, juniors on rows without junior data, a bar other than 50/100; `normalizePostingPlan` returns the code default for anything that isn't version 2 (ADR-004, no legacy derivation). `isJuniorGradeLabel` also matches "Year 9", "Year 10-11".
- API `lib/posting-plan.ts`: `DraftingGates` for v2 (`resultsMatch`, `resultsGrade`, `achievement(kind, grade, junior)`, `juniorRunsBar`, `juniorsAny(row)`, `juniorPackaging(row)` …); `loadDraftingGates` always resolves the club's central flag. Automatic grade-leader round-up drafting removed from the sweep and post-commit.
- Junior engines read row grades and set `junior: true` + `juniorTeams: [{ageGroup, teamName}]` on every junior card/carousel; a data refresh sets `sourceMatchIsJunior` when the input is junior.
- `engines/round-sets.ts`: fixture rounds grouped by audience; combined packaging appends junior fixtures/results to the senior carousel, separate makes a second `…:junior` keyed set; team-list rounds include junior-sync team lists; weekend wrap includes junior results. Junior modules are lazy-imported so mocked-DB carousel tests keep working.
- **Deviation:** `juniors` defaults to "separate" (the plan's text said combined in one place); separate is the safer default for publishing and matches the review decision.

### Milestone B — data (U10, U3; T10.1–T3.4)

- `playhq-ingest/cadence.ts`: `HarnessPlan.balls: "none" | "since"`; matchday, dayafter and catchup plans fetch balls.
- `playhq-ingest/feats.ts`: pure detector — hat-trick = three consecutive legal deliveries by one bowler in one innings each credited to the bowler (bowled, caught, caught & bowled, lbw, stumped, hit wicket), once per innings; five catches = `total_catches >= 5`. 12 fixture tests.
- `central-schema/match_feats.ts` + DDL/grants in `scripts/sql/central-projector.sql`; `central.match_feats` added to `PROJECTOR_WRITABLE`; projector loads balls + fielding per innings and writes feats delete+insert per match (`ProjectSummary.feats`).
- `central/social-achievements.ts`: `hatTrick` / `fiveCatches` achievements from `central.match_feats` (private players excluded).

### Milestone C — Big Moment and junior publishing (U4, U5; T4.1–T5.2)

- Central achievements emit `bigMoment` cards for hat-tricks ("HAT-TRICK") and five catches ("N CATCHES"); centuries and five-fors go through the Big Moment gate.
- `engines/junior-big-moments.ts`: junior centuries (bar 50 or 100) and five-fors from synced junior data, junior naming, withheld players withdraw an existing card.
- `junior-publishing.ts`: `juniorDraftMayAutoPublish(draft, publishing)` fails closed — a junior-marked draft publishes on its own only when it names at least one team and every team is `auto`. Used by `posting-slots.ts` dispatch and `publishing/auto-publish.ts` candidates (ADR-006).
- **Deviation:** the promotion guard (`juniorAutoPostClear`) was left as is — promotion to Ready is not Meta publishing; the fail-closed gate sits where publishing happens.

### Milestone D — retirement, editor, look (U6–U8; T6.1–T8.2)

- `lib/scorecard/src/retired-kinds.ts` (`RETIRED_CARD_KINDS` = gradeLeader, tradingCard, countdown). Removed: kind-picker options (Studio tiles derive from them), the Trading cards page/tab/nav/redirects, the grade-leader carousel source, the Round-up button and `/social-roundups` route + `RoundUpInput`, `generateRoundUpDrafts` and its helpers, the `gradeLeader` card-set generator (`GenerateCardSetBody.kind` is `matchSummary` only). Season recaps still make their champion `gradeLeader` cards (the plan keeps them). Renderers, pack designs and caption templates for the retired kinds stay so posted cards render.
- Posting Plan editor v2: junior age groups in the picker on rows with junior data; "Juniors" combined/separate select on a carousel row with a junior grade on; "Junior runs bar" select on Big Moment when a junior grade is on; the note on junior auto-publishing links to `/admin/settings/junior-matches`; no "Keep my current settings". `rowSentence` says "juniors in their own carousel" / "in the same carousel".
- Junior look: `JUNIOR_PANEL` and the junior force removed from pack tokens (`resolvePackTokens`, `rootStyle`), Club Kit palette no longer takes a juniors slot, `juniorThemeFromBrand` is the brand theme, the junior match-summary chrome uses the club's scorecard colours, `--juniors-accent` follows the club's primary colour, the branding admin no longer offers a juniors colour (the stored column stays, unread by the junior surfaces). Honours display `--club-accent` now follows the primary colour too.
- **Deviation / leftover:** `brandDefaultTokens` in "pack's own look" mode still seeds the panel from `juniorsColour` (that is a panel-colour slot, not a junior look). Left alone to keep the pack-parity digests; a follow-up could rename the slot. The junior parity digests were regenerated: a junior card now renders byte-identically to the brand-only scenario.
- `rootStyle(tokens, junior, …)` and `resolvePackTokens({ junior })` keep their `junior` parameter for call-site symmetry; it no longer changes the result.

### Milestone E — release (U9; T9.1–T9.2)

- `scripts/sql/auto-queue-release.sql` (idempotent): cancel scheduled/held publications of open retired-kind drafts, dismiss those drafts, reset every junior team to `approval` keeping the map's shape. DB test `lib/auto-queue-release.db.test.ts` (20 open + 1 posted grade-leader drafts, a kept kind, a second run changes nothing).
- Runbook `docs/runbooks/meta-publishing.md` §3b (projector SQL before republish, read-only list of `auto` teams, republish, release SQL, feats backfill, balls check). AGENTS.md, CLAUDE.md, CONCEPTS.md updated.

## Verified (2026-10-15)

- Typecheck: api-server and cricket-club clean; libs rebuilt.
- Web suite: 173 files / 2,029 tests green. lib/db: 38 files / 479 green. Scorecard: 20 files / 547 green.
- API suite on local Postgres 55433: see status.md (full run after Milestone D).
- OpenAPI codegen regenerated and committed; drizzle drift: no new migration (this feature adds none).
- Prettier 3.9.6 and eslint on every changed file: clean (two pre-existing react-hooks warnings in `use-theme-style.ts`).

## Tech debt noted

- `social_settings` legacy columns (`engine_*`, family switches, round-schedule modes) are still mirrored from the plan for older readers; the reader guard test keeps new code off them.
- "Pack's own look" panel slot is still fed by `juniors_colour` (see above).
- Trading-card renderer/constants (`components/trading-card/*`) remain for posted cards; delete once no posted trading cards need re-rendering.
