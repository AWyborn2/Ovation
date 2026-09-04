## Summary

<!-- What changed and why, in a few sentences. Link the plan.md section or issue. -->

## Tenant isolation checklist

- [ ] No new read of a tenant-scoped table without `eq(table.tenantId, getTenantId(req))`
- [ ] No new central read outside `lib/db/src/central-queries.ts` (or its split modules)
- [ ] Any new stats read goes through `shouldReadCentral` / `dataSource`, never a raw flag
- [ ] Curated content stays tenant-side (never replaced by central data)

## API contract

- [ ] `lib/api-spec/openapi.yaml` updated and `pnpm --filter @workspace/api-spec run codegen` run (or no API change)

## Test plan

- [ ] `pnpm run typecheck`
- [ ] `pnpm --filter @workspace/cricket-club test`
- [ ] `pnpm --filter @workspace/api-server test` (local Postgres)
- [ ] New or changed behaviour has a test
