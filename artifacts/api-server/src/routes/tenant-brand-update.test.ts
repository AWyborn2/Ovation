import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable } from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Tenant-scoped self-service branding endpoint (U3). A club admin can update
 * their own tenant's cosmetic branding fields (name, short name, logo, favicon,
 * colours) without super-admin access; `plan` and `customDomain` stay exclusively
 * on the super-admin-only platform console and cannot be smuggled in through this
 * endpoint's request body.
 *
 * Real-DB integration test: needs DATABASE_URL, following the existing pattern.
 */

const STAMP = Date.now();
const PASSWORD = "correct horse battery";

describe("PATCH /tenant-brand: self-service branding update", () => {
  let tenantAId: number;
  let tenantBId: number;
  let adminACookie: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-tenant-brand-update";

    const [tenantA] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-brand-a-${STAMP}`,
        centralClubId: 8801,
        name: "Iso Brand Tenant A",
        plan: "free",
      })
      .returning();
    tenantAId = tenantA.id;

    const [tenantB] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-brand-b-${STAMP}`,
        centralClubId: 8802,
        name: "Iso Brand Tenant B",
        plan: "free",
      })
      .returning();
    tenantBId = tenantB.id;

    const passwordHash = await hashPassword(PASSWORD);
    const [adminA] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantAId,
        username: "owner",
        displayName: "Owner A",
        passwordHash,
      })
      .returning();
    adminACookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminA.id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantAId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantAId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantBId));
  });

  it("updates the admin's own tenant's logo and colours", async () => {
    const res = await request(app)
      .patch("/api/tenant-brand")
      .set("Cookie", adminACookie)
      .set("x-tenant-id", String(tenantAId))
      .send({
        logoUrl: "/objects/uploads/logo-a.png",
        backgroundColour: "#112233",
        primaryColour: "#445566",
        juniorsColour: "#778899",
      })
      .expect(200);
    expect(res.body.logoUrl).toBe("/objects/uploads/logo-a.png");
    expect(res.body.backgroundColour).toBe("#112233");

    const [row] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantAId));
    expect(row.logoUrl).toBe("/objects/uploads/logo-a.png");
    expect(row.backgroundColour).toBe("#112233");
  });

  it("round-trips the tagline through PATCH and GET (A9)", async () => {
    const res = await request(app)
      .patch("/api/tenant-brand")
      .set("Cookie", adminACookie)
      .set("x-tenant-id", String(tenantAId))
      .send({ tagline: "PROUDLY LOCAL · EST 2010" })
      .expect(200);
    expect(res.body.tagline).toBe("PROUDLY LOCAL · EST 2010");

    const [row] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantAId));
    expect(row.tagline).toBe("PROUDLY LOCAL · EST 2010");

    // Clearing it (explicit null) is honoured, not left at the old value.
    const cleared = await request(app)
      .patch("/api/tenant-brand")
      .set("Cookie", adminACookie)
      .set("x-tenant-id", String(tenantAId))
      .send({ tagline: null })
      .expect(200);
    expect(cleared.body.tagline).toBeNull();
  });

  it("a partial update (only logoUrl) leaves other fields untouched", async () => {
    await request(app)
      .patch("/api/tenant-brand")
      .set("Cookie", adminACookie)
      .set("x-tenant-id", String(tenantAId))
      .send({ logoUrl: "/objects/uploads/logo-a-v2.png" })
      .expect(200);

    const [row] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantAId));
    expect(row.logoUrl).toBe("/objects/uploads/logo-a-v2.png");
    // Colours set by the previous test are unaffected by this partial update.
    expect(row.backgroundColour).toBe("#112233");
  });

  it("rejects an unauthenticated request (401)", async () => {
    await request(app)
      .patch("/api/tenant-brand")
      .set("x-tenant-id", String(tenantAId))
      .send({ logoUrl: "/objects/uploads/nope.png" })
      .expect(401);
  });

  it("a request body carrying plan/customDomain does not change those fields", async () => {
    // UpdateTenantBrandBody has no `plan`/`customDomain` properties at all
    // (additionalProperties: false), so the extra keys are stripped by
    // validation rather than silently applied.
    const res = await request(app)
      .patch("/api/tenant-brand")
      .set("Cookie", adminACookie)
      .set("x-tenant-id", String(tenantAId))
      .send({
        name: "Iso Brand Tenant A (renamed)",
        plan: "pro",
        customDomain: "smuggled.example.com",
      })
      .expect(200);
    expect(res.body.name).toBe("Iso Brand Tenant A (renamed)");

    const [row] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantAId));
    expect(row.plan).toBe("free");
    expect(row.customDomain).toBeNull();
  });

  it("cannot update a different tenant's branding (cross-tenant isolation)", async () => {
    const res = await request(app)
      .patch("/api/tenant-brand")
      .set("Cookie", adminACookie)
      .set("x-tenant-id", String(tenantBId))
      .send({ name: "Hijacked by tenant A" })
      .expect(401);
    expect(res.status).toBe(401);

    const [rowB] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantBId));
    expect(rowB.name).toBe("Iso Brand Tenant B");
  });

  it("is rejected (not silently scoped to the default tenant) on a host with no tenant-id override", async () => {
    // No x-tenant-id header at all simulates an unrecognized host falling through
    // to DEFAULT_TENANT_ID (Halls Head, #1) — admin A's session must not be
    // treated as authenticated for that fallback tenant either.
    await request(app)
      .patch("/api/tenant-brand")
      .set("Cookie", adminACookie)
      .send({ name: "Should not land on Halls Head" })
      .expect(401);
  });

  it("invalidates the 5-minute tenant-brand cache so a GET right after a PATCH reflects the new value", async () => {
    // Prime the cache with the pre-update value.
    const before = await request(app)
      .get("/api/tenant-brand")
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(before.body.name).not.toBe("Iso Brand Tenant A (cache-test)");

    await request(app)
      .patch("/api/tenant-brand")
      .set("Cookie", adminACookie)
      .set("x-tenant-id", String(tenantAId))
      .send({ name: "Iso Brand Tenant A (cache-test)" })
      .expect(200);

    // Without invalidateTenantBrandCache, this would still serve the
    // pre-PATCH cached value for up to 5 minutes.
    const after = await request(app)
      .get("/api/tenant-brand")
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(after.body.name).toBe("Iso Brand Tenant A (cache-test)");
  });
});
