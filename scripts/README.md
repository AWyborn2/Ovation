# scripts/

Maintenance and data scripts for the Ovation monorepo. Run any of them with
`pnpm --filter @workspace/scripts run <name>`; every TypeScript script needs
`DATABASE_URL` and the central-read ones also need `CENTRAL_DATABASE_URL`.

## Guard rails (read first)

`src/lib/cli.ts` is shared by every script that writes to a tenant-scoped table:

- `--tenant=<id>` (or `SEED_TENANT_ID`) is **required** — nothing defaults to
  tenant 1, because that silently writes into the demo club's data.
- `--dry-run` (or `DRY_RUN=1`) previews without writing.
- A non-local `DATABASE_URL` is refused unless `--yes` is passed.

Nothing here ever writes to the central database; the `centralDb` handle is
read-only by construction.

## Recurring (post-merge on Replit — `scripts/post-merge.sh`)

| Script | Purpose |
|---|---|
| `ensure-constraints` | Re-creates constraints/indexes drizzle-kit cannot manage (composite and partial uniques, performance indexes, tenant identity uniques). Also runs in CI after `db push`. |
| `reconcile-caps` | Cap register ↔ stats reconciliation. |
| `backfill-player-images` | Player photo backfill. |

## Central-model tooling (multi-tenant aware)

| Script | Purpose |
|---|---|
| `compare-central-leaderboard` | Proof harness comparing native vs central leaderboards. |
| `diagnose-central-identity` | Read-only central identity diagnostics. |
| `backfill-player-id-map` | Mints the int↔GUID crosswalk for a tenant (`--dry-run`). |
| `seed-tenants`, `seed-mandurah-tenant`, `seed-mandurah-premierships` | Concierge tenant seeding. |
| `topup-clubs` | PCA club branding top-up (`src/data/pca-clubs.ts`; tested). |
| `null-legacy-placeholder-logos` | Clears placeholder logos (`--live` gate). |
| `rebrand-seeded-card-themes` | Rebrands seeded card themes. |

## Tenant #1 (Halls Head) curated seeds and loaders

These carry Halls Head content by design (the demo tenant). They now take
`--tenant` and refuse a non-local database without `--yes`.

| Script | Purpose |
|---|---|
| `seed-honours`, `seed-committee`, `seed-awards`, `load-award-history`, `seed-nav-items`, `seed-card-audio` | Curated content seeds (`seed-card-audio` seeds the platform-wide curated audio library, so it has no tenant argument). |
| `load-master-db`, `load-matches`, `load-juniors-db` | Rebuild tenant #1's stats from the master dumps via `sql/master-etl.sql`, `sql/matches-etl.sql`, `sql/juniors-etl.sql`. Single-tenant by design (banner comments in each SQL file); the dumps are no longer in git — fetch them from object storage before running. |
| `backfill-innings-order`, `backfill-season-snapshots` | Stats-core backfills for tenant #1. |

## Legacy one-offs

`legacy/` holds tenant-blind one-offs kept for provenance only. See
`legacy/README.md` — do not run them against the shared database.

## SQL

`sql/*-migration.sql` are run-once migrations from before the constraints
script existed; `sql/*-etl.sql` are the tenant #1 loaders above.
