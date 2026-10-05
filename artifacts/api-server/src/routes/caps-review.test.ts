import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, capRegisterTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * The cap confirmation step (Ash, 5 Oct 2026): automatically issued caps are
 * "pending" — off the public register until an admin confirms them; an admin
 * can renumber them (issued in the wrong order) or decline one, which keeps it
 * from being issued again and closes the gap. Real-DB integration test.
 */

const STAMP = Date.now();

describe("cap confirmation", () => {
  let tenantId: number;
  let adminId: number;
  let cookie: string;
  const ids: Record<string, number> = {};

  const as = (r: request.Test) => r.set("x-tenant-id", String(tenantId)).set("Cookie", cookie);
  const publicCaps = async () =>
    (await request(app).get("/api/caps").set("x-tenant-id", String(tenantId)).expect(200))
      .body as Array<{ name: string; capNumber: number }>;
  const review = async () =>
    (await as(request(app).get("/api/caps/review")).expect(200)).body as Array<{
      id: number;
      name: string;
      capNumber: number;
      status: string;
    }>;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-caps-review";
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `caps-review-${STAMP}`,
        centralClubId: 9961,
        readsFromCentral: true,
        name: "Cap Review Club",
        plan: "pro",
      })
      .returning();
    tenantId = t.id;
    const rows = await db
      .insert(capRegisterTable)
      .values([
        { tenantId, capNumber: 10, name: "Confirmed Ten", playerId: 10 },
        // Issued automatically, in the wrong order: Bea debuted before Al.
        { tenantId, capNumber: 11, name: "Al Second", playerId: 11, status: "pending" },
        { tenantId, capNumber: 12, name: "Bea First", playerId: 12, status: "pending" },
        { tenantId, capNumber: 13, name: "Cy Fill-in", playerId: 13, status: "pending" },
      ])
      .returning();
    for (const r of rows) ids[r.name] = r.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: `caps_review_admin_${STAMP}`,
        displayName: "Caps Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(capRegisterTable).where(eq(capRegisterTable.tenantId, tenantId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  it("pending caps stay off the public register and need an admin to review", async () => {
    expect((await publicCaps()).map((c) => c.name)).toEqual(["Confirmed Ten"]);
    await request(app).get("/api/caps/review").set("x-tenant-id", String(tenantId)).expect(401);
    expect((await review()).map((c) => [c.name, c.capNumber, c.status])).toEqual([
      ["Al Second", 11, "pending"],
      ["Bea First", 12, "pending"],
      ["Cy Fill-in", 13, "pending"],
    ]);
  });

  it("reorder renumbers the pending caps in the chosen order, and needs all of them", async () => {
    await as(request(app).post("/api/caps/review/reorder"))
      .send({ category: "male", ids: [ids["Bea First"], ids["Al Second"]] })
      .expect(400);
    const res = await as(request(app).post("/api/caps/review/reorder"))
      .send({
        category: "male",
        ids: [ids["Bea First"], ids["Al Second"], ids["Cy Fill-in"]],
      })
      .expect(200);
    expect(res.body.map((c: { name: string; capNumber: number }) => [c.name, c.capNumber])).toEqual(
      [
        ["Bea First", 11],
        ["Al Second", 12],
        ["Cy Fill-in", 13],
      ],
    );
  });

  it("decline closes the gap and keeps the player from being capped again; restore undoes it", async () => {
    const declined = await as(request(app).post(`/api/caps/${ids["Al Second"]}/decline`)).expect(
      200,
    );
    expect(declined.body.status).toBe("declined");
    const after = await review();
    expect(after.map((c) => [c.name, c.capNumber, c.status])).toEqual([
      ["Bea First", 11, "pending"],
      ["Cy Fill-in", 12, "pending"],
      ["Al Second", -ids["Al Second"], "declined"],
    ]);
    // Declining twice is a 404 (it's no longer pending).
    await as(request(app).post(`/api/caps/${ids["Al Second"]}/decline`)).expect(404);

    const restored = await as(request(app).post(`/api/caps/${ids["Al Second"]}/restore`)).expect(
      200,
    );
    expect([restored.body.status, restored.body.capNumber]).toEqual(["pending", 13]);
    await as(request(app).post(`/api/caps/${ids["Al Second"]}/decline`)).expect(200);
  });

  it("catch-up is admin-only and reports a club with no debut data", async () => {
    await request(app)
      .post("/api/caps/review/catch-up")
      .set("x-tenant-id", String(tenantId))
      .expect(401);
    // This club's central club has no matches: nothing to issue.
    const res = await as(request(app).post("/api/caps/review/catch-up")).expect(200);
    expect(res.body.issued).toBe(0);
  });

  it("confirm puts pending caps on the public register", async () => {
    const res = await as(request(app).post("/api/caps/review/confirm"))
      .send({ ids: [ids["Bea First"], ids["Al Second"]] })
      .expect(200);
    // Al is declined, so only Bea is confirmed.
    expect(res.body.updated).toBe(1);
    expect((await publicCaps()).map((c) => [c.name, c.capNumber])).toEqual([
      ["Confirmed Ten", 10],
      ["Bea First", 11],
    ]);
    const [cy] = await db
      .select()
      .from(capRegisterTable)
      .where(
        and(eq(capRegisterTable.tenantId, tenantId), eq(capRegisterTable.id, ids["Cy Fill-in"])),
      );
    expect(cy?.status).toBe("pending");
  });
});
