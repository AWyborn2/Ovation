## Residual Review Findings

Review run: `20260721-055154-4c151c1c` | Branch: `feat/design-packs-auto-draft` | Plan: `docs/plans/2026-07-20-001-feat-design-packs-auto-draft-plan.md`

### Applied in review-fix commit

- **F1 (P0):** Cross-tenant junior data leak — added tenantId filter to sweep query and loadJuniorMatchDetail
- **F2 (P0):** Senior/junior match ID collision — added sourceMatchIsJunior to dedupe index and upsert lookup
- **F6 (P1):** Unreset ensuredTenants cache in tests — exported \_resetEnsuredTenants, called in beforeEach
- **F7 partial (P2):** ensurePackTemplates GET handler — wrapped in try-catch so failure doesn't block listing

### Filed as GitHub Issues

- **P1** `match-summary-drafter.ts:342` — N+1 query storm in match-summary drafter ([#34](https://github.com/AWyborn2/Ovation/issues/34))
- **P1** `match-summary-drafter.test.ts:1` — Drafter tests never call real exported functions ([#35](https://github.com/AWyborn2/Ovation/issues/35))
- **P2** `design-packs.ts:80` — ensurePackTemplates needs unique DB index ([#36](https://github.com/AWyborn2/Ovation/issues/36))
- **P2** `match-summary-drafter.ts:118` — Junior isolation boundary violated ([#37](https://github.com/AWyborn2/Ovation/issues/37))
- **P2** `match-summary-drafter.ts:97` — getPrivateIds loads all private participants globally ([#38](https://github.com/AWyborn2/Ovation/issues/38))
- **P2** `share-card.ts:2034` — Pack variant renderers duplicate ~100-130 lines each ([#39](https://github.com/AWyborn2/Ovation/issues/39))
- **P2** `match-summary-drafter.ts:95` — getPrivateIds/splitScores reimplemented instead of imported ([#40](https://github.com/AWyborn2/Ovation/issues/40))
- **P2** `match-summary-drafter.ts:355` — Unchecked as any / as unknown casts ([#41](https://github.com/AWyborn2/Ovation/issues/41))
- **P2** `match-summary-input.test.ts:1` — matchToSummaryInput primary branch untested ([#42](https://github.com/AWyborn2/Ovation/issues/42))
- **P2** `social-drafts.ts:160` — POST /social-drafts/sweep has zero test coverage ([#43](https://github.com/AWyborn2/Ovation/issues/43))

### Not filed (human-owner or advisory)

- **F3 (P1):** Re-ingest upsert overwrites approved/posted drafts — requires product decision on re-ingest behavior
- **F15 (P3):** upsertDraft returns 'drafted' for both insert and update — advisory, user's discretion
