# Staff Engineer — card-kind-templates

## Conventions found [CONFIRMED 2026-10-07]

- OpenAPI-first: edit `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`; never hand-edit generated clients.
- Juniors isolation (no junior photos, junior rows first name + initial), fill-in exclusion (`playerId >= 90000`), private-player redaction.
- Tenant data threads into every pack mount through `buildPackData`; `pack-card-mounts.test.ts`, `pack-lint.test.ts` and `pack-coverage-parity.test.ts` guard leaks and registry parity.
- Studio element registry (`lib/studio-elements/registry.ts`) reuses Club Kit parts; `liveRows` binds repeats.
- Tests: vitest (web jsdom, `css: false` — no layout); api vitest with mocked DB; smoke tests behind switches.
- Formatting with Prettier 3.9.6; on Windows run vitest from the package with `NODE_ENV=test`.
- Feature switches follow the `shouldReadCentral` pattern (`api-server/src/lib/tenant.ts`).

## Phase 2 standards for this feature (2026-10-07)

- Reuse, don't fork: editor shell/canvas/history, `renderFreeLayers`, element registry, `planCardSet`, revisions, `shouldReadCentral` switch pattern.
- Shared code in `lib/scorecard` only; web and api import it. No duplicate document types in apps.
- Every new layer property threads through: shared types → renderer → editor document helpers → OpenAPI schema (adjustments stays free-form) → tests.
- Byte-identity guard: existing pack drafts must render unchanged (extend `adjustments.test.ts`).
- Leak guards before retirement: template lint + `pack-card-mounts.test.ts` extended (U10).
- Escape all token values; never trust a document to enforce juniors/private rules.
- Switch-off path must be exercised by tests in every touched pipeline function.
- Migration `0035_kind_templates.sql`: additive, idempotent, snapshot + journal; hand SQL to Ash.
- Cross-cutting: tenant isolation on every new route; structured logs for warnings renders (kind, size, reason, duration) for SRE.
