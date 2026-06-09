#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Recreate constraints drizzle-kit can't manage reliably (see the script and
# lib/db/src/schema/cap_register.ts for why). Idempotent and non-interactive.
pnpm --filter @workspace/scripts run ensure-constraints
# Refresh the cap register's cached game counts from current stats so caps
# linked to a player (incl. before recompute-on-link existed) show real games.
# Idempotent: only updates rows whose cached value is out of date.
pnpm --filter @workspace/scripts run reconcile-caps
# Backfill the photo gallery (player_images) from the legacy single-photo
# pointer (players.image_url) so pre-gallery players appear in the gallery /
# per-card pickers. Idempotent: inserts only for players with no gallery row.
pnpm --filter @workspace/scripts run backfill-player-images
