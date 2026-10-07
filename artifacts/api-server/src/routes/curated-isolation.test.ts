import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  teamOfDecadeBoardsTable,
  tourContentTable,
  capRegisterTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Tenant isolation for the curated tables the original isolation suite did not
 * touch (plan.md §5.11): Team of the Decade boards, the onboarding tour content
 * singleton, the cap register, and the season shirt-number register. Same contract as tenant-isolation.test.ts:
 * tenant 2's rows are invisible to tenant 1 and vice versa, and a write as
 * tenant 2 lands on tenant 2 only.
 *
 * Real-DB integration test (needs DATABASE_URL). Tenant 1 is the seeded demo
 * tenant; tenant 2 is created here and removed afterwards.
 */

const STAMP = Date.now();
const T2_BOARD_KEY = `iso_tod_t2_${STAMP}`;
const T2_BOARD_TITLE = `Iso Team of the Decade T2 ${STAMP}`;
const T2_CAP_NAME = `Iso Capped Player T2 ${STAMP}`;
const T2_WELCOME_TITLE = `Welcome to Iso Tenant 2 ${STAMP}`;
const T2_SHIRT_NAME = `Iso Shirt Player T2 ${STAMP}`;

describe("tenant isolation: team of the decade, tour content, cap register, shirt numbers", () => {
  let tenant2Id: number;
  let adminT2Id: number;
  let adminT2Cookie: string;
  let adminT1Id: number;
  let adminT1Cookie: string;
  let capId: number;
  let boardId: number;
  let shirtId: number;
  /** Tenant 1's shirt-number settings before this suite (restored after). */
  let t1ShirtSettings: typeof shirtNumberSettingsTable.$inferSelect | undefined;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-curated-isolation";

    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-curated-t2-${STAMP}`,
        centralClubId: 9401,
        readsFromCentral: true,
        name: "Iso Curated Tenant 2",
        plan: "pilot",
      })
      .returning();
    tenant2Id = tenant2.id;

    const [board] = await db
      .insert(teamOfDecadeBoardsTable)
      .values({
        tenantId: tenant2Id,
        key: T2_BOARD_KEY,
        title: T2_BOARD_TITLE,
        published: true,
      })
      .returning();
    boardId = board.id;

    const [cap] = await db
      .insert(capRegisterTable)
      .values({
        tenantId: tenant2Id,
        // A high number that cannot collide with tenant 1's real register.
        capNumber: 90_000 + (STAMP % 1000),
        category: "male",
        name: T2_CAP_NAME,
      })
      .returning();
    capId = cap.id;

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenant2Id,
        username: `iso_curated_admin_${STAMP}`,
        displayName: "Iso Curated Admin",
        passwordHash: "x",
      })
      .returning();
    adminT2Id = admin.id;
    adminT2Cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminT2Id, issuedAt: Date.now() })}`;

    const [adminT1] = await db
      .insert(adminsTable)
      .values({
        tenantId: 1,
        username: `iso_curated_admin_t1_${STAMP}`,
        displayName: "Iso Curated Admin T1",
        passwordHash: "x",
      })
      .returning();
    adminT1Id = adminT1.id;
    adminT1Cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminT1Id, issuedAt: Date.now() })}`;

    // Shirt numbers on for both clubs, so a cross-tenant write reaches the
    // tenant-scoped lookup instead of stopping at the feature switch.
    [t1ShirtSettings] = await db
      .select()
      .from(shirtNumberSettingsTable)
      .where(eq(shirtNumberSettingsTable.tenantId, 1));
    for (const tenantId of [1, tenant2Id]) {
      await db
        .insert(shirtNumberSettingsTable)
        .values({ tenantId, enabled: true })
        .onConflictDoUpdate({
          target: shirtNumberSettingsTable.tenantId,
          set: { enabled: true, duplicatePolicy: "warn" },
        });
    }
    const [shirt] = await db
      .insert(shirtNumbersTable)
      .values({ tenantId: tenant2Id, season: 2026, name: T2_SHIRT_NAME, number: "7" })
      .returning();
    shirtId = shirt.id;
  });

  afterAll(async () => {
    await db.delete(teamOfDecadeBoardsTable).where(eq(teamOfDecadeBoardsTable.id, boardId));
    await db.delete(capRegisterTable).where(eq(capRegisterTable.id, capId));
    await db.delete(tourContentTable).where(eq(tourContentTable.tenantId, tenant2Id));
    await db.delete(shirtNumbersTable).where(eq(shirtNumbersTable.tenantId, tenant2Id));
    await db
      .delete(shirtNumberSettingsTable)
      .where(eq(shirtNumberSettingsTable.tenantId, tenant2Id));
    if (t1ShirtSettings) {
      const { enabled, duplicatePolicy, rolloverPolicy } = t1ShirtSettings;
      await db
        .update(shirtNumberSettingsTable)
        .set({ enabled, duplicatePolicy, rolloverPolicy })
        .where(eq(shirtNumberSettingsTable.tenantId, 1));
    } else {
      await db.delete(shirtNumberSettingsTable).where(eq(shirtNumberSettingsTable.tenantId, 1));
    }
    await db.delete(adminsTable).where(eq(adminsTable.id, adminT1Id));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminT2Id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant2Id));
  });

  it("team-of-decade-boards: tenant 2's board is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app)
      .get("/api/team-of-decade-boards")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.some((b: { key: string }) => b.key === T2_BOARD_KEY)).toBe(false);

    const asT2 = await request(app)
      .get("/api/team-of-decade-boards")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((b: { key: string }) => b.key === T2_BOARD_KEY)).toBe(true);
  });

  it("caps: tenant 2's cap is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app).get("/api/caps").set("x-tenant-id", "1").expect(200);
    expect(asT1.body.some((c: { name: string }) => c.name === T2_CAP_NAME)).toBe(false);

    const asT2 = await request(app)
      .get("/api/caps")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((c: { name: string }) => c.name === T2_CAP_NAME)).toBe(true);
  });

  it("tour-content: tenant 2's edit never appears in tenant 1's onboarding copy", async () => {
    const before = await request(app).get("/api/tour-content").set("x-tenant-id", "1").expect(200);
    const t1Title = before.body.welcomeTitle;

    await request(app)
      .patch("/api/tour-content")
      .set("Cookie", adminT2Cookie)
      .set("x-tenant-id", String(tenant2Id))
      .send({ welcomeTitle: T2_WELCOME_TITLE })
      .expect(200);

    const asT2 = await request(app)
      .get("/api/tour-content")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.welcomeTitle).toBe(T2_WELCOME_TITLE);

    const asT1 = await request(app).get("/api/tour-content").set("x-tenant-id", "1").expect(200);
    expect(asT1.body.welcomeTitle).toBe(t1Title);
    expect(asT1.body.welcomeTitle).not.toBe(T2_WELCOME_TITLE);
  });

  it("tour-content: a tenant 2 admin session cannot edit tenant 1's copy", async () => {
    // The session is valid for tenant 2, but the request targets tenant 1's host.
    await request(app)
      .patch("/api/tour-content")
      .set("Cookie", adminT2Cookie)
      .set("x-tenant-id", "1")
      .send({ welcomeTitle: `cross-tenant ${STAMP}` })
      .expect(401);
  });

  it("shirt-numbers: tenant 2's entry is hidden from tenant 1's register and visible to tenant 2's", async () => {
    const asT1 = await request(app)
      .get("/api/shirt-numbers?season=2026")
      .set("Cookie", adminT1Cookie)
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.entries.some((e: { name: string }) => e.name === T2_SHIRT_NAME)).toBe(false);

    const asT2 = await request(app)
      .get("/api/shirt-numbers?season=2026")
      .set("Cookie", adminT2Cookie)
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.entries.some((e: { name: string }) => e.name === T2_SHIRT_NAME)).toBe(true);
  });

  it("shirt-numbers: tenant 1 cannot edit or delete tenant 2's entry", async () => {
    await request(app)
      .patch(`/api/shirt-numbers/${shirtId}`)
      .set("Cookie", adminT1Cookie)
      .set("x-tenant-id", "1")
      .send({ number: "99" })
      .expect(404);
    await request(app)
      .delete(`/api/shirt-numbers/${shirtId}`)
      .set("Cookie", adminT1Cookie)
      .set("x-tenant-id", "1")
      .expect(404);
    const [row] = await db
      .select()
      .from(shirtNumbersTable)
      .where(eq(shirtNumbersTable.id, shirtId));
    expect(row?.number).toBe("7");
  });

  it("shirt-numbers: a tenant 2 admin session cannot read or write tenant 1's register", async () => {
    await request(app)
      .get("/api/shirt-numbers")
      .set("Cookie", adminT2Cookie)
      .set("x-tenant-id", "1")
      .expect(401);
    await request(app)
      .post("/api/shirt-numbers")
      .set("Cookie", adminT2Cookie)
      .set("x-tenant-id", "1")
      .send({ season: 2026, name: `cross-tenant ${STAMP}` })
      .expect(401);
  });

  it("shirt-numbers: duplicate checks never see another club's numbers", async () => {
    // Tenant 2 wears #7 in 2026; tenant 1's #7 is not a duplicate of it.
    const res = await request(app)
      .post("/api/shirt-numbers")
      .set("Cookie", adminT1Cookie)
      .set("x-tenant-id", "1")
      .send({ season: 2026, name: `Iso Shirt T1 ${STAMP}`, number: "7" })
      .expect(201);
    expect(
      res.body.warnings.filter((w: { names: string[] }) => w.names.includes(T2_SHIRT_NAME)),
    ).toEqual([]);
    await db.delete(shirtNumbersTable).where(eq(shirtNumbersTable.id, res.body.entry.id));
  });
});
