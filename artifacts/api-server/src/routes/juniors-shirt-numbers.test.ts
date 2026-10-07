import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  juniorParticipantsTable,
  juniorParticipantMergesTable,
  juniorShirtNumbersTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
  shirtNumberUploadsTable,
} from "@workspace/db";
import { carriedNumberFor } from "@workspace/db/shirt-numbers";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { checkDuplicateNumber, loadSeasonEntries } from "../lib/shirt-numbers";

/**
 * Season shirt numbers — the juniors register (plan U10; R17 applying R4, R5,
 * R7-R9, R11, R14-R16). Two native-juniors clubs (A and B) prove tenant
 * isolation; a central-read club proves the juniors gating; both directions
 * of the junior/senior separation are checked through the routes and the
 * shared service.
 *
 * Real-DB integration test (needs DATABASE_URL; runs in CI's API job).
 */

const STAMP = Date.now();
const GUID = (n: number) =>
  `95${String(STAMP).slice(-6)}-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Entry = {
  id: number;
  season: number;
  participantId: string;
  name: string;
  number: string | null;
  source: string;
  duplicate: boolean;
};
type Warning = {
  kind: string;
  number: string;
  message: string;
  entryIds: number[];
  names: string[];
};

describe("shirt numbers: juniors register", () => {
  const tenants: Record<"a" | "b" | "central", number> = { a: 0, b: 0, central: 0 };
  /**
   * `a2` is a second admin of tenant A for the upload tests: adminWriteRateLimiter allows
   * 30 writes per admin per 5 minutes, so no single admin here makes more than ~25.
   */
  type Who = "a" | "a2" | "b" | "central";
  const cookies: Record<Who, string> = { a: "", a2: "", b: "", central: "" };
  const adminIds: number[] = [];
  /** Tenant A's junior participants (stored upper-case to prove case folding). */
  const J = {
    amy: GUID(1),
    ben: GUID(2),
    cal: GUID(3),
    dan: GUID(4),
    eli: GUID(5),
    dupOfAmy: GUID(6),
    fay: GUID(7),
  };
  const B_KID = GUID(50);
  const SEASON = 2026;
  const CURRENT = seasonStartYearFor(new Date());

  const as = (r: request.Test, who: Who = "a") =>
    r.set("x-tenant-id", String(tenants[who === "a2" ? "a" : who])).set("Cookie", cookies[who]);
  const anon = (r: request.Test) => r.set("x-tenant-id", String(tenants.a));
  const settings = (body: object, who: "a" | "b" | "central" = "a") =>
    as(request(app).patch("/api/shirt-numbers/settings"), who).send(body).expect(200);
  const create = (body: object, who: "a" | "b" | "central" = "a") =>
    as(request(app).post("/api/juniors/shirt-numbers"), who).send(body);
  const update = (id: number, body: object, who: "a" | "b" | "central" = "a") =>
    as(request(app).patch(`/api/juniors/shirt-numbers/${id}`), who).send(body);
  const list = async (season: number, who: "a" | "b" | "central" = "a") =>
    (await as(request(app).get(`/api/juniors/shirt-numbers?season=${season}`), who).expect(200))
      .body as { season: number; seasons: number[]; entries: Entry[] };
  const rows = (season: number, tenantId = tenants.a) =>
    db
      .select()
      .from(juniorShirtNumbersTable)
      .where(
        and(
          eq(juniorShirtNumbersTable.tenantId, tenantId),
          eq(juniorShirtNumbersTable.season, season),
        ),
      );
  const upload = (content: string, opts: { kind?: string; season?: number; who?: Who } = {}) =>
    as(request(app).post("/api/juniors/shirt-numbers/uploads"), opts.who ?? "a")
      .field("kind", opts.kind ?? "numbers")
      .field("season", String(opts.season ?? SEASON))
      .attach("file", Buffer.from(content), { filename: "juniors.csv" });

  async function makeTenant(key: "a" | "b" | "central", readsFromCentral: boolean, clubId: number) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `junior-shirts-${key}-${STAMP}`,
        // Unique per tenant (tenants_central_club_id_uidx).
        centralClubId: clubId,
        readsFromCentral,
        name: `Junior Shirts ${key}`,
        plan: "pro",
      })
      .returning();
    tenants[key] = t.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `junior_shirts_${key}_${STAMP}`,
        displayName: `Junior Shirts ${key}`,
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    cookies[key] =
      `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-junior-shirts";
    await makeTenant("a", false, 98_101);
    const [a2] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenants.a,
        username: `junior_shirts_a2_${STAMP}`,
        displayName: "Junior Shirts a2",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(a2.id);
    cookies.a2 = `${SESSION_COOKIE}=${encodeSession({ adminId: a2.id, issuedAt: Date.now() })}`;
    await makeTenant("b", false, 98_102);
    await makeTenant("central", true, 98_103);
    const names: Record<keyof typeof J, string> = {
      amy: "Amy Archer",
      ben: "Ben Bowler",
      cal: "Cal Catcher",
      dan: "Dan Driver",
      eli: "Eli Edge",
      dupOfAmy: "Amy Archer",
      fay: "Fay Fielder",
    };
    await db.insert(juniorParticipantsTable).values(
      (Object.keys(J) as (keyof typeof J)[])
        .filter((k) => k !== "dupOfAmy")
        .map((k) => ({
          participantId: J[k].toUpperCase(),
          tenantId: tenants.a,
          displayName: names[k],
          isPrivate: false,
        })),
    );
    await db.insert(juniorParticipantMergesTable).values({
      tenantId: tenants.a,
      duplicateParticipantId: J.dupOfAmy,
      keeperParticipantId: J.amy.toUpperCase(),
    });
    await db.insert(juniorParticipantsTable).values({
      participantId: B_KID,
      tenantId: tenants.b,
      displayName: "Bea Other-Club",
      isPrivate: false,
    });
  });

  afterAll(async () => {
    const ids = Object.values(tenants);
    await db.delete(juniorShirtNumbersTable).where(inArray(juniorShirtNumbersTable.tenantId, ids));
    await db.delete(shirtNumbersTable).where(inArray(shirtNumbersTable.tenantId, ids));
    await db.delete(shirtNumberUploadsTable).where(inArray(shirtNumberUploadsTable.tenantId, ids));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, ids));
    await db
      .delete(juniorParticipantMergesTable)
      .where(inArray(juniorParticipantMergesTable.tenantId, ids));
    await db.delete(juniorParticipantsTable).where(inArray(juniorParticipantsTable.tenantId, ids));
    await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
  });

  it("requests without an admin session get 401", async () => {
    await anon(request(app).get("/api/juniors/shirt-numbers")).expect(401);
    await anon(request(app).post("/api/juniors/shirt-numbers"))
      .send({ season: SEASON, participantId: J.amy })
      .expect(401);
    await anon(request(app).patch("/api/juniors/shirt-numbers/1"))
      .send({ number: "1" })
      .expect(401);
    await anon(request(app).delete("/api/juniors/shirt-numbers/1")).expect(401);
    await anon(request(app).post("/api/juniors/shirt-numbers/seasons/2026/start")).expect(401);
    await anon(request(app).post("/api/juniors/shirt-numbers/uploads/1/commit"))
      .send({ resolutions: [] })
      .expect(401);
  });

  it("with the feature off, junior writes refuse with 400 and the profile has no numbers", async () => {
    const off = [
      await create({ season: SEASON, participantId: J.amy, number: "5" }),
      await as(request(app).post("/api/juniors/shirt-numbers/seasons/2026/start")),
      await upload("Name,Number\nAmy Archer,5\n"),
    ];
    for (const res of off) {
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/turned off/);
    }
    expect(await rows(SEASON)).toEqual([]);
    const profile = await as(
      request(app).get(`/api/juniors/players/${J.amy.toUpperCase()}`),
    ).expect(200);
    expect(profile.body).not.toHaveProperty("shirtNumber");
    expect(profile.body).not.toHaveProperty("shirtNumbers");
  });

  it("adds a junior by participant id (any casing), defaulting the name", async () => {
    await settings({ enabled: true });
    const res = await create({ season: SEASON, participantId: J.amy.toUpperCase(), number: "07" });
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({
      participantId: J.amy,
      name: "Amy Archer",
      number: "07",
      source: "admin",
      duplicate: false,
    });
    expect(res.body.entry).not.toHaveProperty("playerId");
    expect(res.body.warnings).toEqual([]);
  });

  it("a merged-away id resolves to the keeper, so the keeper cannot be added twice", async () => {
    const res = await create({ season: SEASON, participantId: J.dupOfAmy, number: "9" });
    expect(res.status).toBe(409);
    expect(res.body.warnings).toEqual([]);
  });

  it("refuses someone who is not one of the club's junior participants, and bad numbers", async () => {
    await create({ season: SEASON, participantId: GUID(999) }).expect(400);
    // Tenant B's junior is not tenant A's.
    await create({ season: SEASON, participantId: B_KID }).expect(400);
    await create({ season: SEASON, participantId: J.ben, number: "1000" }).expect(400);
    await create({ season: SEASON, participantId: J.ben, number: "7a" }).expect(400);
  });

  it("duplicate policy (warn): a second #07 saves with a warning; (block): refused", async () => {
    const ben = await create({ season: SEASON, participantId: J.ben, number: "07" });
    expect(ben.status).toBe(201);
    expect((ben.body.warnings as Warning[])[0]).toMatchObject({
      kind: "duplicate",
      number: "07",
      names: ["Amy Archer"],
    });
    expect(ben.body.entry.duplicate).toBe(true);
    // "7" is not "07".
    const cal = await create({ season: SEASON, participantId: J.cal, number: "7" }).expect(201);
    expect(cal.body.warnings).toEqual([]);

    await settings({ duplicatePolicy: "block" });
    const dan = await create({ season: SEASON, participantId: J.dan, number: "7" });
    expect(dan.status).toBe(409);
    expect((dan.body.warnings as Warning[])[0]?.names).toEqual(["Cal Catcher"]);
    const blocked = await update(cal.body.entry.id, { number: "07" });
    expect(blocked.status).toBe(409);
    // An unchanged duplicate can still be renamed.
    const renamed = await update(ben.body.entry.id, { name: "Benjamin Bowler" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.warnings).toHaveLength(1);
    await settings({ duplicatePolicy: "warn" });
  });

  it("rollover (carry): a new entry inherits last season's junior number; blank stores none", async () => {
    await create({ season: 2030, participantId: J.eli, number: "21" }).expect(201);
    const carried = await create({ season: 2031, participantId: J.eli }).expect(201);
    expect(carried.body.entry.number).toBe("21");

    await settings({ rolloverPolicy: "blank" });
    await create({ season: 2030, participantId: J.fay, number: "22" }).expect(201);
    const blank = await create({ season: 2031, participantId: J.fay }).expect(201);
    expect(blank.body.entry.number).toBeNull();
    await settings({ rolloverPolicy: "carry" });
  });

  it("rollover under block leaves a clashing carried number off with a warning", async () => {
    await settings({ duplicatePolicy: "block" });
    await create({ season: 2032, participantId: J.amy, number: "10" }).expect(201);
    await create({ season: 2033, participantId: J.ben, number: "10" }).expect(201);
    const res = await create({ season: 2033, participantId: J.amy }).expect(201);
    expect(res.body.entry.number).toBeNull();
    expect((res.body.warnings as Warning[])[0]?.names).toEqual(["Ben Bowler"]);
    await settings({ duplicatePolicy: "warn" });
  });

  it("season start copies the previous juniors season once; blank creates nothing", async () => {
    await create({ season: 2040, participantId: J.amy, number: "1" }).expect(201);
    await create({ season: 2040, participantId: J.ben }).expect(201);
    const first = await as(
      request(app).post("/api/juniors/shirt-numbers/seasons/2041/start"),
    ).expect(200);
    expect(first.body).toEqual({
      season: 2041,
      fromSeason: 2040,
      created: 2,
      numbered: 1,
      skipped: 0,
      warnings: [],
    });
    expect((await rows(2041)).map((r) => [r.participantId, r.number, r.source]).sort()).toEqual(
      [
        [J.amy, "1", "rollover"],
        [J.ben, null, "rollover"],
      ].sort(),
    );
    const second = await as(
      request(app).post("/api/juniors/shirt-numbers/seasons/2041/start"),
    ).expect(200);
    expect(second.body).toMatchObject({ created: 0, skipped: 2 });

    await settings({ rolloverPolicy: "blank" });
    const blank = await as(
      request(app).post("/api/juniors/shirt-numbers/seasons/2042/start"),
    ).expect(200);
    expect(blank.body.created).toBe(0);
    expect(await rows(2042)).toEqual([]);
    await settings({ rolloverPolicy: "carry" });
  });

  it("an upload matches rows to junior participants by id, then by name, and commits", async () => {
    const res = await upload(
      [
        "Name,Participant ID,Number",
        `Someone Else,${J.cal.toUpperCase()},33`,
        "Dan Driver,,34",
        "Nobody Known,,35",
      ].join("\n"),
      { season: 2050, who: "a2" },
    );
    expect(res.status).toBe(200);
    expect(res.body.side).toBe("junior");
    const [byId, byName, unknown] = res.body.rows as {
      status: string;
      participantId: string | null;
      playerId: number | null;
    }[];
    expect(byId).toMatchObject({ status: "matched", participantId: J.cal, playerId: null });
    expect(byName).toMatchObject({ status: "matched", participantId: J.dan });
    expect(unknown!.status).toBe("new");

    // Link the unknown row to Eli; the senior "hold" action does not exist here.
    await as(request(app).post(`/api/juniors/shirt-numbers/uploads/${res.body.id}/commit`), "a2")
      .send({ resolutions: [{ rowIndex: 3, action: "hold" }] })
      .expect(400);
    const committed = await as(
      request(app).post(`/api/juniors/shirt-numbers/uploads/${res.body.id}/commit`),
      "a2",
    )
      .send({ resolutions: [{ rowIndex: 3, action: "link", participantId: J.eli }] })
      .expect(200);
    expect(committed.body).toMatchObject({ created: 3, linked: 3, held: 0, discarded: 0 });
    expect((await rows(2050)).map((r) => [r.participantId, r.number, r.source]).sort()).toEqual(
      [
        [J.cal, "33", "upload"],
        [J.dan, "34", "upload"],
        [J.eli, "35", "upload"],
      ].sort(),
    );
    // Committing again is a conflict.
    await as(request(app).post(`/api/juniors/shirt-numbers/uploads/${res.body.id}/commit`), "a2")
      .send({ resolutions: [] })
      .expect(409);
  });

  it("an upload under block refuses a number someone else wears and applies nothing", async () => {
    await settings({ duplicatePolicy: "block" });
    const res = await upload("Name,Number\nAmy Archer,33\n", { season: 2050, who: "a2" }).expect(
      200,
    );
    const blocked = await as(
      request(app).post(`/api/juniors/shirt-numbers/uploads/${res.body.id}/commit`),
      "a2",
    ).send({ resolutions: [] });
    expect(blocked.status).toBe(409);
    expect(await rows(2050)).toHaveLength(3);
    await settings({ duplicatePolicy: "warn" });
  });

  it("junior and senior registers never share entries (routes and shared service)", async () => {
    // A senior entry for the SAME PlayHQ participant and number.
    await db.insert(shirtNumbersTable).values({
      tenantId: tenants.a,
      season: SEASON,
      name: "Senior Amy",
      participantId: J.amy,
      number: "88",
    });
    const junior = await list(SEASON);
    expect(junior.entries.map((e) => e.name)).not.toContain("Senior Amy");
    const senior = await as(request(app).get(`/api/shirt-numbers?season=${SEASON}`)).expect(200);
    expect((senior.body.entries as { name: string }[]).map((e) => e.name)).toEqual(["Senior Amy"]);

    // Shared service, junior side: reads junior_shirt_numbers only.
    const juniorEntries = await loadSeasonEntries(db, "junior", tenants.a, SEASON);
    expect(juniorEntries.every((e) => e.playerId === null)).toBe(true);
    expect(juniorEntries.map((e) => e.number)).not.toContain("88");
    expect(
      (
        await checkDuplicateNumber(db, {
          side: "junior",
          tenantId: tenants.a,
          season: SEASON,
          number: "88",
        })
      ).others,
    ).toEqual([]);
    // ...and the senior side never sees the junior #07s.
    const seniorEntries = await loadSeasonEntries(db, "senior", tenants.a, SEASON);
    expect(seniorEntries.map((e) => e.name)).toEqual(["Senior Amy"]);
    expect(
      (
        await checkDuplicateNumber(db, {
          side: "senior",
          tenantId: tenants.a,
          season: SEASON,
          number: "07",
        })
      ).others,
    ).toEqual([]);
    // Carry-forward stays on its side too.
    expect(
      await carriedNumberFor(db, {
        tenantId: tenants.a,
        side: "junior",
        season: SEASON + 1,
        participantId: J.amy,
      }),
    ).toBe("07");
    expect(
      await carriedNumberFor(db, {
        tenantId: tenants.a,
        side: "senior",
        season: SEASON + 1,
        participantId: J.amy,
      }),
    ).toBe("88");
  });

  it("the junior profile shows the current number and history from the juniors register only", async () => {
    await create({ season: CURRENT, participantId: J.fay, number: "4" }).then((r) =>
      expect([201, 409]).toContain(r.status),
    );
    const [fayNow] = (await rows(CURRENT)).filter((r) => r.participantId === J.fay);
    await update(fayNow!.id, { number: "4" }).expect(200);
    await create({ season: CURRENT - 3, participantId: J.fay, number: "12" }).expect(201);
    // A senior number for the same participant never shows on the junior profile.
    await db.insert(shirtNumbersTable).values({
      tenantId: tenants.a,
      season: CURRENT,
      name: "Senior Fay",
      participantId: J.fay,
      number: "99",
    });
    const res = await as(request(app).get(`/api/juniors/players/${J.fay.toUpperCase()}`)).expect(
      200,
    );
    expect(res.body.shirtNumber).toBe("4");
    const history = res.body.shirtNumbers as { season: number; number: string }[];
    expect(history[0]).toEqual({ season: CURRENT, number: "4" });
    expect(history).toContainEqual({ season: CURRENT - 3, number: "12" });
    expect(history.map((h) => h.number)).not.toContain("99");
  });

  it("tenant B cannot read or write tenant A's junior entries", async () => {
    const aEntry = (await list(SEASON)).entries[0]!;
    expect((await list(SEASON, "b")).entries).toEqual([]);
    await settings({ enabled: true }, "b");
    await update(aEntry.id, { number: "1" }, "b").expect(404);
    await as(request(app).delete(`/api/juniors/shirt-numbers/${aEntry.id}`), "b").expect(404);
    expect((await rows(SEASON)).find((r) => r.id === aEntry.id)?.number).toBe(aEntry.number);
    await create({ season: SEASON, participantId: J.amy }, "b").expect(400);
    // B's own junior works, and stays out of A's register.
    await create({ season: SEASON, participantId: B_KID, number: "07" }, "b").expect(201);
    expect((await list(SEASON)).entries.map((e) => e.participantId)).not.toContain(B_KID);

    const res = await upload("Name,Number\nAmy Archer,5\n", { season: 2060, who: "a2" }).expect(
      200,
    );
    await as(request(app).post(`/api/juniors/shirt-numbers/uploads/${res.body.id}/commit`), "b")
      .send({ resolutions: [] })
      .expect(404);
    await as(request(app).delete(`/api/juniors/shirt-numbers/uploads/${res.body.id}`), "b").expect(
      404,
    );
    // A senior-side discard cannot touch a junior upload either.
    await as(request(app).delete(`/api/shirt-numbers/uploads/${res.body.id}`), "a2").expect(404);
    await as(request(app).delete(`/api/juniors/shirt-numbers/uploads/${res.body.id}`), "a2").expect(
      204,
    );
  });

  it("a central-read tenant gets an empty register and 404 from junior writes", async () => {
    await settings({ enabled: true }, "central");
    const reg = await list(SEASON, "central");
    expect(reg).toEqual({ season: SEASON, seasons: [], entries: [] });
    const writes = [
      await create({ season: SEASON, participantId: J.amy }, "central"),
      await update(1, { number: "1" }, "central"),
      await as(request(app).delete("/api/juniors/shirt-numbers/1"), "central"),
      await as(request(app).post("/api/juniors/shirt-numbers/seasons/2026/start"), "central"),
      await as(request(app).post("/api/juniors/shirt-numbers/uploads"), "central")
        .field("kind", "numbers")
        .field("season", "2026")
        .attach("file", Buffer.from("Name,Number\nA B,1\n"), { filename: "a.csv" }),
      await as(request(app).post("/api/juniors/shirt-numbers/uploads/1/commit"), "central").send({
        resolutions: [],
      }),
      await as(request(app).delete("/api/juniors/shirt-numbers/uploads/1"), "central"),
    ];
    for (const res of writes) expect(res.status).toBe(404);
    expect(await rows(SEASON, tenants.central)).toEqual([]);
  });
});
