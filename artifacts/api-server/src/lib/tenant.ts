import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { getTenantId } from "../middlewares/tenant-context";
import {
  planFromString,
  entitlementsFor,
  type Plan,
  type Entitlements,
} from "./entitlements";

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
 * avoid a lookup on every stats request.
 *
 * FAIL CLOSED: if the tenant row is missing we throw rather than defaulting to
 * Halls Head's config — silently degrading to `{club 1, native}` served the
 * entire demo dataset under another club's brand (the Mandurah leak). A
 * misconfigured/unprovisioned tenant must error, never impersonate the demo.
 * The cache is invalidated by {@link invalidateTenantConfigCache} whenever a
 * platform admin changes a tenant's plan / central club / data source.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Thrown when a request resolves to a tenant id with no tenants row. */
export class TenantNotFoundError extends Error {
  readonly status = 404;
  constructor(readonly tenantId: number) {
    super(`No tenant configured for id ${tenantId}`);
    this.name = "TenantNotFoundError";
  }
}

interface TenantConfig {
  centralClubId: number | null;
  readsFromCentral: boolean;
  plan: Plan;
}

const cache = new Map<number, { cfg: TenantConfig; at: number }>();

/**
 * Drop cached tenant config so the next read reflects a just-changed row. Pass a
 * tenant id to clear one entry, or omit to clear all. Call after any write that
 * changes `plan`, `central_club_id` or `reads_from_central`.
 */
export function invalidateTenantConfigCache(tenantId?: number): void {
  if (tenantId === undefined) cache.clear();
  else cache.delete(tenantId);
}

async function getTenantConfig(tenantId: number): Promise<TenantConfig> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cfg;

  const [row] = await db
    .select({
      centralClubId: tenantsTable.centralClubId,
      readsFromCentral: tenantsTable.readsFromCentral,
      plan: tenantsTable.plan,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!row) throw new TenantNotFoundError(tenantId);

  const cfg: TenantConfig = {
    centralClubId: row.centralClubId ?? null,
    readsFromCentral: row.readsFromCentral ?? false,
    plan: planFromString(row.plan),
  };
  cache.set(tenantId, { cfg, at: Date.now() });
  return cfg;
}

/** The current request's tenant plan. */
export async function getTenantPlan(tenantId: number): Promise<Plan> {
  return (await getTenantConfig(tenantId)).plan;
}

/** The current request's tenant plan + resolved entitlements (dormant ⇒ all on). */
export async function getRequestEntitlements(
  req: Request,
): Promise<{ plan: Plan; entitlements: Entitlements }> {
  const plan = (await getTenantConfig(getTenantId(req))).plan;
  return { plan, entitlements: entitlementsFor(plan) };
}

/**
 * Whether a tenant reads its stats from the central PCA DB (vs native tables).
 * The by-id form of {@link shouldReadCentral} for pipeline code that has a
 * tenant id but no request (e.g. round-up generation). Honours the
 * `CENTRAL_READS=0` global kill-switch.
 */
export async function tenantReadsFromCentral(tenantId: number): Promise<boolean> {
  if (process.env.CENTRAL_READS === "0") return false;
  return (await getTenantConfig(tenantId)).readsFromCentral;
}

export async function getTenantCentralClubId(tenantId: number): Promise<number> {
  const { centralClubId } = await getTenantConfig(tenantId);
  if (centralClubId === null) {
    // A central-read tenant with no club id can't be filtered — fail closed
    // rather than fall back to a default club (which would leak that club).
    throw new TenantNotFoundError(tenantId);
  }
  return centralClubId;
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
