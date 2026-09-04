import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  isTenantSuspended,
  invalidateTenantConfigCache,
  tenantReadsFromCentral,
  NativeStatsUnavailableError,
  CentralReadsDisabledError,
  NATIVE_STATS_TENANT_ID,
} from "./tenant";

/**
 * `isTenantSuspended` / the `suspended` field on the cached tenant config
 * (Phase 2 of the archive/restore feature — see docs/plans/2026-07-31-001).
 *
 * Real-DB integration test: needs DATABASE_URL (getTenantConfig reads the
 * tenants table directly).
 */

const STAMP = Date.now();

describe("tenant.ts: isTenantSuspended", () => {
  let tenantId: number;

  beforeAll(async () => {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `suspend-check-${STAMP}`,
        centralClubId: 9301,
        name: "Suspend Check Tenant",
        plan: "free",
      })
      .returning();
    tenantId = t!.id;
  });

  afterAll(async () => {
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  it("is false for a tenant with no suspendedAt", async () => {
    expect(await isTenantSuspended(tenantId)).toBe(false);
  });

  it("reflects a just-written suspendedAt once the cache is invalidated", async () => {
    await db
      .update(tenantsTable)
      .set({ suspendedAt: new Date() })
      .where(eq(tenantsTable.id, tenantId));
    // Without invalidation the 5-minute cache would still report false; this
    // is the same invalidation the archive/restore routes call after writing.
    invalidateTenantConfigCache(tenantId);
    expect(await isTenantSuspended(tenantId)).toBe(true);
  });

  it("flips back to false once suspendedAt is cleared and the cache invalidated", async () => {
    await db
      .update(tenantsTable)
      .set({ suspendedAt: null })
      .where(eq(tenantsTable.id, tenantId));
    invalidateTenantConfigCache(tenantId);
    expect(await isTenantSuspended(tenantId)).toBe(false);
  });
});

/**
 * The fail-closed data-source decision (plan.md §2.1). The native stats tables
 * hold only tenant #1's history, so any other tenant must either read central
 * or error — and the CENTRAL_READS=0 kill-switch must never turn into "serve
 * everyone the demo club's data".
 */
describe("tenant.ts: tenantReadsFromCentral fails closed", () => {
  let nativeMisconfiguredId: number;
  let centralId: number;
  const savedKillSwitch = process.env.CENTRAL_READS;

  beforeAll(async () => {
    const [misconfigured] = await db
      .insert(tenantsTable)
      .values({
        slug: `native-misconfig-${STAMP}`,
        centralClubId: 9302,
        readsFromCentral: false,
        name: "Misconfigured Native Tenant",
        plan: "free",
      })
      .returning();
    nativeMisconfiguredId = misconfigured!.id;
    const [central] = await db
      .insert(tenantsTable)
      .values({
        slug: `central-ok-${STAMP}`,
        centralClubId: 9303,
        readsFromCentral: true,
        name: "Central Tenant",
        plan: "free",
      })
      .returning();
    centralId = central!.id;
  });

  afterAll(async () => {
    if (savedKillSwitch === undefined) delete process.env.CENTRAL_READS;
    else process.env.CENTRAL_READS = savedKillSwitch;
    await db.delete(tenantsTable).where(eq(tenantsTable.id, nativeMisconfiguredId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, centralId));
  });

  it("a central tenant reads central", async () => {
    delete process.env.CENTRAL_READS;
    expect(await tenantReadsFromCentral(centralId)).toBe(true);
  });

  it("a non-demo tenant configured for native reads is rejected (409), never served tenant #1's tables", async () => {
    delete process.env.CENTRAL_READS;
    await expect(tenantReadsFromCentral(nativeMisconfiguredId)).rejects.toBeInstanceOf(
      NativeStatsUnavailableError,
    );
  });

  it("CENTRAL_READS=0 makes a central tenant unavailable (503) instead of native", async () => {
    process.env.CENTRAL_READS = "0";
    await expect(tenantReadsFromCentral(centralId)).rejects.toBeInstanceOf(
      CentralReadsDisabledError,
    );
  });

  it("CENTRAL_READS=0 still lets tenant #1 read its native tables", async () => {
    process.env.CENTRAL_READS = "0";
    invalidateTenantConfigCache(NATIVE_STATS_TENANT_ID);
    expect(await tenantReadsFromCentral(NATIVE_STATS_TENANT_ID)).toBe(false);
  });
});
