import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, milestoneBoardSettingsTable } from "@workspace/db";
import { clearCentralQueriesCache } from "@workspace/db/central-queries";

/**
 * Tenant-scoped milestone board settings.
 *
 * `milestones.ts` used to read its settings row with a hardcoded
 * `where id = SETTINGS_ID (1)` at both call sites (the native build and the
 * central build), even though `milestone_board_settings` carries a `tenant_id`
 * with a `milestone_board_settings_tenant_unique` index. Every tenant therefore
 * saw tenant #1's recency window and tier thresholds.
 *
 * These are the same shape as `settings-isolation.test.ts` — real-DB
 * integration against the tenant-scoped `getOrCreateSettings` pattern.
 */

const STAMP = Date.now();

describe("tenant-scoped milestone board settings", () => {
  let tenant2Id: number;

  beforeAll(async () => {
    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-milestones-t2-${STAMP}`,
        centralClubId: 9401,
        name: "Iso Milestones T2",
        // Native path: keeps this suite off the central PCA DB.
        readsFromCentral: false,
      })
      .returning();
    tenant2Id = tenant2.id;

    // A recency window that is deliberately not the schema default (4) and not
    // whatever tenant #1 happens to have saved.
    await db
      .insert(milestoneBoardSettingsTable)
      .values({ tenantId: tenant2Id, recencyWeeks: 9 });
  });

  afterAll(async () => {
    await db
      .delete(milestoneBoardSettingsTable)
      .where(eq(milestoneBoardSettingsTable.tenantId, tenant2Id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant2Id));
  });

  it("serves each tenant its own recency window, not tenant #1's", async () => {
    clearCentralQueriesCache();

    const res = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);

    expect(res.body.recencyWeeks).toBe(9);
  });

  it("does not serve a cached board across tenants", async () => {
    clearCentralQueriesCache();

    // Tenant #1 first, so any cache is populated with its result...
    const asT1 = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", "1")
      .expect(200);

    // ...then tenant 2 must still get its own settings, not the cached ones.
    const asT2 = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);

    expect(asT2.body.recencyWeeks).toBe(9);
    expect(asT2.body.recencyWeeks).not.toBe(asT1.body.recencyWeeks);
  });

  it("creates a settings row on first access for a tenant that has none", async () => {
    const [tenant3] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-milestones-t3-${STAMP}`,
        centralClubId: 9402,
        name: "Iso Milestones T3",
        readsFromCentral: false,
      })
      .returning();

    try {
      clearCentralQueriesCache();
      const res = await request(app)
        .get("/api/milestones")
        .set("x-tenant-id", String(tenant3.id))
        .expect(200);

      // Schema default, never copied from another tenant.
      expect(res.body.recencyWeeks).toBe(4);

      const [row] = await db
        .select()
        .from(milestoneBoardSettingsTable)
        .where(eq(milestoneBoardSettingsTable.tenantId, tenant3.id));
      expect(row).toBeDefined();
    } finally {
      await db
        .delete(milestoneBoardSettingsTable)
        .where(eq(milestoneBoardSettingsTable.tenantId, tenant3.id));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant3.id));
    }
  });
});
