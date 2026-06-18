import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, playerIdMapTable } from "@workspace/db";

/**
 * Self-serve signup E2E (Phase 2b). Picks a real available central club, claims a
 * subdomain, creates the first admin, and asserts the club then disappears from
 * the picker and the slug/club can't be claimed twice. Reserved slugs and an
 * SIGNUP_MODE=off kill-switch are rejected.
 *
 * Real-DB integration test: needs DATABASE_URL AND CENTRAL_DATABASE_URL (it reads
 * central.clubs and mints the player crosswalk), following the supertest pattern.
 */

const STAMP = Date.now();
const SLUG = `iso-signup-${STAMP}`.slice(0, 40);

describe("platform self-serve signup", () => {
  let createdTenantId: number | null = null;

  beforeAll(() => {
    process.env.SIGNUP_MODE = "pca";
  });

  afterEach(() => {
    process.env.SIGNUP_MODE = "pca";
  });

  afterAll(async () => {
    if (createdTenantId != null) {
      await db.delete(adminsTable).where(eq(adminsTable.tenantId, createdTenantId));
      await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, createdTenantId));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, createdTenantId));
    }
    delete process.env.SIGNUP_MODE;
  });

  it("provisions a tenant from an available club and removes it from the picker", async () => {
    const before = await request(app).get("/api/platform/available-clubs");
    expect(before.status).toBe(200);
    expect(Array.isArray(before.body)).toBe(true);
    expect(before.body.length).toBeGreaterThan(0);

    const club = before.body[0];

    const signup = await request(app)
      .post("/api/platform/signup")
      .send({
        centralClubId: club.centralClubId,
        slug: SLUG,
        adminEmail: `owner+${STAMP}@example.com`,
        password: "correct horse battery",
      });
    expect(signup.status).toBe(201);
    expect(signup.body.slug).toBe(SLUG);
    expect(signup.body.redirectUrl).toContain(`${SLUG}.`);
    createdTenantId = signup.body.tenantId;

    // The tenant exists, reads from central, and got its first admin.
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, createdTenantId!));
    expect(tenant.readsFromCentral).toBe(true);
    expect(tenant.centralClubId).toBe(club.centralClubId);
    const admins = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.tenantId, createdTenantId!));
    expect(admins).toHaveLength(1);

    // The claimed club is no longer offered.
    const after = await request(app).get("/api/platform/available-clubs");
    expect(
      after.body.some((c: { centralClubId: number }) => c.centralClubId === club.centralClubId),
    ).toBe(false);
  });

  it("rejects re-claiming the same slug (409)", async () => {
    const dup = await request(app)
      .post("/api/platform/signup")
      .send({
        centralClubId: 999999, // irrelevant; slug check should fire
        slug: SLUG,
        adminEmail: `dupe+${STAMP}@example.com`,
        password: "correct horse battery",
      });
    expect(dup.status).toBe(409);
  });

  it("rejects a reserved slug (400)", async () => {
    const res = await request(app)
      .post("/api/platform/signup")
      .send({
        centralClubId: 1,
        slug: "admin",
        adminEmail: `x+${STAMP}@example.com`,
        password: "correct horse battery",
      });
    expect(res.status).toBe(400);
  });

  it("is disabled when SIGNUP_MODE=off (403)", async () => {
    process.env.SIGNUP_MODE = "off";
    const clubs = await request(app).get("/api/platform/available-clubs");
    expect(clubs.status).toBe(403);
    const signup = await request(app)
      .post("/api/platform/signup")
      .send({
        centralClubId: 1,
        slug: `off-${STAMP}`,
        adminEmail: `x@example.com`,
        password: "correct horse battery",
      });
    expect(signup.status).toBe(403);
  });
});
