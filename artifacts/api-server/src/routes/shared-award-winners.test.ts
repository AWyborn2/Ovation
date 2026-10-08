import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  adminsTable,
  awardsTable,
  awardWinnersTable,
  playersTable,
  tenantsTable,
  playerIdMapTable,
} from "@workspace/db";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { invalidateTenantConfigCache } from "../lib/tenant";
import { buildAwardBoards } from "../lib/honour-display/awards";
import {
  reassignMergedNativePlayer,
  detachDeletedNativePlayers,
} from "../lib/curated-player-detach";
import { patchWinnerLinks, winnerPlayerIds } from "../lib/award-recipients";

describe("ordered shared award winners", () => {
  const stamp = `${Date.now()}-shared`;
  const ids: number[] = [];
  const awardIds: number[] = [];
  const adminIds: number[] = [];
  let tenant2: number;
  let cookie: string;
  let cookie2: string;
  let awardId: number;
  let otherAward: number;
  let winnerId: number;
  const headers = (tenant = 1) => ({ "x-tenant-id": String(tenant) });
  const create = (body: object, tenant = 1, award = awardId) =>
    request(app)
      .post(`/api/awards/${award}/winners`)
      .set(headers(tenant))
      .set("Cookie", tenant === 1 ? cookie : cookie2)
      .send(body);
  const patch = (id: number, body: object) =>
    request(app).patch(`/api/award-winners/${id}`).set(headers()).set("Cookie", cookie).send(body);
  const publicAwards = () => request(app).get("/api/awards").set(headers());
  const profile = (id: number) => request(app).get(`/api/players/${id}`).set(headers());
  const myCredits = (res: request.Response) =>
    res.body.awards.filter((a: { key: string }) => a.key === stamp);

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= "shared-award-test-only";
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: stamp,
        centralClubId: 9865,
        name: "Shared award test",
        readsFromCentral: true,
        plan: "pilot",
      })
      .returning();
    tenant2 = t.id;
    invalidateTenantConfigCache();
    for (const givenName of ["First", "Second", "Third"]) {
      const [p] = await db.insert(playersTable).values({ givenName, surname: stamp }).returning();
      ids.push(p.id);
    }
    await db.insert(playerIdMapTable).values([
      {
        tenantId: tenant2,
        participantId: "98650000-0000-4000-8000-000000000001",
        playerId: ids[0],
      },
      {
        tenantId: tenant2,
        participantId: "98650000-0000-4000-8000-000000000002",
        playerId: ids[1],
      },
    ]);
    for (const tenantId of [1, tenant2]) {
      const [admin] = await db
        .insert(adminsTable)
        .values({
          tenantId,
          username: `${stamp}-${tenantId}`,
          displayName: "Shared test",
          passwordHash: "x",
        })
        .returning();
      adminIds.push(admin.id);
      const session = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
      if (tenantId === 1) cookie = session;
      else cookie2 = session;
      const [award] = await db
        .insert(awardsTable)
        .values({ tenantId, key: stamp, title: "Shared regression medal", published: true })
        .returning();
      awardIds.push(award.id);
      if (tenantId === 1) awardId = award.id;
      else otherAward = award.id;
    }
  });

  afterAll(async () => {
    if (awardIds.length) await db.delete(awardsTable).where(inArray(awardsTable.id, awardIds));
    if (adminIds.length) await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    if (tenant2) {
      await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenant2));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant2));
    }
    if (ids.length) await db.delete(playersTable).where(inArray(playersTable.id, ids));
    invalidateTenantConfigCache();
  });

  it("creates ordered links and preserves the independent display label after reload", async () => {
    const res = await create({
      season: 2024,
      name: "Two players / Guest without a profile",
      playerIds: [ids[1], ids[0]],
    }).expect(201);
    winnerId = res.body.id;
    expect(res.body.playerIds).toEqual([ids[1], ids[0]]);
    expect(res.body.playerId).toBe(ids[1]);
    const reload = await request(app)
      .get("/api/admin/awards")
      .set(headers())
      .set("Cookie", cookie)
      .expect(200);
    expect(reload.body.find((a: { id: number }) => a.id === awardId).winners[0]).toMatchObject({
      id: winnerId,
      playerIds: [ids[1], ids[0]],
      name: "Two players / Guest without a profile",
    });
    expect(
      (await publicAwards()).body.find((a: { id: number }) => a.id === awardId).winners[0]
        .recipients,
    ).toEqual([
      { playerId: ids[1], name: `Second ${stamp}` },
      { playerId: ids[0], name: `First ${stamp}` },
    ]);
    expect(
      (await buildAwardBoards(1)).find((a) => a.id === `award:${stamp}`)?.entries[0]?.primaryText ??
        (await buildAwardBoards(1)).find((a) => a.title === "Shared regression medal")?.entries[0]
          ?.primaryText,
    ).toBe("Two players / Guest without a profile");
  });

  it("credits both profiles once, even with a duplicate legacy row for the same season", async () => {
    await db
      .insert(awardWinnersTable)
      .values({ tenantId: 1, awardId, season: 2024, name: "Legacy alias", playerId: ids[0] });
    for (const id of ids.slice(0, 2))
      expect(myCredits(await profile(id).expect(200))).toHaveLength(1);
    await create({
      season: 2023,
      name: "Different combined label",
      playerIds: [ids[0], ids[1]],
    }).expect(201);
    const records = await request(app).get("/api/records-leaderboards").set(headers()).expect(200);
    const entries = records.body.awardRecords.find((a: { key: string }) => a.key === stamp).entries;
    expect(entries).toHaveLength(2);
    expect(entries.map((e: { count: number }) => e.count)).toEqual([2, 2]);
  });

  it("rejects duplicate and foreign-tenant ids atomically, and requires admin authentication", async () => {
    await create({ season: 2024, name: "duplicate", playerIds: [ids[0], ids[0]] }).expect(400);
    await create(
      { season: 2024, name: "foreign", playerIds: [ids[0], ids[2]] },
      tenant2,
      otherAward,
    ).expect(422);
    await create(
      { season: 2024, name: "central crosswalk", playerIds: [ids[1], ids[0]] },
      tenant2,
      otherAward,
    ).expect(201);
    await patch(winnerId, { playerIds: [ids[0], 2147483647], name: "Must not persist" }).expect(
      422,
    );
    await request(app)
      .patch(`/api/award-winners/${winnerId}`)
      .set(headers(tenant2))
      .set("Cookie", cookie2)
      .send({ playerIds: [] })
      .expect(404);
    await request(app)
      .post(`/api/awards/${awardId}/winners`)
      .set(headers())
      .send({ name: "anon", season: 2024, playerIds: ids })
      .expect(401);
    const [stored] = await db
      .select()
      .from(awardWinnersTable)
      .where(eq(awardWinnersTable.id, winnerId));
    expect(stored.name).toBe("Two players / Guest without a profile");
  });

  it("edits, reorders, unpublishes and republishes without losing links", async () => {
    await patch(winnerId, {
      playerIds: [ids[0], ids[1]],
      displayOrder: 8,
      season: 2022,
      published: false,
    }).expect(200);
    expect(
      (await publicAwards()).body
        .find((a: { id: number }) => a.id === awardId)
        .winners.some((w: { id: number }) => w.id === winnerId),
    ).toBe(false);
    for (const id of ids.slice(0, 2))
      expect(myCredits(await profile(id)).some((a: { season: number }) => a.season === 2022)).toBe(
        false,
      );
    await patch(winnerId, { published: true }).expect(200);
    const [stored] = await db
      .select()
      .from(awardWinnersTable)
      .where(eq(awardWinnersTable.id, winnerId));
    expect(stored).toMatchObject({ playerIds: [ids[0], ids[1]], displayOrder: 8, season: 2022 });
    await request(app)
      .patch(`/api/awards/${awardId}`)
      .set(headers())
      .set("Cookie", cookie)
      .send({ published: false })
      .expect(200);
    expect(myCredits(await profile(ids[1]))).toHaveLength(0);
    expect((await publicAwards()).body.some((a: { id: number }) => a.id === awardId)).toBe(false);
    await request(app)
      .patch(`/api/awards/${awardId}`)
      .set(headers())
      .set("Cookie", cookie)
      .send({ published: true })
      .expect(200);
  });

  it("removes one or all links, leaves the label/player/award intact, and deletes the winner", async () => {
    await patch(winnerId, { playerIds: [ids[1]] }).expect(200);
    expect(
      myCredits(await profile(ids[0])).some((a: { season: number }) => a.season === 2022),
    ).toBe(false);
    expect(
      myCredits(await profile(ids[1])).some((a: { season: number }) => a.season === 2022),
    ).toBe(true);
    await patch(winnerId, { playerIds: [] }).expect(200);
    const [row] = await db
      .select()
      .from(awardWinnersTable)
      .where(eq(awardWinnersTable.id, winnerId));
    expect(row).toMatchObject({
      playerId: null,
      playerIds: [],
      name: "Two players / Guest without a profile",
    });
    await request(app)
      .delete(`/api/award-winners/${winnerId}`)
      .set(headers())
      .set("Cookie", cookie)
      .expect(204);
    await profile(ids[1]).expect(200);
    expect((await publicAwards()).body.some((a: { id: number }) => a.id === awardId)).toBe(true);
  });

  it("preserves legacy single and free-text rows until an admin explicitly links them", async () => {
    const [legacy, text] = await db
      .insert(awardWinnersTable)
      .values([
        { tenantId: 1, awardId, season: 2000, name: "Historical spelling", playerId: ids[0] },
        { tenantId: 1, awardId, season: 2001, name: "A / B" },
      ])
      .returning();
    await patch(legacy.id, { displayOrder: 2 }).expect(200);
    const [unchanged] = await db
      .select()
      .from(awardWinnersTable)
      .where(eq(awardWinnersTable.id, legacy.id));
    expect(unchanged.playerIds).toBeNull();
    const linked = await patch(text.id, { playerIds: [ids[0], ids[1]] }).expect(200);
    expect(linked.body.name).toBe("A / B");
    const oldClient = await patch(text.id, { playerId: ids[2] }).expect(200);
    expect(oldClient.body.playerIds).toEqual([ids[2], ids[1]]);
  });

  it("native merges deduplicate recipients in order and deletion detaches only the requested link", async () => {
    const res = await create({
      season: 1990,
      name: "Merge fixture",
      playerIds: [ids[0], ids[1], ids[2]],
    });
    await db.transaction((tx) => reassignMergedNativePlayer(tx, ids[0], ids[1]));
    let [row] = await db
      .select()
      .from(awardWinnersTable)
      .where(eq(awardWinnersTable.id, res.body.id));
    expect(winnerPlayerIds(row)).toEqual([ids[1], ids[2]]);
    await db.transaction((tx) => detachDeletedNativePlayers(tx, [ids[1]]));
    [row] = await db.select().from(awardWinnersTable).where(eq(awardWinnersTable.id, res.body.id));
    expect(row).toMatchObject({ playerIds: [ids[2]], playerId: ids[2], name: "Merge fixture" });
    expect(
      patchWinnerLinks({ playerId: null }, { playerId: ids[0], playerIds: [ids[0], ids[1]] }),
    ).toEqual([ids[1]]);
  });
});
