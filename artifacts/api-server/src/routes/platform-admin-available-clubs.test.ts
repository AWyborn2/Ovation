import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  platformAdminsTable,
  adminsTable,
  tenantsTable,
  provisioningExclusionsTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * The concierge-provisioning club picker (docs/plans/2026-07-31-002): unlike
 * the public self-serve picker, a club excluded "self_serve_only" stays
 * visible here so a platform admin can still provision it directly. A club
 * excluded "everywhere" is hidden from both.
 *
 * Real-DB integration test: needs DATABASE_URL AND CENTRAL_DATABASE_URL.
 */

const STAMP = Date.now();
const EMAIL = `super-admin-clubs+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("platform-admin available-clubs (concierge picker)", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let throwawayTenantId: number;
  const createdExclusionIds: number[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-admin-available-clubs";

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
        slug: `pa-avail-clubs-${STAMP}`,
        centralClubId: 9305,
        name: "PA Available Clubs Throwaway",
        plan: "free",
      })
      .returning();
    throwawayTenantId = t!.id;
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

  afterEach(async () => {
    for (const id of createdExclusionIds.splice(0)) {
      await db.delete(provisioningExclusionsTable).where(eq(provisioningExclusionsTable.id, id));
    }
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, throwawayTenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, throwawayTenantId));
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
  });

  it("excludes an 'everywhere' club from the concierge picker", async () => {
    const before = await request(app)
      .get("/api/platform/admin/available-clubs")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(before.body.length).toBeGreaterThan(0);
    const club = before.body[0];

    const [exclusion] = await db
      .insert(provisioningExclusionsTable)
      .values({
        centralClubId: club.centralClubId,
        clubName: club.name,
        visibility: "everywhere",
        createdByPlatformAdminId: 1,
      })
      .returning();
    createdExclusionIds.push(exclusion!.id);

    const after = await request(app)
      .get("/api/platform/admin/available-clubs")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(
      after.body.some((c: { centralClubId: number }) => c.centralClubId === club.centralClubId),
    ).toBe(false);
  });

  it("keeps a 'self_serve_only' club visible to the concierge picker", async () => {
    const before = await request(app)
      .get("/api/platform/admin/available-clubs")
      .set("Cookie", platformCookie)
      .expect(200);
    const club = before.body[0];

    const [exclusion] = await db
      .insert(provisioningExclusionsTable)
      .values({
        centralClubId: club.centralClubId,
        clubName: club.name,
        visibility: "self_serve_only",
        createdByPlatformAdminId: 1,
      })
      .returning();
    createdExclusionIds.push(exclusion!.id);

    // Still hidden from the public self-serve picker...
    const publicList = await request(app).get("/api/platform/available-clubs").expect(200);
    expect(
      publicList.body.some((c: { centralClubId: number }) => c.centralClubId === club.centralClubId),
    ).toBe(false);

    // ...but still visible to the concierge picker.
    const adminList = await request(app)
      .get("/api/platform/admin/available-clubs")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(
      adminList.body.some((c: { centralClubId: number }) => c.centralClubId === club.centralClubId),
    ).toBe(true);
  });

  it("401s without a platform session", async () => {
    await request(app).get("/api/platform/admin/available-clubs").expect(401);
  });

  it("rejects a club-admin session (cross-surface isolation)", async () => {
    await request(app)
      .get("/api/platform/admin/available-clubs")
      .set("Cookie", clubAdminCookie)
      .expect(401);
  });
});
