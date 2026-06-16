import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { getTenantId } from "../middlewares/tenant-context";

/**
 * Resolve the central PCA club id for a tenant — the key that filters every
 * central-DB stats read to that club's data. This is what makes the central
 * reads multi-club: instead of hardcoding Halls Head (club 1), reads use the
 * current tenant's `central_club_id`.
 *
 * Reads the tenants register (the tenant db, always available), cached briefly
 * to avoid a lookup on every stats request. Falls back to Halls Head (1) if the
 * tenant row is missing, so a misconfigured tenant degrades to the demo data
 * rather than erroring.
 */

const HALLS_HEAD_CENTRAL_CLUB_ID = 1;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<number, { clubId: number; at: number }>();

export async function getTenantCentralClubId(tenantId: number): Promise<number> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.clubId;

  const [row] = await db
    .select({ centralClubId: tenantsTable.centralClubId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  const clubId = row?.centralClubId ?? HALLS_HEAD_CENTRAL_CLUB_ID;
  cache.set(tenantId, { clubId, at: Date.now() });
  return clubId;
}

/** The central club id for the current request's tenant (header → env → default). */
export async function getRequestCentralClubId(req: Request): Promise<number> {
  return getTenantCentralClubId(getTenantId(req));
}
