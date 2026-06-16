import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { getTenantId } from "../middlewares/tenant-context";

/**
 * Per-tenant config resolution for the stats reads.
 *
 * - `centralClubId` is the key that filters central-DB reads to a tenant's club.
 * - `readsFromCentral` decides the DATA SOURCE per tenant: native tables (Halls
 *   Head, full curated history) vs the central PCA DB (clubs with no native data,
 *   e.g. Mandurah). Per-tenant by design, so enabling central for one club never
 *   blanks another that relies on its native tables.
 *
 * Reads the tenants register (the tenant db, always available), cached briefly to
 * avoid a lookup on every stats request. Falls back to Halls Head's native config
 * (club 1, native) if the row is missing, so a misconfigured tenant degrades to
 * the demo rather than erroring.
 */

const HALLS_HEAD_CENTRAL_CLUB_ID = 1;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface TenantConfig {
  centralClubId: number;
  readsFromCentral: boolean;
}

const cache = new Map<number, { cfg: TenantConfig; at: number }>();

async function getTenantConfig(tenantId: number): Promise<TenantConfig> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cfg;

  const [row] = await db
    .select({
      centralClubId: tenantsTable.centralClubId,
      readsFromCentral: tenantsTable.readsFromCentral,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  const cfg: TenantConfig = {
    centralClubId: row?.centralClubId ?? HALLS_HEAD_CENTRAL_CLUB_ID,
    readsFromCentral: row?.readsFromCentral ?? false,
  };
  cache.set(tenantId, { cfg, at: Date.now() });
  return cfg;
}

export async function getTenantCentralClubId(tenantId: number): Promise<number> {
  return (await getTenantConfig(tenantId)).centralClubId;
}

/** The central club id for the current request's tenant. */
export async function getRequestCentralClubId(req: Request): Promise<number> {
  return getTenantCentralClubId(getTenantId(req));
}

/**
 * Whether the current request's tenant should be served from the central PCA DB.
 * Per-tenant (`tenants.reads_from_central`); `CENTRAL_READS=0` is a global
 * kill-switch (force native everywhere) for incident response.
 */
export async function shouldReadCentral(req: Request): Promise<boolean> {
  if (process.env.CENTRAL_READS === "0") return false;
  return (await getTenantConfig(getTenantId(req))).readsFromCentral;
}
