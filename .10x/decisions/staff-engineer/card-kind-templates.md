# Staff Engineer — card-kind-templates

## Conventions found [CONFIRMED 2026-10-07]

- OpenAPI-first: edit `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`; never hand-edit generated clients.
- Juniors isolation (no junior photos, junior rows first name + initial), fill-in exclusion (`playerId >= 90000`), private-player redaction.
- Tenant data threads into every pack mount through `buildPackData`; `pack-card-mounts.test.ts`, `pack-lint.test.ts` and `pack-coverage-parity.test.ts` guard leaks and registry parity.
- Studio element registry (`lib/studio-elements/registry.ts`) reuses Club Kit parts; `liveRows` binds repeats.
- Tests: vitest (web jsdom, `css: false` — no layout); api vitest with mocked DB; smoke tests behind switches.
- Formatting with Prettier 3.9.6; on Windows run vitest from the package with `NODE_ENV=test`.
- Feature switches follow the `shouldReadCentral` pattern (`api-server/src/lib/tenant.ts`).
