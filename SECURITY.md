# Security

Ovation holds club members' names, statistics and, for junior competitions, the
names of children. Treat every report seriously.

## Reporting a vulnerability

Email the maintainer directly (see the commit history for the current address)
rather than opening a public issue. Include the affected route or component, a
reproduction, and the impact you believe it has. You will get an acknowledgement
within a few days.

## Scope

- Cross-tenant data exposure of any kind (one club seeing another club's data)
- Authentication and session weaknesses (admin, captain, platform admin)
- Any write to the central association database from the application
- Exposure of private participants (`is_private`) in any public surface

## Practices in this repository

- Central reads are funnelled through `lib/db/src/central-queries.ts` and go
  through a read-only proxy; the stats-core data source fails closed
  (`artifacts/api-server/src/lib/tenant.ts`).
- Tenant isolation is guarded by the `*-isolation.test.ts` suites; extend them
  whenever a read path is touched.
- Dependencies are updated weekly by Dependabot with a one-day cooldown.
