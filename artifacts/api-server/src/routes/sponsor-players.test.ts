/**
 * Player sponsors (migration 0074): a sponsor's players are tagged through the
 * sponsor routes, only this club's senior players can be tagged, the tags come
 * back on every sponsor read (names to the club's admins only), a sponsor's
 * delete takes its tags with it, and one club never sees another's tags.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  captionTemplatesTable,
  playerIdMapTable,
  socialSettingsTable,
  sponsorPlayersTable,
  sponsorsTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
const tenantIds: number[] = [];
const adminIds: number[] = [];
const cookies: string[] = [];
const SENIOR = 4101;
const SENIOR_2 = 4102;
const OTHER_CLUB_PLAYER = 4201;

const as = (i: number) => ({
  get: (url: string) =>
    request(app).get(url).set("Cookie", cookies[i]).set("x-tenant-id", String(tenantIds[i])),
  post: (url: string, body: object) =>
    request(app)
      .post(url)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i]))
      .send(body),
  patch: (url: string, body: object) =>
    request(app)
      .patch(url)
      .set("Cookie", cookies[i])
      .set("x-tenant-id", String(tenantIds[i]))
      .send(body),
  delete: (url: string) =>
    request(app).delete(url).set("Cookie", cookies[i]).set("x-tenant-id", String(tenantIds[i])),
});
const publicGet = (i: number, url: string) =>
  request(app).get(url).set("x-tenant-id", String(tenantIds[i]));

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "sponsor-players-test";
  for (const i of [0, 1]) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `sponsor-players-${i}-${STAMP}`,
        centralClubId: 9970 + i,
        readsFromCentral: true,
        name: `Sponsor Players Club ${i}`,
        plan: "pro",
      })
      .returning();
    tenantIds.push(t.id);
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `sponsor_players_${i}_${STAMP}`,
        displayName: "Sponsors",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`);
  }
  // Each club's senior players are its crosswalk ids.
  await db.insert(playerIdMapTable).values([
    { tenantId: tenantIds[0], participantId: `sp-${STAMP}-a`, playerId: SENIOR },
    { tenantId: tenantIds[0], participantId: `sp-${STAMP}-b`, playerId: SENIOR_2 },
    { tenantId: tenantIds[1], participantId: `sp-${STAMP}-c`, playerId: OTHER_CLUB_PLAYER },
  ]);
});

afterAll(async () => {
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenantIds));
  await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, tenantIds));
  await db.delete(sponsorsTable).where(inArray(sponsorsTable.tenantId, tenantIds));
  await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenantIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
});

const sponsor = (over: object = {}) => ({
  name: `Joe's Plumbing ${STAMP}`,
  logoUrl: "/api/storage/objects/joe.png",
  ...over,
});

describe("player sponsors: tags on a sponsor", () => {
  let sponsorId = 0;

  it("creates a sponsor with its players, each named", async () => {
    const res = await as(0)
      .post("/api/sponsors", sponsor({ playerIds: [SENIOR, SENIOR, SENIOR_2] }))
      .expect(201);
    sponsorId = res.body.id;
    expect(res.body.players.map((p: { id: number }) => p.id)).toEqual([SENIOR, SENIOR_2]);
    for (const p of res.body.players) expect(typeof p.name).toBe("string");
    for (const p of res.body.players) expect(p.name).not.toBe("");
  });

  it("a sponsor without players carries an empty list", async () => {
    const res = await as(0)
      .post("/api/sponsors", sponsor({ name: "Club wide" }))
      .expect(201);
    expect(res.body.players).toEqual([]);
  });

  it("rejects a fill-in, a junior or another club's player, and keeps the tags", async () => {
    for (const bad of [90001, OTHER_CLUB_PLAYER, 999999]) {
      const res = await as(0)
        .patch(`/api/sponsors/${sponsorId}`, { playerIds: [SENIOR, bad] })
        .expect(400);
      expect(res.body.error).toMatch(/senior players/);
    }
    await as(0)
      .post("/api/sponsors", sponsor({ playerIds: [90001] }))
      .expect(400);
    const tags = await db
      .select()
      .from(sponsorPlayersTable)
      .where(eq(sponsorPlayersTable.sponsorId, sponsorId));
    expect(tags.map((t) => t.playerId).sort()).toEqual([SENIOR, SENIOR_2]);
  });

  it("a PATCH with players alone replaces the set and leaves the sponsor as it was", async () => {
    const res = await as(0)
      .patch(`/api/sponsors/${sponsorId}`, { playerIds: [SENIOR_2] })
      .expect(200);
    expect(res.body.players.map((p: { id: number }) => p.id)).toEqual([SENIOR_2]);
    expect(res.body.name).toBe(`Joe's Plumbing ${STAMP}`);
  });

  it("a PATCH without players keeps them", async () => {
    const res = await as(0).patch(`/api/sponsors/${sponsorId}`, { tier: "major" }).expect(200);
    expect(res.body.players.map((p: { id: number }) => p.id)).toEqual([SENIOR_2]);
  });

  it("every sponsor read carries the players; names to admins only", async () => {
    const admin = await as(0).get("/api/sponsors").expect(200);
    const mine = admin.body.find((s: { id: number }) => s.id === sponsorId);
    expect(mine.players[0].id).toBe(SENIOR_2);
    expect(mine.players[0].name).not.toBe("");
    const pub = await publicGet(0, "/api/sponsors").expect(200);
    const pubMine = pub.body.find((s: { id: number }) => s.id === sponsorId);
    expect(pubMine.players).toEqual([{ id: SENIOR_2, name: "" }]);
    const bundle = await as(0).get("/api/social-settings").expect(200);
    const live = bundle.body.activeSponsors.find((s: { id: number }) => s.id === sponsorId);
    expect(live.players.map((p: { id: number }) => p.id)).toEqual([SENIOR_2]);
  });

  it("another club never sees or edits the tags", async () => {
    const other = await as(1).get("/api/sponsors").expect(200);
    expect(other.body.find((s: { id: number }) => s.id === sponsorId)).toBeUndefined();
    await as(1).patch(`/api/sponsors/${sponsorId}`, { playerIds: [] }).expect(404);
  });

  it("deleting the sponsor deletes its tags", async () => {
    await as(0).delete(`/api/sponsors/${sponsorId}`).expect(204);
    const tags = await db
      .select()
      .from(sponsorPlayersTable)
      .where(eq(sponsorPlayersTable.sponsorId, sponsorId));
    expect(tags).toEqual([]);
  });
});
