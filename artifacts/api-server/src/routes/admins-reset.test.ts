import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  platformAdminsTable,
  tenantsTable,
  adminsTable,
  adminPasswordResetsTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Platform-admin credential recovery: a platform (super) admin can bootstrap or
 * reset a club admin via a single-use link, without ever learning or setting the
 * password. Covers the require-platform-admin gate, cross-surface isolation, the
 * bootstrap-vs-reset branches, single-use redemption, and tenant-scoping of the
 * public redeem endpoints.
 *
 * Real-DB integration test (needs DATABASE_URL); does NOT touch the central DB, so
 * it runs in CI unlike the provisioning suites.
 */

const STAMP = Date.now();
const EMAIL = `super-reset+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

/** Pull the raw ?token= out of a returned reset URL. */
function tokenOf(resetUrl: string): string {
  return new URL(resetUrl).searchParams.get("token") ?? "";
}

describe("platform-admin admin reset / bootstrap", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let tenantAId: number;
  let tenantBId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-admin-reset";
    process.env.PLATFORM_BASE_DOMAIN = "test.ovation.app";

    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Super", passwordHash });
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];

    const [a] = await db
      .insert(tenantsTable)
      .values({
        slug: `reset-a-${STAMP}`,
        centralClubId: 9301,
        name: "Reset Tenant A",
        plan: "free",
      })
      .returning();
    tenantAId = a.id;

    const [b] = await db
      .insert(tenantsTable)
      .values({
        slug: `reset-b-${STAMP}`,
        centralClubId: 9302,
        name: "Reset Tenant B",
        plan: "free",
      })
      .returning();
    tenantBId = b.id;

    // A club admin in tenant A — its session must NOT reach platform routes.
    const [ca] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantAId,
        username: "owner",
        displayName: "Club",
        passwordHash,
      })
      .returning();
    clubAdminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    for (const t of [tenantAId, tenantBId]) {
      const admins = await db
        .select({ id: adminsTable.id })
        .from(adminsTable)
        .where(eq(adminsTable.tenantId, t));
      for (const a of admins) {
        await db
          .delete(adminPasswordResetsTable)
          .where(eq(adminPasswordResetsTable.adminId, a.id));
      }
      await db.delete(adminsTable).where(eq(adminsTable.tenantId, t));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, t));
    }
    await db
      .delete(platformAdminsTable)
      .where(eq(platformAdminsTable.email, EMAIL));
    delete process.env.PLATFORM_BASE_DOMAIN;
  });

  it("rejects issuing without a platform session (401)", async () => {
    await request(app)
      .post(`/api/platform/admin/tenants/${tenantAId}/admin-resets`)
      .send({ username: "someone@example.com" })
      .expect(401);
  });

  it("rejects a club-admin session (cross-surface, 401)", async () => {
    await request(app)
      .post(`/api/platform/admin/tenants/${tenantAId}/admin-resets`)
      .set("Cookie", clubAdminCookie)
      .send({ username: "someone@example.com" })
      .expect(401);
  });

  it("404s for a non-existent tenant", async () => {
    await request(app)
      .post(`/api/platform/admin/tenants/99999999/admin-resets`)
      .set("Cookie", platformCookie)
      .send({ username: "someone@example.com" })
      .expect(404);
  });

  it("bootstraps a brand-new admin and returns a reset link on the tenant host", async () => {
    const email = `secretary+${STAMP}@example.com`;
    const res = await request(app)
      .post(`/api/platform/admin/tenants/${tenantAId}/admin-resets`)
      .set("Cookie", platformCookie)
      .send({ username: email, displayName: "Club Secretary" })
      .expect(201);

    expect(res.body.created).toBe(true);
    expect(res.body.username).toBe(email);
    expect(res.body.tenantName).toBe("Reset Tenant A");
    expect(res.body.resetUrl).toContain(
      `https://reset-a-${STAMP}.test.ovation.app/admin/reset?token=`,
    );

    // The admin now exists on tenant A (and only tenant A).
    const [admin] = await db
      .select()
      .from(adminsTable)
      .where(
        and(
          eq(adminsTable.tenantId, tenantAId),
          eq(adminsTable.username, email),
        ),
      );
    expect(admin).toBeTruthy();
    // A live (unused) token row was minted for that admin.
    const resets = await db
      .select()
      .from(adminPasswordResetsTable)
      .where(eq(adminPasswordResetsTable.adminId, admin.id));
    expect(resets.length).toBe(1);
    expect(resets[0].usedAt).toBeNull();
    expect(resets[0].createdByPlatformAdminId).toBeGreaterThan(0);
  });

  it("resets an existing admin (created=false) and spends the prior token", async () => {
    const email = `secretary+${STAMP}@example.com`;
    const [before] = await db
      .select({ id: adminsTable.id })
      .from(adminsTable)
      .where(
        and(
          eq(adminsTable.tenantId, tenantAId),
          eq(adminsTable.username, email),
        ),
      );

    const res = await request(app)
      .post(`/api/platform/admin/tenants/${tenantAId}/admin-resets`)
      .set("Cookie", platformCookie)
      .send({ username: email })
      .expect(201);
    expect(res.body.created).toBe(false);

    // Exactly one live token remains; the earlier one was spent.
    const live = (
      await db
        .select()
        .from(adminPasswordResetsTable)
        .where(eq(adminPasswordResetsTable.adminId, before.id))
    ).filter((r) => r.usedAt === null);
    expect(live.length).toBe(1);
  });

  it("lets the club admin inspect and redeem the link, then sign in", async () => {
    const email = `captain+${STAMP}@example.com`;
    const issue = await request(app)
      .post(`/api/platform/admin/tenants/${tenantAId}/admin-resets`)
      .set("Cookie", platformCookie)
      .send({ username: email })
      .expect(201);
    const token = tokenOf(issue.body.resetUrl);
    expect(token.length).toBeGreaterThan(10);

    // Inspect (unauthenticated, on the tenant host via the dev header).
    const info = await request(app)
      .get(`/api/auth/password-reset/${token}`)
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(info.body.username).toBe(email);
    expect(info.body.tenantName).toBe("Reset Tenant A");

    // Redeem: set a password of the admin's own choosing.
    const newPassword = "a-fresh-secret-123";
    await request(app)
      .post(`/api/auth/password-reset/${token}`)
      .set("x-tenant-id", String(tenantAId))
      .send({ password: newPassword })
      .expect(204);

    // The link is now spent (single-use).
    await request(app)
      .get(`/api/auth/password-reset/${token}`)
      .set("x-tenant-id", String(tenantAId))
      .expect(410);

    // The new password works against tenant A's login.
    await request(app)
      .post("/api/auth/login")
      .set("x-tenant-id", String(tenantAId))
      .send({ username: email, password: newPassword })
      .expect(200);
  });

  it("rejects a short password (400) without spending the token", async () => {
    const email = `shorty+${STAMP}@example.com`;
    const issue = await request(app)
      .post(`/api/platform/admin/tenants/${tenantAId}/admin-resets`)
      .set("Cookie", platformCookie)
      .send({ username: email })
      .expect(201);
    const token = tokenOf(issue.body.resetUrl);

    await request(app)
      .post(`/api/auth/password-reset/${token}`)
      .set("x-tenant-id", String(tenantAId))
      .send({ password: "short" })
      .expect(400);

    // Still redeemable — the bad attempt didn't consume it.
    await request(app)
      .get(`/api/auth/password-reset/${token}`)
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
  });

  it("refuses to redeem a tenant A link on tenant B's host (tenant-scoped)", async () => {
    const email = `scoped+${STAMP}@example.com`;
    const issue = await request(app)
      .post(`/api/platform/admin/tenants/${tenantAId}/admin-resets`)
      .set("Cookie", platformCookie)
      .send({ username: email })
      .expect(201);
    const token = tokenOf(issue.body.resetUrl);

    // Same token, wrong tenant host → treated as invalid.
    await request(app)
      .get(`/api/auth/password-reset/${token}`)
      .set("x-tenant-id", String(tenantBId))
      .expect(410);
    await request(app)
      .post(`/api/auth/password-reset/${token}`)
      .set("x-tenant-id", String(tenantBId))
      .send({ password: "a-fresh-secret-123" })
      .expect(410);
  });
});
