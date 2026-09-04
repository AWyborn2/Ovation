import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable } from "@workspace/db";
import { hashPassword, SESSION_COOKIE } from "../lib/auth";
import { invalidateTenantConfigCache } from "../lib/tenant";

/**
 * A suspended (archived) tenant's admin can no longer sign in, and an
 * already-signed-in session stops working — the enforcement half of the
 * archive/restore feature (see docs/plans/2026-07-31-001). The write side
 * (setting suspendedAt via the platform-admin archive endpoint) is covered by
 * platform-admin-tenant-archive.test.ts; this suite exercises enforcement
 * directly against the tenants row so it doesn't depend on that route.
 *
 * Real-DB integration test: needs DATABASE_URL.
 */

const STAMP = Date.now();
const USERNAME = `owner+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("auth: suspended tenant enforcement", () => {
  let tenantId: number;
  let adminId: number;

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `auth-suspend-${STAMP}`,
        centralClubId: 9302,
        name: "Auth Suspend Tenant",
        plan: "free",
      })
      .returning();
    tenantId = t!.id;
    const [a] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: USERNAME,
        displayName: "Owner",
        passwordHash,
      })
      .returning();
    adminId = a!.id;
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  it("logs in normally while the tenant is active (regression guard)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("x-tenant-id", String(tenantId))
      .send({ username: USERNAME, password: PASSWORD })
      .expect(200);
    expect(res.body.username).toBe(USERNAME);
    expect(res.headers["set-cookie"]).toBeTruthy();
  });

  it("rejects login with 403 once the tenant is suspended, and sets no session cookie", async () => {
    await db
      .update(tenantsTable)
      .set({ suspendedAt: new Date() })
      .where(eq(tenantsTable.id, tenantId));
    invalidateTenantConfigCache(tenantId);

    const res = await request(app)
      .post("/api/auth/login")
      .set("x-tenant-id", String(tenantId))
      .send({ username: USERNAME, password: PASSWORD })
      .expect(403);
    expect(res.body.error).toMatch(/suspended/i);
    expect(res.headers["set-cookie"]).toBeFalsy();
  });

  it("still rejects an invalid password with 401, not 403, while suspended", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("x-tenant-id", String(tenantId))
      .send({ username: USERNAME, password: "wrong password entirely" })
      .expect(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it("stops honouring an existing session once its tenant is suspended, without forcing logout", async () => {
    // Restore, log in for a fresh valid session, then suspend again — proves
    // an already-signed-in admin loses access on the very next request rather
    // than only being blocked at the login step.
    await db.update(tenantsTable).set({ suspendedAt: null }).where(eq(tenantsTable.id, tenantId));
    invalidateTenantConfigCache(tenantId);

    const login = await request(app)
      .post("/api/auth/login")
      .set("x-tenant-id", String(tenantId))
      .send({ username: USERNAME, password: PASSWORD })
      .expect(200);
    const cookie = String(login.headers["set-cookie"][0]).split(";")[0];
    expect(cookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);

    await request(app)
      .get("/api/auth/me")
      .set("x-tenant-id", String(tenantId))
      .set("Cookie", cookie)
      .expect(200);

    await db
      .update(tenantsTable)
      .set({ suspendedAt: new Date() })
      .where(eq(tenantsTable.id, tenantId));
    invalidateTenantConfigCache(tenantId);

    await request(app)
      .get("/api/auth/me")
      .set("x-tenant-id", String(tenantId))
      .set("Cookie", cookie)
      .expect(401);

    // Restoring reinstates access on the SAME cookie — no re-login required.
    await db.update(tenantsTable).set({ suspendedAt: null }).where(eq(tenantsTable.id, tenantId));
    invalidateTenantConfigCache(tenantId);

    await request(app)
      .get("/api/auth/me")
      .set("x-tenant-id", String(tenantId))
      .set("Cookie", cookie)
      .expect(200);
  });
});
