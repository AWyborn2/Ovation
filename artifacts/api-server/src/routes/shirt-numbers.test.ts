import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Season shirt numbers — the senior register (plan U3; R1-R3, R9, R11, R16;
 * F4; AE1, AE3, AE5). Settings, duplicate policy, carry-forward, season start
 * and the feature switch. The club is a central-read tenant, so this also
 * proves the register is not fenced to native-stats clubs.
 *
 * Real-DB integration test (needs DATABASE_URL; runs in CI's API job).
 */

const STAMP = Date.now();
const GUID = (n: number) =>
  `97${String(STAMP).slice(-6)}-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Entry = {
  id: number;
  season: number;
  name: string;
  participantId: string | null;
  playerId: number | null;
  number: string | null;
  source: string;
  held: boolean;
  duplicate: boolean;
};
type Warning = {
  kind: string;
  number: string;
  message: string;
  entryIds: number[];
  names: string[];
};

describe("shirt numbers: senior register", () => {
  let tenantId: number;
  let adminId: number;
  let cookie: string;
  /** Player ids in the tenant's space (its crosswalk). */
  const P = { alice: 970_001, bea: 970_002, cy: 970_003, dee: 970_004, eve: 970_005 };

  const as = (r: request.Test) => r.set("x-tenant-id", String(tenantId)).set("Cookie", cookie);
  const anon = (r: request.Test) => r.set("x-tenant-id", String(tenantId));
  const settings = (body: object) =>
    as(request(app).patch("/api/shirt-numbers/settings")).send(body).expect(200);
  const create = (body: object) => as(request(app).post("/api/shirt-numbers")).send(body);
  const update = (id: number, body: object) =>
    as(request(app).patch(`/api/shirt-numbers/${id}`)).send(body);
  const list = async (season: number) =>
    (await as(request(app).get(`/api/shirt-numbers?season=${season}`)).expect(200)).body as {
      season: number;
      seasons: number[];
      entries: Entry[];
    };
  const rows = (season: number) =>
    db
      .select()
      .from(shirtNumbersTable)
      .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.season, season)));

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-shirt-numbers";
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `shirt-numbers-${STAMP}`,
        centralClubId: 9971,
        readsFromCentral: true,
        name: "Shirt Number Club",
        plan: "pro",
      })
      .returning();
    tenantId = t.id;
    await db
      .insert(playerIdMapTable)
      .values(
        Object.values(P).map((playerId, i) => ({ tenantId, participantId: GUID(i + 1), playerId })),
      );
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: `shirt_numbers_admin_${STAMP}`,
        displayName: "Shirt Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(shirtNumbersTable).where(eq(shirtNumbersTable.tenantId, tenantId));
    await db
      .delete(shirtNumberSettingsTable)
      .where(eq(shirtNumberSettingsTable.tenantId, tenantId));
    await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  it("requests without an admin session get 401", async () => {
    await anon(request(app).get("/api/shirt-numbers/settings")).expect(401);
    await anon(request(app).patch("/api/shirt-numbers/settings"))
      .send({ enabled: true })
      .expect(401);
    await anon(request(app).get("/api/shirt-numbers")).expect(401);
    await anon(request(app).post("/api/shirt-numbers"))
      .send({ season: 2026, name: "x" })
      .expect(401);
    await anon(request(app).patch("/api/shirt-numbers/1")).send({ number: "1" }).expect(401);
    await anon(request(app).delete("/api/shirt-numbers/1")).expect(401);
    await anon(request(app).post("/api/shirt-numbers/seasons/2026/start")).expect(401);
  });

  it("AE5: with the feature off, settings report enabled false and writes refuse", async () => {
    const s = await as(request(app).get("/api/shirt-numbers/settings")).expect(200);
    expect(s.body).toEqual({ enabled: false, duplicatePolicy: "warn", rolloverPolicy: "carry" });

    const [seeded] = await db
      .insert(shirtNumbersTable)
      .values({ tenantId, season: 2020, name: "Seeded While Off", number: "1" })
      .returning();
    const off = [
      await create({ season: 2026, name: "Off Player", number: "5" }),
      await update(seeded.id, { number: "2" }),
      await as(request(app).delete(`/api/shirt-numbers/${seeded.id}`)),
      await as(request(app).post("/api/shirt-numbers/seasons/2021/start")),
    ];
    for (const res of off) {
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/turned off/);
    }
    expect(await rows(2026)).toEqual([]);
    expect((await rows(2020))[0]?.number).toBe("1");
    await db.delete(shirtNumbersTable).where(eq(shirtNumbersTable.id, seeded.id));
  });

  it("the settings PATCH works while off and turns the feature on", async () => {
    const res = await settings({ enabled: true });
    expect(res.body).toEqual({ enabled: true, duplicatePolicy: "warn", rolloverPolicy: "carry" });
    await as(request(app).patch("/api/shirt-numbers/settings"))
      .send({ duplicatePolicy: "sometimes" })
      .expect(400);
  });

  it('rejects "1000" and "7a"; stores "00" verbatim', async () => {
    await create({ season: 2026, name: "Bad Number", number: "1000" }).expect(400);
    await create({ season: 2026, name: "Bad Number", number: "7a" }).expect(400);
    const res = await create({ season: 2026, name: "Double Zero", number: "00" }).expect(201);
    expect(res.body.entry.number).toBe("00");
    expect(res.body.warnings).toEqual([]);
    await update(res.body.entry.id, { number: "7a" }).expect(400);
  });

  it("an entry with no player is held; linking a player in the club's space makes it public", async () => {
    const res = await create({
      season: 2026,
      name: "Held Person",
      participantId: "ABC-Held",
    }).expect(201);
    const entry = res.body.entry as Entry;
    expect(entry.held).toBe(true);
    expect(entry.playerId).toBeNull();
    expect(entry.participantId).toBe("abc-held");
    expect(entry.source).toBe("admin");

    const linked = await update(entry.id, { playerId: P.eve }).expect(200);
    expect(linked.body.entry.held).toBe(false);
    expect(linked.body.entry.playerId).toBe(P.eve);
  });

  it("AE1 (warn): a second #7 in the season saves with a warning naming the other #7", async () => {
    const first = await create({
      season: 2026,
      name: "Alice Seven",
      playerId: P.alice,
      number: "7",
    });
    expect(first.status).toBe(201);
    const second = await create({ season: 2026, name: "Bea Seven", playerId: P.bea, number: "7" });
    expect(second.status).toBe(201);
    const warnings = second.body.warnings as Warning[];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      kind: "duplicate",
      number: "7",
      entryIds: [first.body.entry.id],
      names: ["Alice Seven"],
    });
    expect(warnings[0]!.message).toContain("Alice Seven");
    expect(second.body.entry.duplicate).toBe(true);

    const reg = await list(2026);
    const sevens = reg.entries.filter((e) => e.number === "7");
    expect(sevens.map((e) => e.duplicate)).toEqual([true, true]);
    expect(reg.entries.find((e) => e.number === "00")?.duplicate).toBe(false);
  });

  it("the same #7 in a different season raises no warning", async () => {
    const res = await create({ season: 2024, name: "Alice Seven", playerId: P.alice, number: "7" });
    expect(res.status).toBe(201);
    expect(res.body.warnings).toEqual([]);
    expect(res.body.entry.duplicate).toBe(false);
  });

  it("AE1 (block): a duplicate number is refused with 409 and nothing changes", async () => {
    await settings({ duplicatePolicy: "block" });
    const before = await rows(2026);

    const res = await create({ season: 2026, name: "Cy Seven", playerId: P.cy, number: "7" });
    expect(res.status).toBe(409);
    expect((res.body.warnings as Warning[])[0]?.names.sort()).toEqual(["Alice Seven", "Bea Seven"]);
    expect(await rows(2026)).toHaveLength(before.length);

    const cy = await create({ season: 2026, name: "Cy Eight", playerId: P.cy, number: "8" });
    expect(cy.status).toBe(201);
    const blocked = await update(cy.body.entry.id, { number: "7" });
    expect(blocked.status).toBe(409);
    const [row] = await db
      .select()
      .from(shirtNumbersTable)
      .where(eq(shirtNumbersTable.id, cy.body.entry.id));
    expect(row?.number).toBe("8");

    // Renaming an entry that already shares a number (from the warn era) still works.
    const alice = (await list(2026)).entries.find((e) => e.name === "Alice Seven")!;
    const renamed = await update(alice.id, { name: "Alice Seven-Long" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.warnings).toHaveLength(1);

    await settings({ duplicatePolicy: "warn" });
  });

  it("a second entry for the same player in a season is rejected", async () => {
    const res = await create({
      season: 2026,
      name: "Alice Again",
      playerId: P.alice,
      number: "99",
    });
    expect(res.status).toBe(409);
    expect(res.body.warnings).toEqual([]);
    // ...and so is linking another entry to a player already on the register.
    const other = await create({ season: 2026, name: "Someone Else" }).expect(201);
    await update(other.body.entry.id, { playerId: P.alice }).expect(409);
  });

  it("a player outside the club's space is rejected", async () => {
    await create({ season: 2026, name: "Stranger", playerId: 1_999_999 }).expect(422);
  });

  it("AE3: under carry a new entry inherits last season's number; editing it leaves last season alone", async () => {
    await create({ season: 2027, name: "Dee Twelve", playerId: P.dee, number: "12" }).expect(201);
    const carried = await create({ season: 2028, name: "Dee Twelve", playerId: P.dee }).expect(201);
    expect(carried.body.entry.number).toBe("12");

    await update(carried.body.entry.id, { number: "4" }).expect(200);
    expect((await rows(2028))[0]?.number).toBe("4");
    expect((await rows(2027))[0]?.number).toBe("12");
  });

  it("carry-forward matches a held person by participant id", async () => {
    await create({
      season: 2027,
      name: "Held Carry",
      participantId: GUID(77),
      number: "31",
    }).expect(201);
    const res = await create({ season: 2028, name: "Held Carry", participantId: GUID(77) }).expect(
      201,
    );
    expect(res.body.entry.number).toBe("31");
  });

  it("under blank the same creation stores no number", async () => {
    await settings({ rolloverPolicy: "blank" });
    await create({ season: 2027, name: "Eve Five", playerId: P.eve, number: "5" }).expect(201);
    const res = await create({ season: 2028, name: "Eve Five", playerId: P.eve }).expect(201);
    expect(res.body.entry.number).toBeNull();
    await settings({ rolloverPolicy: "carry" });
  });

  it("under block a carried number someone already wears is left off with a warning", async () => {
    await settings({ duplicatePolicy: "block" });
    await create({ season: 2029, name: "Bea Ten", playerId: P.bea, number: "10" }).expect(201);
    await create({ season: 2030, name: "Cy Ten", playerId: P.cy, number: "10" }).expect(201);
    const res = await create({ season: 2030, name: "Bea Ten", playerId: P.bea }).expect(201);
    expect(res.body.entry.number).toBeNull();
    expect((res.body.warnings as Warning[])[0]?.names).toEqual(["Cy Ten"]);
    await settings({ duplicatePolicy: "warn" });
  });

  it("season start under carry copies the previous season once; a second call adds nothing", async () => {
    await create({ season: 2040, name: "Start A", playerId: P.alice, number: "1" }).expect(201);
    await create({ season: 2040, name: "Start B", participantId: GUID(88), number: "2" }).expect(
      201,
    );
    await create({ season: 2040, name: "Start C", playerId: P.cy }).expect(201);

    const first = await as(request(app).post("/api/shirt-numbers/seasons/2041/start")).expect(200);
    expect(first.body).toEqual({
      season: 2041,
      fromSeason: 2040,
      created: 3,
      numbered: 2,
      skipped: 0,
      warnings: [],
    });
    const after = await rows(2041);
    expect(after.map((r) => [r.name, r.number, r.source]).sort()).toEqual([
      ["Start A", "1", "rollover"],
      ["Start B", "2", "rollover"],
      ["Start C", null, "rollover"],
    ]);

    const second = await as(request(app).post("/api/shirt-numbers/seasons/2041/start")).expect(200);
    expect(second.body.created).toBe(0);
    expect(second.body.skipped).toBe(3);
    expect(await rows(2041)).toHaveLength(3);
  });

  it("season start under blank creates nothing", async () => {
    await settings({ rolloverPolicy: "blank" });
    await create({ season: 2050, name: "Blank A", playerId: P.alice, number: "1" }).expect(201);
    const res = await as(request(app).post("/api/shirt-numbers/seasons/2051/start")).expect(200);
    expect(res.body.created).toBe(0);
    expect(await rows(2051)).toEqual([]);
    await settings({ rolloverPolicy: "carry" });
  });

  it("season start under block leaves a clashing carried number off and reports it", async () => {
    await settings({ duplicatePolicy: "block" });
    await create({ season: 2060, name: "Clash A", playerId: P.alice, number: "3" }).expect(201);
    await create({ season: 2061, name: "Clash New", playerId: P.bea, number: "3" }).expect(201);
    const res = await as(request(app).post("/api/shirt-numbers/seasons/2061/start")).expect(200);
    expect(res.body.created).toBe(1);
    expect(res.body.numbered).toBe(0);
    expect((res.body.warnings as Warning[])[0]?.names).toEqual(["Clash New"]);
    const clashA = (await rows(2061)).find((r) => r.name === "Clash A");
    expect(clashA?.number).toBeNull();
    await settings({ duplicatePolicy: "warn" });
  });

  it("lists the register's seasons newest first and defaults to the current season", async () => {
    const reg = await list(2026);
    expect(reg.season).toBe(2026);
    expect(reg.seasons[0]).toBe(2061);
    expect(reg.seasons).toEqual([...reg.seasons].sort((a, b) => b - a));
    const current = await as(request(app).get("/api/shirt-numbers")).expect(200);
    expect(typeof current.body.season).toBe("number");
  });

  it("deletes an entry, then 404s", async () => {
    const res = await create({ season: 2070, name: "Delete Me" }).expect(201);
    await as(request(app).delete(`/api/shirt-numbers/${res.body.entry.id}`)).expect(204);
    await as(request(app).delete(`/api/shirt-numbers/${res.body.entry.id}`)).expect(404);
    await update(res.body.entry.id, { number: "1" }).expect(404);
  });
});
