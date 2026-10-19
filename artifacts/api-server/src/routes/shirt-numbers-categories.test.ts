import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  juniorShirtNumbersTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Shirt-number categories (admin-menu-consolidation PR 2, migration 0047): the senior
 * register splits into Men and Female. Number clashes are checked within a category only;
 * one person may be on both registers (and the juniors register) in the same season, and
 * that is never refused. The cross-register overlap read is admin-only, flags only, and
 * scoped to the request's tenant.
 *
 * Real-DB integration test (needs DATABASE_URL; runs in CI's API job).
 */

const STAMP = Date.now();
const GUID = (n: number) =>
  `98${String(STAMP).slice(-6)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEASON = 2031;

type Entry = {
  id: number;
  category: "men" | "female";
  alsoIn: ("men" | "female")[];
  name: string;
  number: string | null;
  duplicate: boolean;
};

describe("shirt numbers: men / female categories", () => {
  const tenantIds: number[] = [];
  const adminIds: number[] = [];
  let tenantId: number;
  let otherTenantId: number;
  let cookie: string;
  let otherCookie: string;
  const P = { sam: 71_001, alex: 71_002, kim: 71_003 };

  const as = (r: request.Test) => r.set("x-tenant-id", String(tenantId)).set("Cookie", cookie);
  const create = (body: object) => as(request(app).post("/api/shirt-numbers")).send(body);
  const update = (id: number, body: object) =>
    as(request(app).patch(`/api/shirt-numbers/${id}`)).send(body);
  const list = async (category?: "men" | "female") =>
    (
      await as(
        request(app).get(
          `/api/shirt-numbers?season=${SEASON}${category ? `&category=${category}` : ""}`,
        ),
      ).expect(200)
    ).body as { entries: Entry[] };
  const settings = (body: object) =>
    as(request(app).patch("/api/shirt-numbers/settings")).send(body).expect(200);

  async function seedTenant(slug: string, clubId: number) {
    const [t] = await db
      .insert(tenantsTable)
      .values({ slug, centralClubId: clubId, readsFromCentral: true, name: slug, plan: "pro" })
      .returning();
    tenantIds.push(t.id);
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `${slug}_admin`,
        displayName: "Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    return {
      id: t.id,
      cookie: `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`,
    };
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-shirt-categories";
    const a = await seedTenant(`shirt-cat-${STAMP}`, 9981);
    const b = await seedTenant(`shirt-cat-other-${STAMP}`, 9982);
    tenantId = a.id;
    cookie = a.cookie;
    otherTenantId = b.id;
    otherCookie = b.cookie;
    await db
      .insert(playerIdMapTable)
      .values(
        Object.values(P).map((playerId, i) => ({ tenantId, participantId: GUID(i + 1), playerId })),
      );
    await settings({ enabled: true, duplicatePolicy: "block", rolloverPolicy: "carry" });
  });

  afterAll(async () => {
    await db.delete(shirtNumbersTable).where(inArray(shirtNumbersTable.tenantId, tenantIds));
    await db
      .delete(juniorShirtNumbersTable)
      .where(inArray(juniorShirtNumbersTable.tenantId, tenantIds));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, tenantIds));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenantIds));
    await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
  });

  it("a men's #7 and a female #7 do not clash, even under the block policy", async () => {
    const men = await create({ season: SEASON, name: "Alex Men", playerId: P.alex, number: "7" });
    expect(men.status).toBe(201);
    expect(men.body.entry.category).toBe("men");
    const female = await create({
      season: SEASON,
      name: "Kim Female",
      playerId: P.kim,
      number: "7",
      category: "female",
    });
    expect(female.status).toBe(201);
    expect(female.body.warnings).toEqual([]);
    expect(female.body.entry).toMatchObject({ category: "female", number: "7", duplicate: false });

    const menList = await list("men");
    const femaleList = await list("female");
    expect(menList.entries.map((e) => e.name)).toContain("Alex Men");
    expect(menList.entries.map((e) => e.name)).not.toContain("Kim Female");
    expect(femaleList.entries.map((e) => e.name)).toEqual(["Kim Female"]);
    expect([...menList.entries, ...femaleList.entries].every((e) => !e.duplicate)).toBe(true);
    // No category: the men's register (every entry from before 0047).
    expect((await list()).entries.map((e) => e.id)).toEqual(menList.entries.map((e) => e.id));
  });

  it("block policy still refuses a clash within one category", async () => {
    const res = await create({
      season: SEASON,
      name: "Another Female",
      number: "7",
      category: "female",
    });
    expect(res.status).toBe(409);
    expect(res.body.warnings[0].names).toEqual(["Kim Female"]);
  });

  it("one person may be on both registers; a second entry in the same category is refused", async () => {
    const men = await create({ season: SEASON, name: "Sam Both", playerId: P.sam, number: "12" });
    expect(men.status).toBe(201);
    const female = await create({
      season: SEASON,
      name: "Sam Both",
      playerId: P.sam,
      number: "12",
      category: "female",
    });
    expect(female.status).toBe(201);
    const again = await create({
      season: SEASON,
      name: "Sam Both",
      playerId: P.sam,
      category: "female",
    });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/Female register/);

    const sam = (await list("men")).entries.find((e) => e.name === "Sam Both")!;
    expect(sam.alsoIn).toEqual(["female"]);
    const samF = (await list("female")).entries.find((e) => e.name === "Sam Both")!;
    expect(samF.alsoIn).toEqual(["men"]);
  });

  it('"Move to Female" moves an entry; its number is checked against the female register', async () => {
    const res = await create({ season: SEASON, name: "Mover", number: "7" });
    // Men's #7 is Alex: refused under block before any move.
    expect(res.status).toBe(409);
    const ok = await create({ season: SEASON, name: "Mover", number: "30" });
    expect(ok.status).toBe(201);
    const moved = await update(ok.body.entry.id, { category: "female" });
    expect(moved.status).toBe(200);
    expect(moved.body.entry.category).toBe("female");

    // Moving Sam's men's entry onto the female register would make two: refused.
    const samMen = (await list("men")).entries.find((e) => e.name === "Sam Both")!;
    const clash = await update(samMen.id, { category: "female" });
    expect(clash.status).toBe(409);

    // Alex's #7 moving to female collides with Kim's female #7 under block.
    const alex = (await list("men")).entries.find((e) => e.name === "Alex Men")!;
    const blocked = await update(alex.id, { category: "female" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.warnings[0].names).toEqual(["Kim Female"]);
  });

  it("start season carries each category into itself", async () => {
    const res = await as(
      request(app).post(`/api/shirt-numbers/seasons/${SEASON + 1}/start`),
    ).expect(200);
    expect(res.body.created).toBeGreaterThan(0);
    const next = await db
      .select()
      .from(shirtNumbersTable)
      .where(eq(shirtNumbersTable.tenantId, tenantId));
    const kim = next.find((r) => r.season === SEASON + 1 && r.name === "Kim Female")!;
    expect(kim).toMatchObject({ category: "female", number: "7" });
    const sams = next.filter((r) => r.season === SEASON + 1 && r.name === "Sam Both");
    expect(sams.map((r) => r.category).sort()).toEqual(["female", "men"]);
  });

  describe("GET /api/juniors/shirt-numbers/overlap", () => {
    beforeAll(async () => {
      // Sam is a junior too (same Profile ID AND name); a family account shares Kim's id
      // with someone else.
      await db.insert(juniorShirtNumbersTable).values([
        { tenantId, season: SEASON, participantId: GUID(1), name: "Sam Both", number: "4" },
        { tenantId, season: SEASON, participantId: GUID(3), name: "Pat Sibling", number: "5" },
      ]);
      // Another club's register carries the same ids: it must never show here.
      await db.insert(shirtNumbersTable).values({
        tenantId: otherTenantId,
        season: SEASON,
        name: "Alex Men",
        participantId: GUID(2),
        number: "1",
        category: "female",
      });
    });

    it("needs an admin session", async () => {
      await request(app)
        .get(`/api/juniors/shirt-numbers/overlap?season=${SEASON}`)
        .set("x-tenant-id", String(tenantId))
        .expect(401);
    });

    it("returns the people on several registers as flags and entry ids only", async () => {
      const res = await as(
        request(app).get(`/api/juniors/shirt-numbers/overlap?season=${SEASON}`),
      ).expect(200);
      expect(res.body.season).toBe(SEASON);
      expect(res.body.people).toHaveLength(1);
      const [sam] = res.body.people;
      expect(sam.registers).toEqual(["men", "female", "juniors"]);
      expect(sam.seniorEntryIds).toHaveLength(2);
      expect(sam.juniorEntryIds).toHaveLength(1);
      // Flags only: no numbers, names or stats leak through this read.
      expect(Object.keys(sam).sort()).toEqual(["juniorEntryIds", "registers", "seniorEntryIds"]);
      expect(JSON.stringify(res.body)).not.toMatch(/Sam Both|"number"|runs|wickets/);
    });

    it("is scoped to the request's tenant", async () => {
      const res = await request(app)
        .get(`/api/juniors/shirt-numbers/overlap?season=${SEASON}`)
        .set("x-tenant-id", String(otherTenantId))
        .set("Cookie", otherCookie)
        .expect(200);
      expect(res.body.people).toEqual([]);
      // And the first club's admin cannot read the other club's register through it.
      const mine = await as(
        request(app).get(`/api/juniors/shirt-numbers/overlap?season=${SEASON}`),
      ).expect(200);
      const ids = mine.body.people.flatMap((p: { seniorEntryIds: number[] }) => p.seniorEntryIds);
      const others = await db
        .select({ id: shirtNumbersTable.id })
        .from(shirtNumbersTable)
        .where(eq(shirtNumbersTable.tenantId, otherTenantId));
      for (const o of others) expect(ids).not.toContain(o.id);
    });
  });
});
