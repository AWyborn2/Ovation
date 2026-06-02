#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Recreate constraints drizzle-kit can't manage reliably (see the script and
# lib/db/src/schema/cap_register.ts for why). Idempotent and non-interactive.
pnpm --filter @workspace/scripts run ensure-constraints
