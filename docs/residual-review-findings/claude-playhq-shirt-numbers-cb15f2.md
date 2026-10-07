# Residual Review Findings — season shirt numbers

Source: multi-persona code review of branch `claude/playhq-shirt-numbers-cb15f2` against the plan `docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md`. Applied fixes landed in `fix(review): apply review findings`. The items below were not applied because each needs a design decision or a larger refactor, not a mechanical fix.

## Residual Review Findings

- P1 — `artifacts/api-server/src/lib/shirt-number-upload.ts:869` — the upload module is ~1,150 lines, mixing parsing, matching, the preview store and the senior commit. Suggested: split into parse, match and preview-store modules and keep `commitSeniorUpload` beside the senior register code. (maintainability)
- P2 — `artifacts/api-server/src/lib/junior-shirt-numbers.ts:656` — the senior and junior upload commits duplicate ~110 lines of the duplicate-policy, carry and warning algorithm. Suggested: a pure `planUploadNumbers(...)` shared by both commits, with table writes kept side-specific (juniors isolation stays intact). (maintainability)
- P3 — `artifacts/api-server/src/routes/players.ts:348` — the profile shirt-number read sits inline in a 1,270-line route file. Suggested: move it into `lib/player-shirt-numbers.ts` as a loader, mirroring the junior profile loader. (maintainability)
- P3 — `lib/db/src/playhq-ingest/shirt-number-sync.ts:213` — if an admin adds a player directly while a held entry for the same person (by PlayHQ id) already exists that season, the held entry can never link because the player's season slot is taken. Suggested: on admin create/edit, match the player's crosswalk participant ids, or merge the held entry into the linked one. (adversarial)
- P3 — player merges keep the keeper's register row even when only the merged-away row has a number, so that number is lost. Suggested: prefer the numbered row on merge. (adversarial, residual)

## Not covered locally

The DB-backed suites (register routes, uploads, juniors, profile, sync, team-list drafts) need Postgres and run only in CI.
