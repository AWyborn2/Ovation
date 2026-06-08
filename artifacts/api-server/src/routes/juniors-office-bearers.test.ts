import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { db, adminsTable, juniorOfficeBearersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SEASON = 2099;

describe("junior office bearers CRUD (integration)", () => {
  let adminId: number;
  let adminCookie: string;
  const createdIds: number[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-junior-office-bearers";

    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_job_${Date.now()}`,
        displayName: "Test Admin JOB",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await db
        .delete(juniorOfficeBearersTable)
        .where(eq(juniorOfficeBearersTable.id, id));
    }
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  });

  it("rejects writes without an admin session", async () => {
    await request(app)
      .post("/api/juniors/office-bearers")
      .send({ season: SEASON, role: "President", name: "Nope" })
      .expect(401);
    await request(app).get("/api/juniors/office-bearers/all").expect(401);
  });

  it("creates, lists (admin + public), updates, and deletes", async () => {
    // Create an unpublished record with a participant link.
    const createRes = await request(app)
      .post("/api/juniors/office-bearers")
      .set("Cookie", adminCookie)
      .send({
        season: SEASON,
        role: "President",
        name: "Test Bearer",
        participantId: "test-participant-xyz",
        displayOrder: 1,
        published: false,
      })
      .expect(201);
    const id = createRes.body.id as number;
    createdIds.push(id);
    expect(createRes.body.participantId).toBe("test-participant-xyz");
    expect(createRes.body.published).toBe(false);

    // Admin "all" list includes the unpublished row.
    const allRes = await request(app)
      .get("/api/juniors/office-bearers/all")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(
      (allRes.body as Array<{ id: number }>).some((r) => r.id === id),
    ).toBe(true);

    // Public list excludes the unpublished row.
    const publicBefore = await request(app)
      .get("/api/juniors/office-bearers")
      .expect(200);
    expect(
      (publicBefore.body as Array<{ id: number }>).some((r) => r.id === id),
    ).toBe(false);

    // Publish + unlink the participant.
    const patchRes = await request(app)
      .patch(`/api/juniors/office-bearers/${id}`)
      .set("Cookie", adminCookie)
      .send({ published: true, participantId: null })
      .expect(200);
    expect(patchRes.body.published).toBe(true);
    expect(patchRes.body.participantId).toBeNull();

    // Public list now includes it.
    const publicAfter = await request(app)
      .get("/api/juniors/office-bearers")
      .expect(200);
    expect(
      (publicAfter.body as Array<{ id: number }>).some((r) => r.id === id),
    ).toBe(true);

    // Delete it.
    await request(app)
      .delete(`/api/juniors/office-bearers/${id}`)
      .set("Cookie", adminCookie)
      .expect(204);

    // Gone from admin list.
    const allAfter = await request(app)
      .get("/api/juniors/office-bearers/all")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(
      (allAfter.body as Array<{ id: number }>).some((r) => r.id === id),
    ).toBe(false);
  });
});
