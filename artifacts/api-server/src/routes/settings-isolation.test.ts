import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialSettingsTable,
  tradingCardSettingsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Tenant-scoped settings singletons (Phase 3 U3). These tables used to be a
 * single `id=1` global row shared by every tenant — social_settings even
 * defaulted `clubHashtag`/`clubUrl` to Halls Head's own values. Now each
 * tenant gets its own row, created on first access with the schema defaults
 * (never copied from another tenant). Real-DB integration test.
 */

const STAMP = Date.now();

describe("tenant-scoped settings singletons", () => {
  let tenant2Id: number;
  let adminId: number;
  let adminCookie: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-settings-isolation";

    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-settings-t2-${STAMP}`,
        centralClubId: 9301,
        name: "Iso Settings T2",
      })
      .returning();
    tenant2Id = tenant2.id;

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenant2Id,
        username: `iso_settings_admin_${STAMP}`,
        displayName: "Iso Settings Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenant2Id));
    await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenant2Id));
    await db
      .delete(tradingCardSettingsTable)
      .where(eq(tradingCardSettingsTable.tenantId, tenant2Id));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant2Id));
  });

  it("social-settings: a brand-new tenant gets neutral defaults, never Halls Head's saved hashtag/URL", async () => {
    const res = await request(app)
      .get("/api/social-settings")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(res.body.settings.clubHashtag).toBe("");
    expect(res.body.settings.clubUrl).toBe("");

    const [row] = await db
      .select()
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenant2Id));
    expect(row).toBeDefined();
  });

  it("social-settings: tenant 2's saved hashtag never appears for tenant 1", async () => {
    await request(app)
      .patch("/api/social-settings")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      .send({ clubHashtag: `#IsoT2${STAMP}` })
      .expect(200);

    const asT1 = await request(app).get("/api/social-settings").set("x-tenant-id", "1").expect(200);
    expect(asT1.body.settings.clubHashtag).not.toBe(`#IsoT2${STAMP}`);

    const asT2 = await request(app)
      .get("/api/social-settings")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.settings.clubHashtag).toBe(`#IsoT2${STAMP}`);
  });

  it("trading-card-settings: a brand-new tenant gets schema defaults (empty stat/award keys)", async () => {
    const res = await request(app)
      .get("/api/trading-card-settings")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(res.body.statKeys).toEqual([]);
    expect(res.body.awardKeys).toEqual([]);
  });

  it("trading-card-settings: tenant 2's saved statKeys never leak to tenant 1", async () => {
    await request(app)
      .patch("/api/trading-card-settings")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      .send({ statKeys: ["iso-stat-t2"] })
      .expect(200);

    const asT1 = await request(app)
      .get("/api/trading-card-settings")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.statKeys).not.toContain("iso-stat-t2");

    const asT2 = await request(app)
      .get("/api/trading-card-settings")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.statKeys).toContain("iso-stat-t2");
  });
});
