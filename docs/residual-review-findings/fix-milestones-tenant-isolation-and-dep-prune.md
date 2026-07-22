# Known residuals — `fix/milestones-tenant-isolation-and-dep-prune`

Accepted at the Residual Work Gate, 22 Jul 2026. Source: `ce-code-review`
(correctness, security, testing, reliability, adversarial — 5/5 reported).
Everything here was reviewed and consciously not fixed on this branch.

## Native stats tables are not tenant-scoped (pre-existing, partially mitigated)

`matches`, `players`, `player_grade_stats`, `player_grade_season_stats`,
`grade_summaries`, `match_player_lines`, `match_opposition_lines`,
`match_hat_tricks`, `imports`, `baseline_adjustments` carry no `tenant_id`.
Per `lib/db/src/schema/_tenant.ts` this is deliberate — they are slated for
replacement by central reads filtered on `club_id`, so a column added now would
be throwaway.

Mitigation landed: `buildMilestones` now throws `NativeStatsUnavailableError`
for any tenant other than #1, and `provision.ts` already sets
`reads_from_central = true` for every tenant it creates.

**Residual:** the guard covers the milestones surface only. Every other native
stats reader still has the original shape — a tenant row inserted outside
`provision.ts` picks up the `reads_from_central` default of `false` and would be
served tenant #1's data. Either extend the same guard to the remaining native
readers, or finish the central-read migration that makes the question moot.

## Test coverage gaps

- No test forces a query failure to prove `optionalSection` degrades to a 200
  with that section omitted, or that a degraded build is not cached.
- No test asserts the body-size ceiling in either direction (a >100kb body is
  rejected; the largest legitimate import-commit body still succeeds).
- No test proves the positive caching behaviour — that a second request inside
  the TTL is served without re-querying.
- The central path (`buildCentralMilestones`) is exercised by the isolation
  suite only for its settings lookup; its milestone items are not asserted.

## Verification gap

The api-server suite is real-DB integration and **was never executed locally** —
no Docker, no local Postgres, no `DATABASE_URL` on this machine. Typecheck,
`vite build`, and the web suite all passed locally; the api-server tests,
including the new `milestones-isolation.test.ts`, run for the first time in CI.
Treat the first CI run as the actual verification of this branch.

## Not investigated

- Billing and entitlements code is live-but-dormant in the running server and
  none of it was touched or assessed here.
- `getTenantConfig` keeps its own 5-minute cache, separate from both the central
  and milestones caches. Nothing invalidates it on a tenant config change except
  `invalidateTenantConfigCache`; whether every admin write path calls it was not
  audited.
