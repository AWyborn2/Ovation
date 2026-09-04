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
import { env } from "../config";

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

/**
 * The one tenant the native (non-central) stats tables belong to. Those tables
 * have no tenant_id, so they can only ever represent this tenant's history.
 */
export const NATIVE_STATS_TENANT_ID = 1;

/**
 * A tenant other than #1 is about to be served from the native stats tables,
 * which hold only tenant #1's data. Fail closed rather than serve another
 * club's stats under this tenant's brand.
 *
 * Deliberately raised at the native stats read, not in `getTenantConfig` —
 * that config also carries `plan`, so guarding there would reject entitlement
 * checks for every native-configured tenant, which is a far wider blast radius
 * than the leak being closed.
 */
export class NativeStatsUnavailableError extends Error {
  readonly status = 409;
  constructor(readonly tenantId: number) {
    super(
      `Tenant ${tenantId} is configured for native stats reads, but the native ` +
        `stats tables are not tenant-scoped. Set reads_from_central = true.`,
    );
    this.name = "NativeStatsUnavailableError";
  }
}

interface TenantConfig {
  centralClubId: number | null;
  readsFromCentral: boolean;
  plan: Plan;
  suspended: boolean;
}

const cache = new Map<number, { cfg: TenantConfig; at: number }>();

/**
 * Bumped on every invalidation. Guards the TOCTOU window in {@link getTenantConfig}
 * below: a read that was already in flight when a write invalidated the cache
 * must not re-populate it with the stale value it fetched before the write —
 * that would silently undo the invalidation (e.g. a just-archived tenant's
 * admin staying authorized for up to CACHE_TTL_MS longer).
 */
let epoch = 0;

/**
 * Drop cached tenant config so the next read reflects a just-changed row. Pass a
 * tenant id to clear one entry, or omit to clear all. Call after any write that
 * changes `plan`, `central_club_id`, `reads_from_central`, or `suspended_at`.
 */
export function invalidateTenantConfigCache(tenantId?: number): void {
  epoch++;
  if (tenantId === undefined) cache.clear();
  else cache.delete(tenantId);
}

async function getTenantConfig(tenantId: number): Promise<TenantConfig> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cfg;

  const epochAtStart = epoch;
  const [row] = await db
    .select({
      centralClubId: tenantsTable.centralClubId,
      readsFromCentral: tenantsTable.readsFromCentral,
      plan: tenantsTable.plan,
      suspendedAt: tenantsTable.suspendedAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!row) throw new TenantNotFoundError(tenantId);

  const cfg: TenantConfig = {
    centralClubId: row.centralClubId ?? null,
    readsFromCentral: row.readsFromCentral ?? false,
    plan: planFromString(row.plan),
    suspended: row.suspendedAt != null,
  };
  // Only cache when no invalidation happened while this read was in flight --
  // otherwise a slow read racing a concurrent write would overwrite the
  // invalidation with the stale value it started reading before the write.
  if (epoch === epochAtStart) cache.set(tenantId, { cfg, at: Date.now() });
  return cfg;
}

/**
 * Whether a tenant is currently archived/suspended by a platform admin. A
 * suspended tenant's admin can no longer sign in or act (see
 * {@link resolveAdmin} in `middlewares/require-admin.ts` and the `/auth/login`
 * route); its public site keeps serving read-only pages unaffected.
 */
export async function isTenantSuspended(tenantId: number): Promise<boolean> {
  return (await getTenantConfig(tenantId)).suspended;
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
 * Central reads are switched off platform-wide (`CENTRAL_READS=0`) and this
 * tenant has no native data to fall back to. Surfaces as a 503 so the client
 * shows "temporarily unavailable" — never another club's stats.
 */
export class CentralReadsDisabledError extends Error {
  readonly status = 503;
  constructor(readonly tenantId: number) {
    super(
      `Central stats reads are disabled (CENTRAL_READS=0) and tenant ${tenantId} ` +
        `has no native stats tables to fall back to.`,
    );
    this.name = "CentralReadsDisabledError";
  }
}

/**
 * The single fail-closed decision every stats read goes through.
 *
 * - Tenant #1 (the only tenant whose history lives in the native tables) reads
 *   native unless configured otherwise.
 * - Any other tenant MUST read central. If its row says otherwise the native
 *   tables would serve tenant #1's history under this tenant's brand, so we
 *   throw {@link NativeStatsUnavailableError} (409) instead of returning false.
 * - `CENTRAL_READS=0` is an incident kill-switch for the central DB. It forces
 *   tenant #1 native, and makes every central tenant fail with
 *   {@link CentralReadsDisabledError} (503) — it must never turn into "serve
 *   everyone Halls Head's data".
 */
function decideReadsFromCentral(tenantId: number, readsFromCentral: boolean): boolean {
  const killSwitch = env.centralReadsDisabled();
  if (tenantId === NATIVE_STATS_TENANT_ID) {
    return killSwitch ? false : readsFromCentral;
  }
  if (!readsFromCentral) throw new NativeStatsUnavailableError(tenantId);
  if (killSwitch) throw new CentralReadsDisabledError(tenantId);
  return true;
}

/**
 * The raw `reads_from_central` flag, WITHOUT the fail-closed guard. For
 * surfaces whose native tables are already tenant-scoped (juniors, curated
 * premierships, social round-ups), where "not central" simply means "this
 * tenant keeps its own rows" and can never expose tenant #1's data. Stats-core
 * reads must use {@link shouldReadCentral} / {@link tenantReadsFromCentral}.
 */
export async function tenantIsCentral(tenantId: number): Promise<boolean> {
  return (await getTenantConfig(tenantId)).readsFromCentral;
}

/** Request form of {@link tenantIsCentral}. */
export async function isCentralTenant(req: Request): Promise<boolean> {
  return tenantIsCentral(getTenantId(req));
}

/**
 * Whether a tenant reads its stats from the central PCA DB (vs native tables).
 * The by-id form of {@link shouldReadCentral} for pipeline code that has a
 * tenant id but no request (e.g. round-up generation). Honours the
 * `CENTRAL_READS=0` global kill-switch and fails closed for any tenant other
 * than #1 that is not configured for central reads (see
 * {@link decideReadsFromCentral}).
 */
export async function tenantReadsFromCentral(tenantId: number): Promise<boolean> {
  const cfg = await getTenantConfig(tenantId);
  return decideReadsFromCentral(tenantId, cfg.readsFromCentral);
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
 * Where a stats read for this request should come from, resolved ONCE.
 *
 * - `central`: read the central PCA DB filtered by `clubId` (the tenant's
 *   central club). `tenantId` is still needed for the crosswalk and curation.
 * - `native`: read the app's own stats tables — only ever tenant #1.
 *
 * Replaces the `if (await shouldReadCentral(req)) { … await
 * getRequestCentralClubId(req) … }` pairs that every stats route repeated: one
 * cached lookup, one place for the fail-closed guard, and the club id travels
 * with the decision so a handler cannot mix the two.
 */
export type DataSource =
  | { kind: "central"; tenantId: number; clubId: number }
  | { kind: "native"; tenantId: number };

export async function dataSource(req: Request): Promise<DataSource> {
  const tenantId = getTenantId(req);
  if (await tenantReadsFromCentral(tenantId)) {
    return { kind: "central", tenantId, clubId: await getTenantCentralClubId(tenantId) };
  }
  return { kind: "native", tenantId };
}

/**
 * Whether the current request's tenant should be served from the central PCA DB.
 * Per-tenant (`tenants.reads_from_central`); `CENTRAL_READS=0` is a global
 * kill-switch (force native everywhere) for incident response.
 */
export async function shouldReadCentral(req: Request): Promise<boolean> {
  return tenantReadsFromCentral(getTenantId(req));
}
