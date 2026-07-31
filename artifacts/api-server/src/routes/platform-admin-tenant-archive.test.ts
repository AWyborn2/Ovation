import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, platformAdminsTable, tenantsTable, adminsTable } from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Archive/restore lifecycle for tenants (docs/plans/2026-07-31-001): a platform
 * admin can take a tenant off the live platform (blocks admin access, drops it
 * from the public directory) and bring it back, without deleting any data.
 * Idempotent both ways; the demo tenant (id 1 / Halls Head) can't be archived.
 *
 * Real-DB integration test: needs DATABASE_URL.
 */

const STAMP = Date.now();
const EMAIL = `super-archive+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("platform-admin tenant archive/restore", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let tenantId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-platform-archive";

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
        slug: `pa-archive-${STAMP}`,
        centralClubId: 9303,
        name: "PA Archive Throwaway",
        plan: "free",
      })
      .returning();
    tenantId = t!.id;

    const [ca] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: "owner",
        displayName: "Club",
        passwordHash,
      })
      .returning();
    clubAdminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
  });

  it("archives an active tenant, setting suspendedAt", async () => {
    const res = await request(app)
      .post(`/api/platform/admin/tenants/${tenantId}/archive`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(res.body.suspendedAt).toBeTruthy();

    const detail = await request(app)
      .get(`/api/platform/admin/tenants/${tenantId}`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(detail.body.tenant.suspendedAt).toBeTruthy();
  });

  it("drops an archived tenant from the public directory", async () => {
    const dir = await request(app).get("/api/platform/directory-clubs").expect(200);
    expect(
      dir.body.some((c: { slug: string }) => c.slug === `pa-archive-${STAMP}`),
    ).toBe(false);
  });

  it("re-archiving an already-archived tenant is idempotent (suspendedAt unchanged)", async () => {
    const first = await request(app)
      .get(`/api/platform/admin/tenants/${tenantId}`)
      .set("Cookie", platformCookie)
      .expect(200);
    const firstSuspendedAt = first.body.tenant.suspendedAt;

    const second = await request(app)
      .post(`/api/platform/admin/tenants/${tenantId}/archive`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(second.body.suspendedAt).toBe(firstSuspendedAt);
  });

  it("restores an archived tenant, clearing suspendedAt", async () => {
    const res = await request(app)
      .post(`/api/platform/admin/tenants/${tenantId}/restore`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(res.body.suspendedAt).toBeNull();

    const dir = await request(app).get("/api/platform/directory-clubs").expect(200);
    expect(
      dir.body.some((c: { slug: string }) => c.slug === `pa-archive-${STAMP}`),
    ).toBe(true);
  });

  it("restoring an already-active tenant is idempotent (200, no-op)", async () => {
    const res = await request(app)
      .post(`/api/platform/admin/tenants/${tenantId}/restore`)
      .set("Cookie", platformCookie)
      .expect(200);
    expect(res.body.suspendedAt).toBeNull();
  });

  it("refuses to archive the demo tenant (id 1 / Halls Head)", async () => {
    const res = await request(app)
      .post("/api/platform/admin/tenants/1/archive")
      .set("Cookie", platformCookie)
      .expect(400);
    expect(res.body.error).toMatch(/demo tenant/i);

    const detail = await request(app)
      .get("/api/platform/admin/tenants/1")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(detail.body.tenant.suspendedAt).toBeNull();
  });

  it("404s both endpoints for a nonexistent tenant", async () => {
    await request(app)
      .post("/api/platform/admin/tenants/999999999/archive")
      .set("Cookie", platformCookie)
      .expect(404);
    await request(app)
      .post("/api/platform/admin/tenants/999999999/restore")
      .set("Cookie", platformCookie)
      .expect(404);
  });

  it("401s both endpoints without a platform session", async () => {
    await request(app).post(`/api/platform/admin/tenants/${tenantId}/archive`).expect(401);
    await request(app).post(`/api/platform/admin/tenants/${tenantId}/restore`).expect(401);
  });

  it("rejects a club-admin session on both endpoints (cross-surface isolation)", async () => {
    await request(app)
      .post(`/api/platform/admin/tenants/${tenantId}/archive`)
      .set("Cookie", clubAdminCookie)
      .expect(401);
    await request(app)
      .post(`/api/platform/admin/tenants/${tenantId}/restore`)
      .set("Cookie", clubAdminCookie)
      .expect(401);
  });
});
