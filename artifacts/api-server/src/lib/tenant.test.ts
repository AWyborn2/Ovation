import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  isTenantSuspended,
  invalidateTenantConfigCache,
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
