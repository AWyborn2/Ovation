#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply the reviewed migrations in lib/db/migrations (plan.md §5.4). The first
# run on a database that was built with `drizzle-kit push` baselines it at 0000
# and runs the reconcile migration; afterwards each run applies only new files.
# Non-interactive, never prompts.
pnpm --filter @workspace/db run migrate
# Read-only assertion that every constraint/index the migrations own exists.
pnpm --filter @workspace/scripts run ensure-constraints
# Refresh the cap register's cached game counts from current stats so caps
# linked to a player (incl. before recompute-on-link existed) show real games.
# Idempotent: only updates rows whose cached value is out of date.
pnpm --filter @workspace/scripts run reconcile-caps
# Backfill the photo gallery (player_images) from the legacy single-photo
# pointer (players.image_url) so pre-gallery players appear in the gallery /
# per-card pickers. Idempotent: inserts only for players with no gallery row.
pnpm --filter @workspace/scripts run backfill-player-images
