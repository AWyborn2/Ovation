# Review — social-auto-queue-criteria (2026-10-15)

Phase 5 (QA + Security) over the branch `claude/social-auto-queue-criteria` against plan `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md`.

## QA

**Acceptance examples**

| AE  | Covered by                                                                                                                                                                                                                                        | Result |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AE1 | `posting-plan-ae1-sweep.test.ts` (default table → ~5–8 cards a round), `draft-sweep.test.ts`                                                                                                                                                      | pass   |
| AE2 | `junior-social.db.test.ts` (junior Big Moment at the 50 bar; junior team list per row grades), `round-sets.test.ts` (combined team-list carousel)                                                                                                 | pass   |
| AE3 | `central-achievements.test.ts` (feats → `bigMoment` cards; off-plan grade makes none)                                                                                                                                                             | pass   |
| AE4 | `routes/central-projection.test.ts` (balls + fielding → `central.match_feats`; hat-trick and five catches), `feats.test.ts`                                                                                                                       | pass   |
| AE5 | `round-sets.test.ts` (separate junior set keyed `…:junior`; combined appends)                                                                                                                                                                     | pass   |
| AE6 | `posting-slots.test.ts`, `auto-publish.test.ts`, `junior-publishing.test.ts` (auto / approval / untraceable team — fail closed)                                                                                                                   | pass   |
| AE7 | `auto-queue-release.db.test.ts` (20 open grade-leader drafts dismissed, posted one kept, publications cancelled, teams reset, second run no-op)                                                                                                   | pass   |
| AE8 | `__tests__/posting-plan.test.tsx` (default table on first visit, combined/separate reveal and hide, runs bar 50/100 saved, milestones no juniors, no "both", `version: 2` sent), `pack-render*.test.ts` + `club-kit.test.ts` (junior = club look) | pass   |

**Suites.** Web 173 files / 2,029 tests; lib/db 38 / 479; scorecard 20 / 547; API full run on local Postgres (status.md records the count). Typecheck clean for both apps; Prettier 3.9.6 and eslint clean on changed files.

**Edge cases checked by hand (code reading).**

- A junior card that names no team (`juniorTeams` empty) never auto-publishes, even with the calendar on.
- A refreshed draft whose input became junior keeps `sourceMatchIsJunior = true`; it never reverts to senior.
- A non-central club cannot save a round-packaged results/ladder/leaderboard row (400) and the editor disables those options.
- A hat-trick across two overs by the same bowler counts; one split by a wide or no-ball does not (legal deliveries only); a run-out never credits the bowler.
- Re-projecting a match replaces its feats rather than duplicating them.

**Not verified in a browser.** The Posting Plan editor and the junior-card look were verified through the test suites only (no Chromium in this worktree). Recommend a quick look at Social Studio → Posting Plan and one junior card after republishing.

**Open.** Harness-side ball fetching for played matches was verified through the cadence tests and loader path, not with a captured production dump (plan U10 execution note). The runbook's step 6 covers the first real run.

## Security

- **Tenant isolation.** Every new read and write is tenant-scoped: `central.match_feats` is read with `club_id` filters through `central-queries`; junior Big Moments, release SQL checks and publishing gates key on `tenant_id`. The release SQL is cross-tenant by design (a one-off platform step run by Ash).
- **Privacy.** Private central players are excluded from feats reads; withheld junior players withdraw their cards; opposition juniors are never named. Junior cards carry only `ageGroup` and `teamName` in `juniorTeams` (no participant ids).
- **Fail-closed publishing.** `juniorDraftMayAutoPublish` requires an explicit `auto` for every team named; unknown teams and missing settings block. The release SQL resets every team to `approval` so the new meaning of `auto` needs a fresh opt-in.
- **Projector scope.** The projector role can insert/delete on `central.match_feats` only; truncate revoked; the app's read-only pool cannot write it (`PROJECTOR_WRITABLE` guard test).
- **Input validation.** `PostingPlan` version 2 is validated by the OpenAPI/Zod schema and `invalidPostingPlan` (packaging, junior rows, runs bar); the editor cannot send "both".
- **Removed surface.** `POST /social-roundups` and the `gradeLeader` card-set generator are gone (less admin-triggered DB load). No new endpoints.
- **No secrets** in the diff; connection strings and the local test DB are not committed.

**Verdict:** ship. No blocking findings.
