# Engineering Manager — social-auto-queue-criteria

## Phase 3 task breakdown (2026-10-15)

Tasks are half a day or less. IDs are `T<unit>.<n>`; unit IDs match the plan (U1–U10). Estimates in half-days (hd). Goal: one PR to `main`, CI green, mergeable.

### Milestone A — model and gates (U1, U2)

| Task | Description                                                                                                                                                          | Est | Depends on |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------- |
| T1.1 | Posting Plan v2 rows, packaging `individual\|round`, junior options, junior runs bar, `defaultPostingPlan(central)`, styles redefined; remove derivation             | 2   | —          |
| T1.2 | `normalizePostingPlan` v2-only, `invalidPostingPlan` rules, `postingPlanToLegacy` for bigMoments; tests                                                              | 1   | T1.1       |
| T2.1 | API `resolvePostingPlan`/`draftingGates` v2-only; drop `legacyGates`, grade-leader gates; `bigMoment`/`juniorPackaging` gates; delete equivalence test; readers test | 1   | T1.2       |
| T2.2 | Sweep, post-commit, social-drafts: stop round-up grade-leader drafting; recap untouched                                                                              | 1   | T2.1       |
| T2.3 | Junior sweep + junior team-list engine read row grades (`rowAllows`), set `junior` + `juniorTeams`                                                                   | 1   | T2.1       |
| T2.4 | Round engines: combined/separate junior carousels with markers and separate cover groups; tests                                                                      | 2   | T2.1       |

### Milestone B — data (U10, U3)

| Task  | Description                                                                     | Est | Depends on |
| ----- | ------------------------------------------------------------------------------- | --- | ---------- |
| T10.1 | `HarnessPlan.balls` `"none"\|"since"`; cadence plans; cadence tests             | 1   | —          |
| T10.2 | Harness/loader: verify balls fetched and loaded before projection; runner tests | 1   | T10.1      |
| T3.1  | `central-schema/match_feats.ts`; DDL + grants in `central-projector.sql`        | 1   | —          |
| T3.2  | Pure detector `feats.ts` + fixture tests (hat-trick rules, five catches)        | 1   | —          |
| T3.3  | Projector writes feats (delete+insert per match); projection DB test            | 1   | T3.1, T3.2 |
| T3.4  | `central-queries` feats read for a club's recent matches (private excluded)     | 1   | T3.1       |

### Milestone C — Big Moment and junior publishing (U4, U5)

| Task | Description                                                                                             | Est | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------- | --- | ---------- |
| T4.1 | Central achievements: century/five-for via `bigMoment` gate; feats → `bigMoment` cards with keys        | 1   | T2.1, T3.4 |
| T4.2 | Native path (`match-milestone-detector`, `post-commit-social`) uses the same gate                       | 1   | T2.1       |
| T4.3 | Junior Big Moments (runs bar, five-for), junior markers, naming, skip withheld; tests                   | 1   | T2.3       |
| T5.1 | `juniorDraftMayAutoPublish` fail-closed + `juniorAutoPostClear` twin; agreement test                    | 1   | T2.3       |
| T5.2 | Dispatch and auto-publish candidates use the gate; privacy re-check (re-render or hold + notify); tests | 2   | T5.1       |

### Milestone D — retirement, editor, look (U6, U7, U8)

| Task | Description                                                                                                  | Est | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------ | --- | ---------- |
| T6.1 | Remove kind-picker/studio/descriptor options; delete Trading cards page, nav, redirects, link                | 1   | T2.2       |
| T6.2 | Remove grade-leader card-set source; openapi (generate kind, countdown override) + codegen; API routes       | 1   | T6.1       |
| T7.1 | openapi `PostingPlan` v2 + codegen; save route passes central flag                                           | 1   | T1.2       |
| T7.2 | Editor: rows, junior grades in picker, combined/separate select, junior bar select, auto-publish note; tests | 2   | T7.1       |
| T8.1 | Remove junior palette override in pack-render and share-card theme; scorecard inputs; tests                  | 1   | —          |
| T8.2 | `--juniors-accent` follows primary; remove branding fields; tests                                            | 1   | T8.1       |

### Milestone E — release (U9)

| Task | Description                                                                                                         | Est | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------- | --- | ---------- |
| T9.1 | `scripts/sql/auto-queue-release.sql` (dismiss retired, cancel pubs, reset team modes) + local idempotency test      | 1   | T2.2, T5.1 |
| T9.2 | Runbook deploy order and checks; AGENTS.md, CLAUDE.md, CONCEPTS.md                                                  | 1   | all        |
| T9.3 | Full verification: both suites, lib tests, typecheck, codegen/migration drift, prettier/eslint; PR; CI green; merge | 1   | all        |

**Sequencing.** A (T1 → T2) first; B in parallel with T2; C after A+B; D after A; E last. Critical path: T1.1 → T2.1 → T2.4 → T5.2 → T9.3.

**Risks / unknowns.** Harness ball fetch behaviour (T10.2) is the main unknown; detector tests are fixture-only so they don't block. Combined-carousel cover layout (T2.4) may need a scorecard view-model tweak.
