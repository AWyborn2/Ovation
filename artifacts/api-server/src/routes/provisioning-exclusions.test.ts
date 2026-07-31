import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, platformAdminsTable, adminsTable, tenantsTable, provisioningExclusionsTable } from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Platform-admin-managed provisioning exclusions (docs/plans/2026-07-31-002):
 * add/list/remove central clubs excluded from provisioning, independent of
 * central.clubs.active_to. Real-DB integration test: needs DATABASE_URL AND
 * CENTRAL_DATABASE_URL (creating an exclusion resolves the club against
 * central.clubs to snapshot its name).
 */

const STAMP = Date.now();
const EMAIL = `super-exclusions+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";
// A real central club id this deployment's central DB has, used only to prove
// create/list/delete succeed end-to-end; picked from the seeded PCA dataset
// documented in CLAUDE.md (Halls Head = 1) rather than an arbitrary guess.
const REAL_CENTRAL_CLUB_ID = 1;

describe("platform-admin provisioning exclusions", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let throwawayTenantId: number;
  const createdExclusionIds: number[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-provisioning-exclusions";

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
        slug: `pa-exclusions-${STAMP}`,
        centralClubId: 9304,
        name: "PA Exclusions Throwaway",
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

  it("lists an empty array when nothing is excluded for this club yet", async () => {
    const res = await request(app)
      .get("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(
      res.body.some((e: { centralClubId: number }) => e.centralClubId === REAL_CENTRAL_CLUB_ID),
    ).toBe(false);
  });

  it("creates an exclusion, snapshotting the club's name, and it appears in the list", async () => {
    const res = await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .send({ centralClubId: REAL_CENTRAL_CLUB_ID, visibility: "everywhere", reason: "test" })
      .expect(201);
    expect(res.body.centralClubId).toBe(REAL_CENTRAL_CLUB_ID);
    expect(res.body.visibility).toBe("everywhere");
    expect(res.body.reason).toBe("test");
    expect(res.body.clubName).toBeTruthy();
    createdExclusionIds.push(res.body.id);

    const list = await request(app)
      .get("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(
      list.body.some((e: { id: number }) => e.id === res.body.id),
    ).toBe(true);
  });

  it("creating an exclusion with no reason omits it (null)", async () => {
    const res = await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .send({ centralClubId: REAL_CENTRAL_CLUB_ID, visibility: "self_serve_only" })
      .expect(201);
    expect(res.body.reason).toBeNull();
    createdExclusionIds.push(res.body.id);
  });

  it("404s creating an exclusion for an unknown central club id", async () => {
    await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .send({ centralClubId: 999999999, visibility: "everywhere" })
      .expect(404);
  });

  it("409s creating a second exclusion for an already-excluded club", async () => {
    const first = await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .send({ centralClubId: REAL_CENTRAL_CLUB_ID, visibility: "everywhere" })
      .expect(201);
    createdExclusionIds.push(first.body.id);

    await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .send({ centralClubId: REAL_CENTRAL_CLUB_ID, visibility: "self_serve_only" })
      .expect(409);
  });

  it("400s creating an exclusion with an invalid visibility value", async () => {
    await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .send({ centralClubId: REAL_CENTRAL_CLUB_ID, visibility: "not-a-real-value" })
      .expect(400);
  });

  it("deletes an exclusion and it no longer appears in the list", async () => {
    const created = await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .send({ centralClubId: REAL_CENTRAL_CLUB_ID, visibility: "everywhere" })
      .expect(201);

    await request(app)
      .delete(`/api/platform/admin/provisioning-exclusions/${created.body.id}`)
      .set("Cookie", platformCookie)
      .expect(204);

    const list = await request(app)
      .get("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(list.body.some((e: { id: number }) => e.id === created.body.id)).toBe(false);
  });

  it("404s deleting a nonexistent exclusion", async () => {
    await request(app)
      .delete("/api/platform/admin/provisioning-exclusions/999999999")
      .set("Cookie", platformCookie)
      .expect(404);
  });

  it("401s all three endpoints without a platform session", async () => {
    await request(app).get("/api/platform/admin/provisioning-exclusions").expect(401);
    await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .send({ centralClubId: REAL_CENTRAL_CLUB_ID, visibility: "everywhere" })
      .expect(401);
    await request(app).delete("/api/platform/admin/provisioning-exclusions/1").expect(401);
  });

  it("rejects a club-admin session on all three endpoints (cross-surface isolation)", async () => {
    await request(app)
      .get("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", clubAdminCookie)
      .expect(401);
    await request(app)
      .post("/api/platform/admin/provisioning-exclusions")
      .set("Cookie", clubAdminCookie)
      .send({ centralClubId: REAL_CENTRAL_CLUB_ID, visibility: "everywhere" })
      .expect(401);
    await request(app)
      .delete("/api/platform/admin/provisioning-exclusions/1")
      .set("Cookie", clubAdminCookie)
      .expect(401);
  });
});
