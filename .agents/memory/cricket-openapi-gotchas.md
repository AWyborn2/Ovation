---
name: Cricket club OpenAPI / Orval gotchas
description: Naming collision rules for Orval codegen in this project — what causes TS2308 and how to avoid it.
---

**Rule:** Query parameters on a GET endpoint cause Orval to emit `<OperationIdPascal>Params` in BOTH `api.ts` (Zod) AND `types/<operationId>.ts` (TS interface). The `api-zod` barrel re-exports both, causing TS2308.

**Why:** The project discovered this when `getGradeLeaderboard` had `stat` and `limit` query params — Orval generated `GetGradeLeaderboardParams` in two places and the typecheck failed.

**How to apply:**
- For endpoints where you want query-param filtering, keep params minimal or handle sorting/filtering client-side.
- If you must have query params on a GET, verify the Orval-generated name won't collide before adding them.
- For request bodies: always use entity-shaped names in `components/schemas` (e.g. `StatInput`, not `CreateStatBody`) and `$ref` them — never inline bodies.
- After any spec change, always run `pnpm --filter @workspace/api-spec run codegen` and check for TS errors.
