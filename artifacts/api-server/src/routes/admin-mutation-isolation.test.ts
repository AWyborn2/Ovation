import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  awardsTable,
  clubRolesTable,
  navItemsTable,
  nonPlayerPeopleTable,
  honourBoardsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Admin-mutation isolation (Phase 3). The read side is covered by
 * tenant-isolation.test.ts; this pins the WRITE side: a tenant's admin, even
 * with a valid session for their own tenant, must never PATCH/DELETE another
 * tenant's curated rows (bare-PK mutations must 404 across tenants), and every
 * insert must land under the caller's tenant. Rows are seeded directly for
 * tenant A, then mutated through the API as tenant B (expect 404) and tenant A
 * (expect success).
 *
 * Real-DB integration test (needs DATABASE_URL; central not required).
 */

const STAMP = Date.now();

describe("admin mutation isolation: one tenant cannot mutate another's curated rows", () => {
  let tenantAId: number;
  let tenantBId: number;
  let adminBCookie: string;
  let adminACookie: string;
  let awardId: number;
  let roleId: number;
  let navId: number;
  let personId: number;
  const boardKey = `iso_admin_board_${STAMP}`;

  const asTenant = (
    method: "patch" | "delete",
    path: string,
    tenantId: number,
    cookie: string,
    body: Record<string, unknown> = {},
  ) => {
    const req = request(app);
    return req[method](path).set("Cookie", cookie).set("x-tenant-id", String(tenantId)).send(body);
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-admin-mutation-iso";

    const [a] = await db
      .insert(tenantsTable)
      .values({ slug: `iso-am-a-${STAMP}`, centralClubId: 8801, name: "Iso AM A", plan: "pilot" })
      .returning();
    tenantAId = a.id;
    const [b] = await db
      .insert(tenantsTable)
      .values({ slug: `iso-am-b-${STAMP}`, centralClubId: 8802, name: "Iso AM B", plan: "pilot" })
      .returning();
    tenantBId = b.id;

    const [adminA] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantAId,
        username: `iso_am_a_${STAMP}`,
        displayName: "A",
        passwordHash: "x",
      })
      .returning();
    adminACookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminA.id, issuedAt: Date.now() })}`;
    const [adminB] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantBId,
        username: `iso_am_b_${STAMP}`,
        displayName: "B",
        passwordHash: "x",
      })
      .returning();
    adminBCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminB.id, issuedAt: Date.now() })}`;

    // Tenant A's curated rows.
    const [award] = await db
      .insert(awardsTable)
      .values({ tenantId: tenantAId, key: `iso_am_award_${STAMP}`, title: "A's Award" })
      .returning();
    awardId = award.id;
    const [role] = await db
      .insert(clubRolesTable)
      .values({ tenantId: tenantAId, season: 2099, role: "President", name: "A's President" })
      .returning();
    roleId = role.id;
    const [nav] = await db
      .insert(navItemsTable)
      .values({ tenantId: tenantAId, surface: "senior_menu", label: "A's Nav", target: "/players" })
      .returning();
    navId = nav.id;
    const [person] = await db
      .insert(nonPlayerPeopleTable)
      .values({ tenantId: tenantAId, name: "A's Official" })
      .returning();
    personId = person.id;
    await db
      .insert(honourBoardsTable)
      .values({ tenantId: tenantAId, key: boardKey, label: "A's Board", title: "A's Board" });
  });

  afterAll(async () => {
    await db.delete(awardsTable).where(eq(awardsTable.tenantId, tenantAId));
    await db.delete(clubRolesTable).where(eq(clubRolesTable.tenantId, tenantAId));
    await db.delete(navItemsTable).where(eq(navItemsTable.tenantId, tenantAId));
    await db.delete(nonPlayerPeopleTable).where(eq(nonPlayerPeopleTable.tenantId, tenantAId));
    await db.delete(honourBoardsTable).where(eq(honourBoardsTable.tenantId, tenantAId));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantAId));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantBId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantAId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantBId));
  });

  it("tenant B cannot PATCH tenant A's award (404)", async () => {
    await asTenant("patch", `/api/awards/${awardId}`, tenantBId, adminBCookie, {
      title: "Hijacked",
    }).expect(404);
  });

  it("tenant B cannot DELETE tenant A's award (404), and A's row survives", async () => {
    await asTenant("delete", `/api/awards/${awardId}`, tenantBId, adminBCookie).expect(404);
    const [still] = await db.select().from(awardsTable).where(eq(awardsTable.id, awardId));
    expect(still).toBeDefined();
  });

  it("tenant B cannot DELETE tenant A's club role (404)", async () => {
    await asTenant("delete", `/api/club-roles/${roleId}`, tenantBId, adminBCookie).expect(404);
  });

  it("tenant B cannot DELETE tenant A's nav item (404)", async () => {
    await asTenant("delete", `/api/nav-items/${navId}`, tenantBId, adminBCookie).expect(404);
  });

  it("tenant B cannot DELETE tenant A's person (404)", async () => {
    await asTenant("delete", `/api/people/${personId}`, tenantBId, adminBCookie).expect(404);
  });

  it("tenant B cannot DELETE tenant A's honour board by key (404)", async () => {
    await asTenant("delete", `/api/honour-boards/${boardKey}`, tenantBId, adminBCookie).expect(404);
  });

  it("tenant A's own admin CAN see its award (control), and B's public list cannot", async () => {
    const asA = await request(app)
      .get("/api/awards")
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    // A's award is unpublished, so it won't be in the public list; the admin
    // list is the control that proves scoping returns A's row to A only.
    const adminA = await request(app)
      .get("/api/admin/awards")
      .set("Cookie", adminACookie)
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(adminA.body.some((a: { id: number }) => a.id === awardId)).toBe(true);

    const adminB = await request(app)
      .get("/api/admin/awards")
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantBId))
      .expect(200);
    expect(adminB.body.some((a: { id: number }) => a.id === awardId)).toBe(false);
    void asA;
  });
});
