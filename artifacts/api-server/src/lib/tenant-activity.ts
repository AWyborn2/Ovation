import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { env } from "../config";

/**
 * Advance `tenants.last_active_at` when a club admin acts on their tenant — the
 * "is this club being managed?" signal the platform health dashboard reads. The
 * write is a best-effort side effect on the club-admin auth path (`requireAdmin`
 * only, never the shared `resolveAdmin` helper, which also serves optional-admin
 * reads): never awaited, never allowed to fail or delay the request it rides on.
 *
 * The throttle is an in-process guard (tenant id → last-write epoch ms), so no
 * DB read is needed to decide whether to write. On process restart the guard is
 * empty, so the first admin request per tenant writes once and repopulates it —
 * `last_active_at` may then advance slightly more often than the window right
 * after a restart, which is negligible.
 */

/** Default throttle window: at most one activity write per tenant per 15 min. */
export const DEFAULT_THROTTLE_MS = 15 * 60 * 1000;

/** Floor for a configured window; below this the default is used instead. */
export const MIN_THROTTLE_MS = 60 * 1000;

/** Last-write epoch ms per tenant id — the in-process recently-touched guard. */
const lastWriteByTenant = new Map<number, number>();

/**
 * Resolve the throttle window from `TENANT_ACTIVITY_THROTTLE_MS`, defensively: a
 * non-numeric, NaN, zero, negative, or below-floor value falls back to the
 * 15-min default so a misconfiguration can never collapse the throttle into a
 * per-request write.
 */
export function resolveThrottleMs(raw: string | undefined): number {
  if (raw == null) return DEFAULT_THROTTLE_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_THROTTLE_MS) return DEFAULT_THROTTLE_MS;
  return n;
}

/**
 * The in-process guard's decision + bookkeeping: return true (and record `nowMs`
 * as the tenant's last-write time) when a write should happen, false when still
 * within the window. Claiming the window before the caller issues its async
 * write means concurrent requests in the same tick produce at most one write.
 * Pure over the module-level guard map plus its args, so the throttle is
 * unit-testable without a database.
 */
export function claimActivityWindow(tenantId: number, nowMs: number, throttleMs: number): boolean {
  const last = lastWriteByTenant.get(tenantId);
  if (last !== undefined && nowMs - last < throttleMs) return false;
  lastWriteByTenant.set(tenantId, nowMs);
  return true;
}

/**
 * Throttled, best-effort advance of `tenants.last_active_at` for a tenant. Safe
 * to call on every `requireAdmin`-guarded request: the guard suppresses
 * re-writes within the window and the write is fire-and-forget with errors
 * swallowed, so the auth request it rides on never blocks or fails because of it.
 */
export function touchTenantActivity(tenantId: number): void {
  const now = Date.now();
  const throttleMs = resolveThrottleMs(env.TENANT_ACTIVITY_THROTTLE_MS());
  if (!claimActivityWindow(tenantId, now, throttleMs)) return;
  void db
    .update(tenantsTable)
    .set({ lastActiveAt: new Date(now) })
    .where(eq(tenantsTable.id, tenantId))
    .catch(() => {
      // Best-effort: never fail or delay the auth request. A transient write
      // failure just means last_active_at lags at most one throttle window; the
      // guard stays set so we don't hammer a struggling DB on every request.
    });
}
