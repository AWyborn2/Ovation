import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  platformAdminsTable,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Platform-admin tenant oversight + management (Phase 2e). A platform admin can
 * list every tenant and change a tenant's plan; a club-admin session must never
 * reach these routes; concierge provisioning mints a tenant + player crosswalk.
 *
 * Real-DB integration test: list/plan need DATABASE_URL; the provision case also
 * needs CENTRAL_DATABASE_URL (reads central.clubs and mints the crosswalk).
 */

const STAMP = Date.now();
const EMAIL = `super-tenants+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("platform-admin tenant management", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let throwawayTenantId: number;
  let provisionedTenantId: number | null = null;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-platform-tenants";
    process.env.SIGNUP_MODE = "pca";

    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Super", passwordHash });
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];

    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `pa-throwaway-${STAMP}`,
        centralClubId: 9201,
        name: "PA Throwaway",
        plan: "free",
      })
      .returning();
    throwawayTenantId = t.id;

    // A club admin in the throwaway tenant — its session must NOT reach platform
    // routes (cross-surface isolation).
    const [ca] = await db
      .insert(adminsTable)
      .values({
        tenantId: throwawayTenantId,
        username: "owner",
        displayName: "Club",
        passwordHash,
      })
      .returning();
    clubAdminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, throwawayTenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, throwawayTenantId));
    if (provisionedTenantId != null) {
      await db.delete(adminsTable).where(eq(adminsTable.tenantId, provisionedTenantId));
      await db
        .delete(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, provisionedTenantId));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, provisionedTenantId));
    }
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
    delete process.env.SIGNUP_MODE;
  });

  it("lists every tenant for a platform admin", async () => {
    const res = await request(app)
      .get("/api/platform/admin/tenants")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((t: { id: number }) => t.id === throwawayTenantId)).toBe(true);
  });

  it("rejects the list without a platform session (401)", async () => {
    await request(app).get("/api/platform/admin/tenants").expect(401);
  });

  it("rejects a club-admin session on platform routes (cross-surface)", async () => {
    await request(app)
      .get("/api/platform/admin/tenants")
      .set("Cookie", clubAdminCookie)
      .expect(401);
  });

  it("updates a tenant's plan", async () => {
    const res = await request(app)
      .patch(`/api/platform/admin/tenants/${throwawayTenantId}`)
      .set("Cookie", platformCookie)
      .send({ plan: "club" })
      .expect(200);
    expect(res.body.plan).toBe("club");

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, throwawayTenantId));
    expect(row.plan).toBe("club");
  });

  it("concierge-provisions a tenant from an available central club", async () => {
    const clubs = await request(app).get("/api/platform/available-clubs").expect(200);
    expect(clubs.body.length).toBeGreaterThan(0);
    const club = clubs.body[0];

    const res = await request(app)
      .post("/api/platform/admin/tenants")
      .set("Cookie", platformCookie)
      .send({
        centralClubId: club.centralClubId,
        slug: `pa-prov-${STAMP}`.slice(0, 40),
        adminEmail: `owner+${STAMP}@example.com`,
        password: "correct horse battery",
      })
      .expect(201);
    provisionedTenantId = res.body.id;
    expect(res.body.readsFromCentral).toBe(true);
    expect(res.body.centralClubId).toBe(club.centralClubId);
    expect(res.body.adminCount).toBe(1);
  });
});
