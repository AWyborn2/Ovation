---
name: Per-match milestone fire-once strategy
description: How debut/newCap/century/5-for per-match milestone cards avoid duplicates across re-import and undo/re-import cycles.
---

Per-match milestone detection (after an xlsx match commit) emits four kinds:
debut, newCap, century, fiveFor. Each becomes a `milestone_events` row + a
`social_drafts` row (engine "milestone"), gated on `socialSettings.engineMilestone`
(default OFF). It runs from `runPostCommitSocial` only when a `matchContext` is
passed (per-match path only; CSV path never passes it).

**Fire-once is per-kind, by design — not one uniform mechanism:**

- **debut** — idempotent *structurally*: detection compares a pre-commit
  per-grade game-count snapshot (`snapshotGradeGames(grade)`, captured BEFORE the
  transaction) against who appears in the match. After commit the player shows
  ≥1 game, so a re-import never re-fires. Only fires for cap-register grades
  (A Grade / Female A Grade).
- **newCap** — idempotent via cap-sync: only caps freshly issued by THIS commit's
  `syncCapsFromStats` (now returned in `CapSyncResult.createdCaps`) are eligible.
  Re-running cap-sync on already-capped players issues nothing.
- **century / fiveFor** — NOT structurally idempotent (the same innings re-appears
  on re-import), so they need an **explicit existence check** against
  `milestone_events` keyed by `${boardKey}|${playerId}|${grade}|${season}|${round}`.

**Why the explicit check matters:** `milestone_events` rows PERSIST across an undo
(season rollback only touches stats/caps/orphans, not milestone history). So
undo→re-import would duplicate century/5-for without the existence query. The
detector loads existing match-kind events for the involved players up front and
de-dups against them.

**How to apply:** any new per-match milestone kind that can recur for the same
player+match must add an explicit `milestone_events` existence check; kinds that
are structurally one-shot (cross a threshold once) can rely on the before/after
snapshot. Card payload is opaque `card_input` jsonb — new kinds need a frontend
renderer branch + caption + filename but NO OpenAPI codegen, EXCEPT the shared
`CardKind` enum in openapi.yaml must list every kind (sponsor `cardKinds` filter
is typed from it — omitting a kind breaks the cricket-club typecheck).
