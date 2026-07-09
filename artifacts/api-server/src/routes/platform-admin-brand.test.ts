import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  platformAdminsTable,
  tenantsTable,
  adminsTable,
  clubsTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Concierge branding write (U2): PATCH /platform/admin/tenants/:id/brand lets a
 * platform admin update any tenant's cosmetic brand fields, targeted purely by
 * the path id, with the brand cache invalidated so the club's site reflects the
 * change immediately. plan/customDomain/backgroundUrl are structurally
 * inadmissible on the body (closed schema) and must never change through here.
 *
 * Real-DB integration test: needs DATABASE_URL, following the existing pattern.
 */

const STAMP = Date.now();
const EMAIL = `super-brand+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("PATCH /platform/admin/tenants/:id/brand: concierge branding", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  /** Main target — deliberately has ZERO club admins (the concierge use-case). */
  let tenantAId: number;
  /** Carries the club admin — cross-surface + concurrent-write tests. */
  let tenantBId: number;
  /** Linked to a clubs-register row via appClubId — KTD8 masking test. */
  let tenantCId: number;
  let registerClubId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-platform-brand";

    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Super", passwordHash });
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];

    const [tenantA] = await db
      .insert(tenantsTable)
      .values({
        slug: `pab-target-${STAMP}`,
        centralClubId: 9301,
        name: "PAB Target",
        plan: "free",
        faviconUrl: "/objects/uploads/pab-favicon-original.png",
        // Pre-set so the closed-schema test can assert "unchanged", not just null.
        backgroundUrl: "/objects/uploads/pab-bg-original.png",
      })
      .returning();
    tenantAId = tenantA.id;

    const [tenantB] = await db
      .insert(tenantsTable)
      .values({
        slug: `pab-other-${STAMP}`,
        centralClubId: 9302,
        name: "PAB Other",
        plan: "free",
      })
      .returning();
    tenantBId = tenantB.id;

    // A club admin in tenant B — its session must NOT reach platform routes,
    // and it drives the self-serve side of the concurrent-write test.
    const [ca] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantBId,
        username: "owner",
        displayName: "Club",
        passwordHash,
      })
      .returning();
    clubAdminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;

    // KTD8 fixture: a clubs-register row with its own colour, linked via appClubId.
    const [club] = await db
      .insert(clubsTable)
      .values({
        name: `PAB Register Club ${STAMP}`,
        primaryColour: "#0000ff",
      })
      .returning();
    registerClubId = club.id;
    const [tenantC] = await db
      .insert(tenantsTable)
      .values({
        slug: `pab-masked-${STAMP}`,
        centralClubId: 9303,
        appClubId: registerClubId,
        name: "PAB Masked",
        plan: "free",
      })
      .returning();
    tenantCId = tenantC.id;
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantBId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantAId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantBId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantCId));
    await db.delete(clubsTable).where(eq(clubsTable.id, registerClubId));
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
  });

  it("updates logo + colours on a tenant with zero admins, live immediately on GET /tenant-brand", async () => {
    // Prime the 5-minute brand cache with the pre-update value.
    const before = await request(app)
      .get("/api/tenant-brand")
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(before.body.logoUrl).not.toBe("/objects/uploads/pab-logo.png");

    const res = await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .set("Cookie", platformCookie)
      .send({
        name: "PAB Target (branded)",
        logoUrl: "/objects/uploads/pab-logo.png",
        primaryColour: "#112233",
        secondaryColour: "#445566",
        tertiaryColour: "#778899",
      })
      .expect(200);
    // AdminTenantDetail shape, same as GET /platform/admin/tenants/:id.
    expect(res.body.tenant.id).toBe(tenantAId);
    expect(res.body.tenant.name).toBe("PAB Target (branded)");
    expect(res.body.tenant.adminCount).toBe(0);
    expect(res.body.admins).toEqual([]);

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantAId));
    expect(row.logoUrl).toBe("/objects/uploads/pab-logo.png");
    expect(row.primaryColour).toBe("#112233");

    // Without invalidateTenantBrandCache, this would still serve the pre-PATCH
    // cached brand for up to 5 minutes.
    const after = await request(app)
      .get("/api/tenant-brand")
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(after.body.name).toBe("PAB Target (branded)");
    expect(after.body.logoUrl).toBe("/objects/uploads/pab-logo.png");
    expect(after.body.primaryColour).toBe("#112233");
    expect(after.body.secondaryColour).toBe("#445566");
    expect(after.body.tertiaryColour).toBe("#778899");
  });

  it("a partial update (only logoUrl) leaves the other brand columns untouched", async () => {
    await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .set("Cookie", platformCookie)
      .send({ logoUrl: "/objects/uploads/pab-logo-v2.png" })
      .expect(200);

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantAId));
    expect(row.logoUrl).toBe("/objects/uploads/pab-logo-v2.png");
    // Colours set by the previous test and the seeded favicon are unaffected.
    expect(row.primaryColour).toBe("#112233");
    expect(row.faviconUrl).toBe("/objects/uploads/pab-favicon-original.png");
  });

  it("an explicit null clears a previously-set field", async () => {
    await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .set("Cookie", platformCookie)
      .send({ faviconUrl: null })
      .expect(200);

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantAId));
    expect(row.faviconUrl).toBeNull();
    // ...and only that field: the logo from the previous test survives.
    expect(row.logoUrl).toBe("/objects/uploads/pab-logo-v2.png");
  });

  it("rejects an unauthenticated request (401)", async () => {
    await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .send({ logoUrl: "/objects/uploads/nope.png" })
      .expect(401);
  });

  it("rejects a club-admin session (cross-surface: club cookie must not authorize platform routes)", async () => {
    await request(app)
      .patch(`/api/platform/admin/tenants/${tenantBId}/brand`)
      .set("Cookie", clubAdminCookie)
      .send({ logoUrl: "/objects/uploads/nope.png" })
      .expect(401);
  });

  it("rejects malformed hex colours via schema validation (400)", async () => {
    await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .set("Cookie", platformCookie)
      .send({ primaryColour: "#12345" })
      .expect(400);
    await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .set("Cookie", platformCookie)
      .send({ primaryColour: "red" })
      .expect(400);

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantAId));
    expect(row.primaryColour).toBe("#112233");
  });

  it("rejects a non-integer tenant id (400)", async () => {
    await request(app)
      .patch(`/api/platform/admin/tenants/abc/brand`)
      .set("Cookie", platformCookie)
      .send({ logoUrl: "/objects/uploads/nope.png" })
      .expect(400);
  });

  it("returns 404 for a well-formed but nonexistent tenant id", async () => {
    await request(app)
      .patch(`/api/platform/admin/tenants/999999999/brand`)
      .set("Cookie", platformCookie)
      .send({ logoUrl: "/objects/uploads/nope.png" })
      .expect(404);
  });

  it("rejects an empty update set (400)", async () => {
    await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .set("Cookie", platformCookie)
      .send({})
      .expect(400);
  });

  it("strips plan/customDomain/backgroundUrl from the body rather than applying them (closed schema)", async () => {
    // AE5: UpdateAdminTenantBrandBody has no such properties at all
    // (additionalProperties: false), so the extra keys are stripped by
    // validation and the valid fields still land (200, not 400).
    const res = await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .set("Cookie", platformCookie)
      .send({
        shortName: "PAB",
        plan: "pro",
        customDomain: "smuggled.example.com",
        backgroundUrl: "/objects/uploads/smuggled-bg.png",
      })
      .expect(200);
    expect(res.body.tenant.plan).toBe("free");
    expect(res.body.tenant.customDomain).toBeNull();

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantAId));
    expect(row.shortName).toBe("PAB");
    expect(row.plan).toBe("free");
    expect(row.customDomain).toBeNull();
    expect(row.backgroundUrl).toBe("/objects/uploads/pab-bg-original.png");
  });

  it("targets the tenant named by the path id even when the request's host context resolves elsewhere", async () => {
    // The x-tenant-id override stands in for a host resolving to a DIFFERENT
    // tenant (B). The write must land on the path-id tenant (A) with no
    // fallback to the request-resolved tenant context.
    await request(app)
      .patch(`/api/platform/admin/tenants/${tenantAId}/brand`)
      .set("Cookie", platformCookie)
      .set("x-tenant-id", String(tenantBId))
      .send({ tertiaryColour: "#abcdef" })
      .expect(200);

    const [rowA] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantAId));
    expect(rowA.tertiaryColour).toBe("#abcdef");
    const [rowB] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantBId));
    expect(rowB.tertiaryColour).toBeNull();
  });

  it("a concierge logo-only save does not clobber a concurrent self-serve colour-only save", async () => {
    // Column-level last-write-wins: each PATCH builds its update set
    // field-by-field (never a whole-row write), so interleaving a platform
    // logo save with a club admin's colour save leaves BOTH fields correct.
    await Promise.all([
      request(app)
        .patch(`/api/platform/admin/tenants/${tenantBId}/brand`)
        .set("Cookie", platformCookie)
        .send({ logoUrl: "/objects/uploads/pab-concierge-logo.png" })
        .expect(200),
      request(app)
        .patch("/api/tenant-brand")
        .set("Cookie", clubAdminCookie)
        .set("x-tenant-id", String(tenantBId))
        .send({ primaryColour: "#224466" })
        .expect(200),
    ]);

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantBId));
    expect(row.logoUrl).toBe("/objects/uploads/pab-concierge-logo.png");
    expect(row.primaryColour).toBe("#224466");
  });

  it("KTD8: a clubs-register colour masks the tenant-row value in the resolved brand", async () => {
    // Known tension, documented deliberately: the brand resolver
    // (lib/tenant-brand.ts buildTenantBrand) prefers the appClubId
    // clubs-register row per field. So for a tenant linked to a register row
    // with a non-null colour, this PATCH persists to the tenants row (and the
    // console will report it), but GET /tenant-brand keeps serving the
    // register's colour — the concierge write appears to "not take" until the
    // register value is cleared or the resolver's precedence changes.
    const res = await request(app)
      .patch(`/api/platform/admin/tenants/${tenantCId}/brand`)
      .set("Cookie", platformCookie)
      .send({ primaryColour: "#ff0000" })
      .expect(200);
    expect(res.body.tenant.id).toBe(tenantCId);

    // Persisted on the tenant row...
    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantCId));
    expect(row.primaryColour).toBe("#ff0000");

    // ...but the resolved brand still serves the clubs-register value.
    const brand = await request(app)
      .get("/api/tenant-brand")
      .set("x-tenant-id", String(tenantCId))
      .expect(200);
    expect(brand.body.primaryColour).toBe("#0000ff");
  });
});
