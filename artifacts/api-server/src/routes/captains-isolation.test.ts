import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, captainsTable } from "@workspace/db";
import {
  SESSION_COOKIE,
  CAPTAIN_SESSION_COOKIE,
  encodeSession,
  encodeCaptainSession,
  hashPassword,
  getCaptainByUsername,
} from "../lib/auth";
import { resolveCaptain } from "../middlewares/require-captain";

/**
 * Tenant-scoped captains (Phase 3 U1) — closes a live cross-tenant gap: before
 * this, `GET/PATCH/DELETE /captains` had no tenant filter at all, so any club
 * admin could list, rename, delete, or reset the password of a captain
 * belonging to ANY other tenant. Mirrors admins-isolation.test.ts's pattern
 * (same username exists independently per tenant; a session minted for one
 * tenant is rejected on another) plus HTTP-level checks on the admin-facing
 * captain-management routes. Real-DB integration test (needs DATABASE_URL).
 */

const STAMP = Date.now();

function reqFor(tenantId: number, sessionToken?: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === "x-tenant-id" ? String(tenantId) : undefined,
    headers: {},
    cookies: sessionToken ? { [CAPTAIN_SESSION_COOKIE]: sessionToken } : {},
  } as unknown as Request;
}

describe("tenant-scoped captains", () => {
  let tenantA: number;
  let tenantB: number;
  let captainA: number;
  let captainB: number;
  let adminBId: number;
  let adminBCookie: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-captains-isolation";

    const [a] = await db
      .insert(tenantsTable)
      .values({ slug: `iso-cap-a-${STAMP}`, centralClubId: 9201, name: "Iso Captain A" })
      .returning();
    const [b] = await db
      .insert(tenantsTable)
      .values({ slug: `iso-cap-b-${STAMP}`, centralClubId: 9202, name: "Iso Captain B" })
      .returning();
    tenantA = a.id;
    tenantB = b.id;

    const passwordHash = await hashPassword("correct horse battery");
    const [ca] = await db
      .insert(captainsTable)
      .values({ tenantId: tenantA, username: "skipper", displayName: "Captain A", passwordHash })
      .returning();
    captainA = ca.id;
    const [cb] = await db
      .insert(captainsTable)
      .values({ tenantId: tenantB, username: "skipper", displayName: "Captain B", passwordHash })
      .returning();
    captainB = cb.id;

    const [adminB] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantB,
        username: `iso_cap_admin_${STAMP}`,
        displayName: "Iso Admin B",
        passwordHash: "x",
      })
      .returning();
    adminBId = adminB.id;
    adminBCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminBId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(captainsTable).where(eq(captainsTable.tenantId, tenantA));
    await db.delete(captainsTable).where(eq(captainsTable.tenantId, tenantB));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminBId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantA));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantB));
  });

  it("the same username exists independently per tenant", async () => {
    const a = await getCaptainByUsername(tenantA, "skipper");
    const b = await getCaptainByUsername(tenantB, "skipper");
    expect(a?.tenantId).toBe(tenantA);
    expect(b?.tenantId).toBe(tenantB);
    expect(a?.id).not.toBe(b?.id);
  });

  it("resolveCaptain accepts a session on its own tenant", async () => {
    const token = encodeCaptainSession({ captainId: captainA, issuedAt: Date.now() });
    const captain = await resolveCaptain(reqFor(tenantA, token));
    expect(captain?.id).toBe(captainA);
  });

  it("resolveCaptain rejects tenant A's session on tenant B (cross-tenant)", async () => {
    const token = encodeCaptainSession({ captainId: captainA, issuedAt: Date.now() });
    const captain = await resolveCaptain(reqFor(tenantB, token));
    expect(captain).toBeNull();
  });

  it("GET /captains as tenant B's admin never lists tenant A's captains", async () => {
    const res = await request(app)
      .get("/api/captains")
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantB))
      .expect(200);
    const ids = (res.body as Array<{ id: number }>).map((c) => c.id);
    expect(ids).toContain(captainB);
    expect(ids).not.toContain(captainA);
  });

  it("PATCH /captains/:id cannot rename another tenant's captain", async () => {
    await request(app)
      .patch(`/api/captains/${captainA}`)
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantB))
      .send({ displayName: "Hijacked" })
      .expect(404);

    const [row] = await db.select().from(captainsTable).where(eq(captainsTable.id, captainA));
    expect(row.displayName).toBe("Captain A");
  });

  it("DELETE /captains/:id cannot delete another tenant's captain", async () => {
    await request(app)
      .delete(`/api/captains/${captainA}`)
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantB))
      .expect(404);

    const [row] = await db.select().from(captainsTable).where(eq(captainsTable.id, captainA));
    expect(row).toBeDefined();
  });

  it("POST /captain-auth/login only authenticates within the caller's own tenant", async () => {
    const okOwnTenant = await request(app)
      .post("/api/captain-auth/login")
      .set("x-tenant-id", String(tenantA))
      .send({ username: "skipper", password: "correct horse battery" });
    expect(okOwnTenant.status).toBe(200);
    expect(okOwnTenant.body.id).toBe(captainA);

    // Same username/password, but tenant B's own "skipper" row — must resolve
    // to captain B, never captain A, even though the credentials collide.
    const otherTenant = await request(app)
      .post("/api/captain-auth/login")
      .set("x-tenant-id", String(tenantB))
      .send({ username: "skipper", password: "correct horse battery" });
    expect(otherTenant.status).toBe(200);
    expect(otherTenant.body.id).toBe(captainB);
  });
});
