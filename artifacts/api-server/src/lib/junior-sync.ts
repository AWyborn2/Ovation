/**
 * The junior PlayHQ sync gate (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md,
 * U1; KTD1, KTD2, R1, R2, R24).
 *
 * Junior sync runs for a tenant only when all three hold:
 *   1. scheduled PlayHQ sync is on (`tenants.playhq_sync_enabled`),
 *   2. the platform-admin junior switch is on (`tenants.junior_sync_enabled`), and
 *   3. the tenant's plan includes the `juniors` entitlement.
 * While billing is dormant the entitlement reads as on for every plan, so the junior
 * switch is the effective control. The decision is made once, here in the API layer;
 * every `lib/db` step (cadence, junior drop, junior projection) takes the resulting
 * set as a parameter rather than re-deciding.
 *
 * A club's junior organisation is `playhq_junior_org_id` when set, otherwise its
 * senior `playhq_org_id`. A tenant with neither is never enabled.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { hasEntitlement, planFromString } from "./entitlements";

/** The tenant columns the gate reads. */
export interface JuniorSyncTenantInput {
  id: number;
  plan: string | null;
  playhqOrgId: string | null;
  playhqSyncEnabled: boolean;
  juniorSyncEnabled: boolean;
  playhqJuniorOrgId: string | null;
}

/** An enabled tenant and the PlayHQ organisation its junior grades come from. */
export interface JuniorSyncTenant {
  tenantId: number;
  orgId: string;
}

function clean(v: string | null | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}

/** The effective junior organisation: the junior one when set, else the senior one. */
export function juniorOrgIdFor(
  t: Pick<JuniorSyncTenantInput, "playhqOrgId" | "playhqJuniorOrgId">,
): string | null {
  return clean(t.playhqJuniorOrgId) ?? clean(t.playhqOrgId);
}

/** Whether junior sync is on for this tenant (the three-part gate plus an organisation). */
export function juniorSyncEnabledFor(t: JuniorSyncTenantInput): boolean {
  if (!t.playhqSyncEnabled || !t.juniorSyncEnabled) return false;
  if (!hasEntitlement(planFromString(t.plan), "juniors")) return false;
  return juniorOrgIdFor(t) !== null;
}

/** The enabled tenants with their effective junior organisation, in input order. */
export function selectJuniorSyncTenants(
  rows: readonly JuniorSyncTenantInput[],
): JuniorSyncTenant[] {
  const out: JuniorSyncTenant[] = [];
  for (const t of rows) {
    if (!juniorSyncEnabledFor(t)) continue;
    out.push({ tenantId: t.id, orgId: juniorOrgIdFor(t)! });
  }
  return out;
}

/** Read the tenants register and return the tenants junior sync is enabled for. */
export async function loadJuniorSyncTenants(): Promise<JuniorSyncTenant[]> {
  const rows = await db
    .select({
      id: tenantsTable.id,
      plan: tenantsTable.plan,
      playhqOrgId: tenantsTable.playhqOrgId,
      playhqSyncEnabled: tenantsTable.playhqSyncEnabled,
      juniorSyncEnabled: tenantsTable.juniorSyncEnabled,
      playhqJuniorOrgId: tenantsTable.playhqJuniorOrgId,
    })
    .from(tenantsTable)
    // Cheap pre-filter; the full decision (entitlement, organisation) is the pure one.
    .where(eq(tenantsTable.juniorSyncEnabled, true))
    .orderBy(tenantsTable.id);
  return selectJuniorSyncTenants(rows);
}
