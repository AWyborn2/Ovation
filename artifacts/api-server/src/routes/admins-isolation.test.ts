import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, adminsTable } from "@workspace/db";
import {
  SESSION_COOKIE,
  encodeSession,
  hashPassword,
  getAdminByUsernameForTenant,
} from "../lib/auth";
import { resolveAdmin } from "../middlewares/require-admin";

/**
 * Tenant-scoped admin auth (Phase 2b). Two clubs can each have an `owner` admin;
 * a session minted for one tenant must never authorise actions on another. Real-DB
 * integration test (needs DATABASE_URL; central NOT required).
 */

const STAMP = Date.now();

function reqFor(tenantId: number, sessionToken?: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === "x-tenant-id" ? String(tenantId) : undefined,
    headers: {},
    cookies: sessionToken ? { [SESSION_COOKIE]: sessionToken } : {},
  } as unknown as Request;
}

describe("tenant-scoped admins", () => {
  let tenantA: number;
  let tenantB: number;
  let adminA: number;

  beforeAll(async () => {
    const [a] = await db
      .insert(tenantsTable)
      .values({ slug: `iso-adm-a-${STAMP}`, centralClubId: 9101, name: "Iso Admin A" })
      .returning();
    const [b] = await db
      .insert(tenantsTable)
      .values({ slug: `iso-adm-b-${STAMP}`, centralClubId: 9102, name: "Iso Admin B" })
      .returning();
    tenantA = a.id;
    tenantB = b.id;

    const passwordHash = await hashPassword("correct horse battery");
    const [ra] = await db
      .insert(adminsTable)
      .values({ tenantId: tenantA, username: "owner", displayName: "A", passwordHash })
      .returning();
    adminA = ra.id;
    await db
      .insert(adminsTable)
      .values({ tenantId: tenantB, username: "owner", displayName: "B", passwordHash });
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantA));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantB));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantA));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantB));
  });

  it("the same username exists independently per tenant", async () => {
    const a = await getAdminByUsernameForTenant(tenantA, "owner");
    const b = await getAdminByUsernameForTenant(tenantB, "owner");
    expect(a?.tenantId).toBe(tenantA);
    expect(b?.tenantId).toBe(tenantB);
    expect(a?.id).not.toBe(b?.id);
  });

  it("resolveAdmin accepts a session on its own tenant", async () => {
    const token = encodeSession({ adminId: adminA, issuedAt: Date.now() });
    const admin = await resolveAdmin(reqFor(tenantA, token));
    expect(admin?.id).toBe(adminA);
  });

  it("resolveAdmin rejects tenant A's session on tenant B (cross-tenant)", async () => {
    const token = encodeSession({ adminId: adminA, issuedAt: Date.now() });
    const admin = await resolveAdmin(reqFor(tenantB, token));
    expect(admin).toBeNull();
  });
});
