/**
 * The card kind templates release switch (plan 2026-10-07-002, KTD18, ADR-003).
 *
 * While a tenant is not switched on, draft creation, lazy template creation,
 * the kind template API and the new Studio surfaces stay on design packs. The
 * switch is the `KIND_TEMPLATES` environment variable: "all", or a
 * comma-separated list of tenant ids; unset means off for everyone. Turning
 * it on is a release step taken only after the starter contract test passes.
 */
import { env } from "../config";

/** Whether `tenantId` uses card kind templates. */
export function kindTemplatesEnabled(tenantId: number): boolean {
  const value = env.KIND_TEMPLATES()?.trim();
  if (!value) return false;
  if (value === "all") return true;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .some((s) => Number(s) === tenantId);
}
