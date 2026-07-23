import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Fixtures + team-list store (Pack A U6).
 *
 * Real-DB integration in the same shape as milestones-isolation.test.ts: two
 * fresh tenants, one admin each, everything created (and removed) by this
 * suite. Covers tenant-scoped CRUD, startAt validation, team-list roles/order,
 * free-typed players, the fill-in exclusion invariant (playerId >= 90000
 * rejected), the one-XI-per-fixture upsert, and the social-settings
 * seasonStartDate override.
 */

const STAMP = Date.now();
const START_AT = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

describe("fixtures + team lists", () => {
  let tenantAId: number;
  let tenantBId: number;
  let adminAId: number;
  let adminBId: number;
  let cookieA: string;
  let cookieB: string;

  const asA = () => ({ cookie: cookieA, tenant: String(tenantAId) });

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-fixtures";

    const [tenantA] = await db
      .insert(tenantsTable)
      .values({
        slug: `fixtures-ta-${STAMP}`,
        centralClubId: 9501,
        name: "Fixtures Tenant A",
        readsFromCentral: true,
      })
      .returning();
    tenantAId = tenantA.id;
    const [tenantB] = await db
      .insert(tenantsTable)
      .values({
        slug: `fixtures-tb-${STAMP}`,
        centralClubId: 9502,
        name: "Fixtures Tenant B",
        readsFromCentral: true,
      })
      .returning();
    tenantBId = tenantB.id;

    const [adminA] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantAId,
        username: `fixtures_admin_a_${STAMP}`,
        displayName: "Fixtures Admin A",
        passwordHash: "x",
      })
      .returning();
    adminAId = adminA.id;
    cookieA = `${SESSION_COOKIE}=${encodeSession({ adminId: adminAId, issuedAt: Date.now() })}`;

    const [adminB] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantBId,
        username: `fixtures_admin_b_${STAMP}`,
        displayName: "Fixtures Admin B",
        passwordHash: "x",
      })
      .returning();
    adminBId = adminB.id;
    cookieB = `${SESSION_COOKIE}=${encodeSession({ adminId: adminBId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    for (const tenantId of [tenantAId, tenantBId]) {
      await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, tenantId));
      await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
      await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
    }
    await db.delete(adminsTable).where(eq(adminsTable.id, adminAId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminBId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantAId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantBId));
  });

  const createFixture = async (overrides: Record<string, unknown> = {}) => {
    const { cookie, tenant } = asA();
    const res = await request(app)
      .post("/api/fixtures")
      .set("x-tenant-id", tenant)
      .set("Cookie", cookie)
      .send({
        grade: "A Grade",
        opponentName: "Pinjarra",
        startAt: START_AT,
        ...overrides,
      });
    return res;
  };

  it("rejects a fixture without startAt", async () => {
    const res = await createFixture({ startAt: undefined });
    expect(res.status).toBe(400);
  });

  it("round-trips fixture CRUD, tenant-scoped", async () => {
    const created = await createFixture({
      roundLabel: "Round 1",
      venue: "Bortolo Reserve",
      isHome: false,
      notes: "Bring the flags",
    });
    expect(created.status).toBe(201);
    expect(created.body.grade).toBe("A Grade");
    expect(created.body.opponentName).toBe("Pinjarra");
    expect(created.body.isHome).toBe(false);
    expect(created.body.source).toBe("manual");
    const id: number = created.body.id;

    // Tenant A sees it; tenant B does not.
    const listA = await request(app)
      .get("/api/fixtures")
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(listA.body.map((f: { id: number }) => f.id)).toContain(id);

    const listB = await request(app)
      .get("/api/fixtures")
      .set("x-tenant-id", String(tenantBId))
      .expect(200);
    expect(listB.body.map((f: { id: number }) => f.id)).not.toContain(id);

    // Tenant B's admin cannot modify or delete A's fixture.
    await request(app)
      .patch(`/api/fixtures/${id}`)
      .set("x-tenant-id", String(tenantBId))
      .set("Cookie", cookieB)
      .send({ venue: "Hijacked Oval" })
      .expect(404);
    await request(app)
      .delete(`/api/fixtures/${id}`)
      .set("x-tenant-id", String(tenantBId))
      .set("Cookie", cookieB)
      .expect(404);

    // Tenant A's admin can.
    const patched = await request(app)
      .patch(`/api/fixtures/${id}`)
      .set("x-tenant-id", String(tenantAId))
      .set("Cookie", cookieA)
      .send({ venue: "New Oval" })
      .expect(200);
    expect(patched.body.venue).toBe("New Oval");

    await request(app)
      .delete(`/api/fixtures/${id}`)
      .set("x-tenant-id", String(tenantAId))
      .set("Cookie", cookieA)
      .expect(204);
  });

  it("stores team-list roles and preserves order; free-typed players need no playerId", async () => {
    const created = await createFixture();
    expect(created.status).toBe(201);
    const id: number = created.body.id;

    const players = [
      { order: 1, playerId: 42, displayName: "A Opener", role: "C" },
      { order: 2, displayName: "New Signing", role: "WK" },
      { order: 3, playerId: 7, displayName: "Z Allrounder" },
    ];
    const put = await request(app)
      .put(`/api/fixtures/${id}/team-list`)
      .set("x-tenant-id", String(tenantAId))
      .set("Cookie", cookieA)
      .send({ players, isPublished: true })
      .expect(200);
    expect(put.body.isPublished).toBe(true);
    expect(put.body.players).toHaveLength(3);
    expect(put.body.players.map((p: { order: number }) => p.order)).toEqual([1, 2, 3]);
    expect(put.body.players[0].role).toBe("C");
    expect(put.body.players[1].role).toBe("WK");
    expect(put.body.players[1].playerId).toBeUndefined();
    expect(put.body.players[2].role).toBeUndefined();

    const got = await request(app)
      .get(`/api/fixtures/${id}/team-list`)
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(got.body.players).toEqual(put.body.players);
  });

  it("rejects fill-in playerIds (>= 90000) with 400", async () => {
    const created = await createFixture();
    const id: number = created.body.id;
    const res = await request(app)
      .put(`/api/fixtures/${id}/team-list`)
      .set("x-tenant-id", String(tenantAId))
      .set("Cookie", cookieA)
      .send({ players: [{ order: 1, playerId: 90000, displayName: "Fill In" }] });
    expect(res.status).toBe(400);
  });

  it("keeps one team list per fixture (PUT upserts, never duplicates)", async () => {
    const created = await createFixture();
    const id: number = created.body.id;

    const first = await request(app)
      .put(`/api/fixtures/${id}/team-list`)
      .set("x-tenant-id", String(tenantAId))
      .set("Cookie", cookieA)
      .send({ players: [{ order: 1, displayName: "First XI" }] })
      .expect(200);
    const second = await request(app)
      .put(`/api/fixtures/${id}/team-list`)
      .set("x-tenant-id", String(tenantAId))
      .set("Cookie", cookieA)
      .send({ players: [{ order: 1, displayName: "Second XI" }] })
      .expect(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.players[0].displayName).toBe("Second XI");

    const rows = await db
      .select()
      .from(teamListsTable)
      .where(eq(teamListsTable.fixtureId, id));
    expect(rows).toHaveLength(1);
  });

  it("returns null for a fixture with no team list yet, 404 for a missing fixture", async () => {
    const created = await createFixture();
    const id: number = created.body.id;
    const res = await request(app)
      .get(`/api/fixtures/${id}/team-list`)
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(res.body).toBeNull();
    await request(app)
      .get(`/api/fixtures/999999999/team-list`)
      .set("x-tenant-id", String(tenantAId))
      .expect(404);
  });

  it("persists seasonStartDate via the social-settings PATCH (and clears with null)", async () => {
    const when = "2026-10-10T00:00:00.000Z";
    const patched = await request(app)
      .patch("/api/social-settings")
      .set("x-tenant-id", String(tenantAId))
      .set("Cookie", cookieA)
      .send({ seasonStartDate: when })
      .expect(200);
    expect(new Date(patched.body.seasonStartDate).toISOString()).toBe(when);

    const got = await request(app)
      .get("/api/social-settings")
      .set("x-tenant-id", String(tenantAId))
      .expect(200);
    expect(new Date(got.body.settings.seasonStartDate).toISOString()).toBe(when);

    const cleared = await request(app)
      .patch("/api/social-settings")
      .set("x-tenant-id", String(tenantAId))
      .set("Cookie", cookieA)
      .send({ seasonStartDate: null })
      .expect(200);
    expect(cleared.body.seasonStartDate).toBeNull();
  });
});
