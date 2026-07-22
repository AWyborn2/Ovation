import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  milestoneBoardSettingsTable,
  capRegisterTable,
} from "@workspace/db";
import { clearMilestonesCache } from "../lib/milestones-cache";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Tenant scoping for the milestone board.
 *
 * `milestones.ts` used to read its settings row with a hardcoded
 * `where id = SETTINGS_ID (1)` at both call sites, and `appendDebuts` read the
 * whole `cap_register` table unfiltered — so every tenant got tenant #1's
 * recency window, tier thresholds, and curated cap register.
 *
 * Same shape as `settings-isolation.test.ts` — real-DB integration.
 */

const STAMP = Date.now();
const T1_RECENCY = 4;
const T2_RECENCY = 9;

describe("tenant-scoped milestone board", () => {
  let tenant2Id: number;
  let adminId: number;
  let adminCookie: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-milestones-isolation";

    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-milestones-t2-${STAMP}`,
        centralClubId: 9401,
        name: "Iso Milestones T2",
        // Native path: keeps this suite off the central PCA DB.
        // NOTE: the native stats tables (matches/players/match_player_lines)
        // carry no tenant_id, so this tenant reads tenant #1's shared match
        // data. That is a test-only convenience — see the caveat in the
        // cap_register test below for what this suite does and does not prove.
        readsFromCentral: false,
      })
      .returning();
    tenant2Id = tenant2.id;

    // Pin tenant #1 to a known recency so the cross-tenant assertions compare
    // against a fixed value rather than "whatever tenant 1 happens to have".
    await db
      .update(milestoneBoardSettingsTable)
      .set({ recencyWeeks: T1_RECENCY })
      .where(eq(milestoneBoardSettingsTable.tenantId, 1));

    await db
      .insert(milestoneBoardSettingsTable)
      .values({ tenantId: tenant2Id, recencyWeeks: T2_RECENCY });

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenant2Id,
        username: `iso_milestones_admin_${STAMP}`,
        displayName: "Iso Milestones Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(capRegisterTable).where(eq(capRegisterTable.tenantId, tenant2Id));
    await db
      .delete(milestoneBoardSettingsTable)
      .where(eq(milestoneBoardSettingsTable.tenantId, tenant2Id));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant2Id));
    clearMilestonesCache();
  });

  beforeEach(() => {
    clearMilestonesCache();
  });

  it("serves each tenant its own recency window, not tenant #1's", async () => {
    const res = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);

    expect(res.body.recencyWeeks).toBe(T2_RECENCY);
  });

  it("does not serve a warm cached board across tenants", async () => {
    // Deliberately does NOT clear between the two requests — the point is to
    // exercise a populated cache. Tenant #1 first so its entry is warm...
    const asT1 = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.recencyWeeks).toBe(T1_RECENCY);

    // ...then tenant 2 must miss that entry and build its own.
    const asT2 = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.recencyWeeks).toBe(T2_RECENCY);
  });

  it("reflects a settings change immediately instead of serving the cached board", async () => {
    // Warm the cache for tenant 2.
    const before = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(before.body.recencyWeeks).toBe(T2_RECENCY);

    await request(app)
      .patch("/api/milestone-board-settings")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      .send({ recencyWeeks: 3 })
      .expect(200);

    const after = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(after.body.recencyWeeks).toBe(3);

    // Restore for any later assertions.
    await db
      .update(milestoneBoardSettingsTable)
      .set({ recencyWeeks: T2_RECENCY })
      .where(eq(milestoneBoardSettingsTable.tenantId, tenant2Id));
  });

  it("never renders another tenant's cap register as a debut milestone", async () => {
    // Tenant 2's own cap register is empty, so any debut item attributed to it
    // could only have come from another tenant's curated rows.
    const res = await request(app)
      .get("/api/milestones")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);

    const debuts = (res.body.items as { kind: string }[]).filter((i) => i.kind === "debut");
    expect(debuts).toEqual([]);
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
