import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  juniorParticipantsTable,
  juniorShirtNumbersTable,
  shirtNumbersTable,
  shirtNumberSettingsTable,
  squadMembersTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Season shirt numbers — "Add squad to register" (plan R5, U4, U10). The club's
 * one PlayHQ import is the squad import (`squad_members`); these routes add its
 * active members to a season's register:
 *
 *   POST /api/shirt-numbers/seasons/:season/from-squad          (senior members)
 *   POST /api/juniors/shirt-numbers/seasons/:season/from-squad  (junior members)
 *
 * Covers linking, held name-only entries, private members, fill-in and
 * out-of-space links, idempotency, carry-forward and the block policy, the
 * feature switch, tenant isolation, juniors isolation in both directions and
 * the juniors gating for central-read clubs.
 *
 * Real-DB integration test (needs DATABASE_URL; runs in CI's API job).
 */

const STAMP = Date.now();
const GUID = (n: number) =>
  `96${String(STAMP).slice(-6)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEASON = 2031;

type Result = {
  season: number;
  created: number;
  skipped: number;
  unmatched: string[];
  warnings: { kind: string; number: string; message: string; names: string[] }[];
};

describe("shirt numbers: add squad to register", () => {
  const tenants: Record<"a" | "b" | "central", number> = { a: 0, b: 0, central: 0 };
  const cookies: Record<"a" | "b" | "central", string> = { a: "", b: "", central: "" };
  const adminIds: number[] = [];
  /** Tenant A's player space (its crosswalk). */
  const P = { alice: 81_001, bea: 81_002, cy: 81_003 };
  /** Tenant A's junior participants. */
  const J = { amy: GUID(11), ben: GUID(12), twinA: GUID(13), twinB: GUID(14) };

  type Who = keyof typeof tenants;
  const as = (r: request.Test, who: Who = "a") =>
    r.set("x-tenant-id", String(tenants[who])).set("Cookie", cookies[who]);
  const anon = (r: request.Test) => r.set("x-tenant-id", String(tenants.a));
  const settings = (body: object, who: Who = "a") =>
    as(request(app).patch("/api/shirt-numbers/settings"), who).send(body).expect(200);
  const addSenior = (season: number, who: Who = "a") =>
    as(request(app).post(`/api/shirt-numbers/seasons/${season}/from-squad`), who);
  const addJunior = (season: number, who: Who = "a") =>
    as(request(app).post(`/api/juniors/shirt-numbers/seasons/${season}/from-squad`), who);
  const seniorRows = (season: number, tenantId = tenants.a) =>
    db
      .select()
      .from(shirtNumbersTable)
      .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.season, season)));
  const juniorRows = (season: number, tenantId = tenants.a) =>
    db
      .select()
      .from(juniorShirtNumbersTable)
      .where(
        and(
          eq(juniorShirtNumbersTable.tenantId, tenantId),
          eq(juniorShirtNumbersTable.season, season),
        ),
      );

  async function makeTenant(key: Who, readsFromCentral: boolean, clubId: number) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `squad-shirts-${key}-${STAMP}`,
        centralClubId: clubId,
        readsFromCentral,
        name: `Squad Shirts ${key}`,
        plan: "pro",
      })
      .returning();
    tenants[key] = t.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `squad_shirts_${key}_${STAMP}`,
        displayName: `Squad Shirts ${key}`,
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    cookies[key] =
      `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  }

  const member = (
    tenantId: number,
    first: string,
    last: string,
    extra: Partial<typeof squadMembersTable.$inferInsert> = {},
  ) => ({ tenantId, firstName: first, lastName: last, section: "senior" as const, ...extra });

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-squad-shirts";
    await makeTenant("a", false, 98_201);
    await makeTenant("b", false, 98_202);
    await makeTenant("central", true, 98_203);

    await db.insert(playerIdMapTable).values([
      { tenantId: tenants.a, participantId: GUID(1), playerId: P.alice },
      { tenantId: tenants.a, participantId: GUID(2), playerId: P.bea },
      { tenantId: tenants.a, participantId: GUID(3), playerId: P.cy },
    ]);
    await db.insert(juniorParticipantsTable).values([
      { participantId: J.amy.toUpperCase(), tenantId: tenants.a, displayName: "Amy Archer" },
      { participantId: J.ben, tenantId: tenants.a, displayName: "Ben Bowler" },
      { participantId: J.twinA, tenantId: tenants.a, displayName: "Tia Twin" },
      { participantId: J.twinB, tenantId: tenants.a, displayName: "Tia Twin" },
    ]);

    const a = tenants.a;
    await db.insert(squadMembersTable).values([
      // Seniors.
      member(a, "Alice", "Able", { playhqProfileId: `pa-${STAMP}`, linkedPlayerId: P.alice }),
      member(a, "Bea", "Bat", { playhqProfileId: `pb-${STAMP}`, linkedPlayerId: P.bea }),
      member(a, "Ned", "New", { playhqProfileId: `pn-${STAMP}` }),
      member(a, "Pia", "Private", {
        playhqProfileId: `pp-${STAMP}`,
        linkedPlayerId: P.cy,
        isPrivate: true,
      }),
      // A fill-in id and an id outside tenant A's space are never linked.
      member(a, "Fil", "Inn", { playhqProfileId: `pf-${STAMP}`, linkedPlayerId: 90_001 }),
      member(a, "Out", "Side", { playhqProfileId: `po-${STAMP}`, linkedPlayerId: 81_999 }),
      member(a, "Sat", "Out", { playhqProfileId: `ps-${STAMP}`, active: false }),
      // Juniors.
      member(a, "Amy", "Archer", { section: "junior", playhqProfileId: J.amy }),
      member(a, "Ben", "BOWLER", { section: "junior", playhqProfileId: `pj-${STAMP}` }),
      member(a, "Tia", "Twin", { section: "junior", playhqProfileId: `pt-${STAMP}` }),
      member(a, "Zed", "Unknown", { section: "junior", playhqProfileId: `pz-${STAMP}` }),
      // Tenant B's squad.
      member(tenants.b, "Bob", "Other-Club", { playhqProfileId: `pb2-${STAMP}` }),
      member(tenants.b, "Kit", "Other-Junior", {
        section: "junior",
        playhqProfileId: `pk-${STAMP}`,
      }),
    ]);
  });

  afterAll(async () => {
    const ids = Object.values(tenants);
    await db.delete(juniorShirtNumbersTable).where(inArray(juniorShirtNumbersTable.tenantId, ids));
    await db.delete(shirtNumbersTable).where(inArray(shirtNumbersTable.tenantId, ids));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, ids));
    await db.delete(squadMembersTable).where(inArray(squadMembersTable.tenantId, ids));
    await db.delete(juniorParticipantsTable).where(inArray(juniorParticipantsTable.tenantId, ids));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, ids));
    await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
  });

  it("requests without an admin session get 401", async () => {
    await anon(request(app).post(`/api/shirt-numbers/seasons/${SEASON}/from-squad`)).expect(401);
    await anon(request(app).post(`/api/juniors/shirt-numbers/seasons/${SEASON}/from-squad`)).expect(
      401,
    );
  });

  it("with the feature off, both routes refuse with 400 and write nothing", async () => {
    expect((await addSenior(SEASON)).status).toBe(400);
    expect((await addJunior(SEASON)).status).toBe(400);
    expect(await seniorRows(SEASON)).toEqual([]);
    expect(await juniorRows(SEASON)).toEqual([]);
  });

  it("refuses an invalid season", async () => {
    expect((await addSenior(99_999)).status).toBe(400);
    expect((await addJunior(99_999)).status).toBe(400);
  });

  it("adds the active senior squad: linked, held by name, private; never fill-in or foreign links", async () => {
    await settings({ enabled: true, duplicatePolicy: "warn", rolloverPolicy: "carry" });
    // Last season: Alice wore #7 (carried), and a held lineup entry for Bea carries #12.
    await db.insert(shirtNumbersTable).values([
      {
        tenantId: tenants.a,
        season: SEASON - 1,
        name: "Alice Able",
        playerId: P.alice,
        number: "7",
      },
      {
        tenantId: tenants.a,
        season: SEASON - 1,
        name: "B Bat",
        participantId: GUID(2),
        number: "12",
      },
    ]);

    const res = await addSenior(SEASON).expect(200);
    const body = res.body as Result;
    expect(body).toMatchObject({ season: SEASON, created: 6, skipped: 0, unmatched: [] });

    const rows = await seniorRows(SEASON);
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect([...byName.keys()].sort()).toEqual(
      ["Alice Able", "Bea Bat", "Fil Inn", "Ned New", "Out Side", "Pia Private"].sort(),
    );
    expect(rows.every((r) => r.source === "squad")).toBe(true);
    expect(byName.get("Alice Able")).toMatchObject({
      playerId: P.alice,
      participantId: GUID(1),
      number: "7",
    });
    expect(byName.get("Bea Bat")).toMatchObject({ playerId: P.bea, number: "12" });
    expect(byName.get("Pia Private")).toMatchObject({ playerId: P.cy, number: null });
    // Unlinked → held name-only; a profile id is never stored as a participant id.
    expect(byName.get("Ned New")).toMatchObject({ playerId: null, participantId: null });
    expect(byName.get("Fil Inn")).toMatchObject({ playerId: null, participantId: null });
    expect(byName.get("Out Side")).toMatchObject({ playerId: null, participantId: null });
    // Juniors isolation: no junior squad member reaches the senior register…
    expect(byName.has("Amy Archer")).toBe(false);
    // …and the senior add writes nothing to the juniors register.
    expect(await juniorRows(SEASON)).toEqual([]);
  });

  it("is idempotent: a re-run leaves every entry and number as it is", async () => {
    const before = await seniorRows(SEASON);
    const alice = before.find((r) => r.name === "Alice Able")!;
    await db
      .update(shirtNumbersTable)
      .set({ number: "70" })
      .where(eq(shirtNumbersTable.id, alice.id));
    const res = await addSenior(SEASON).expect(200);
    expect(res.body).toMatchObject({ created: 0, skipped: 6 });
    const after = await seniorRows(SEASON);
    expect(after).toHaveLength(before.length);
    expect(after.find((r) => r.id === alice.id)!.number).toBe("70");
  });

  it("recognises a unique name-only held entry as the linked member; under block leaves off a clashing carry", async () => {
    const season = SEASON + 1;
    await settings({ duplicatePolicy: "block" });
    await db.insert(shirtNumbersTable).values([
      // Bea held by name only this season (number unchanged by the add).
      { tenantId: tenants.a, season, name: "Bea  BAT", number: "5" },
      // Someone already wears Alice's carried #70.
      { tenantId: tenants.a, season, name: "Zed Zee", number: "70" },
    ]);
    const res = await addSenior(season).expect(200);
    const body = res.body as Result;
    expect(body.skipped).toBe(1);
    const rows = await seniorRows(season);
    expect(rows.filter((r) => /bea/i.test(r.name))).toHaveLength(1);
    expect(rows.find((r) => /bea/i.test(r.name))!.number).toBe("5");
    expect(rows.find((r) => r.name === "Alice Able")).toMatchObject({
      playerId: P.alice,
      number: null,
    });
    expect(body.warnings.some((w) => w.number === "70" && /not carried/.test(w.message))).toBe(
      true,
    );
    await settings({ duplicatePolicy: "warn" });
  });

  it("adds the junior squad to the juniors register only, matched to junior participants", async () => {
    await db.insert(juniorShirtNumbersTable).values({
      tenantId: tenants.a,
      season: SEASON - 1,
      participantId: J.ben,
      name: "Ben Bowler",
      number: "9",
    });
    const res = await addJunior(SEASON).expect(200);
    const body = res.body as Result;
    expect(body.created).toBe(2);
    // Tia matches two participants by name; Zed matches none.
    expect(body.unmatched.sort()).toEqual(["Tia Twin", "Zed Unknown"]);

    const rows = await juniorRows(SEASON);
    expect(rows.map((r) => [r.participantId, r.number, r.source]).sort()).toEqual(
      [
        [J.amy, null, "squad"],
        [J.ben, "9", "squad"],
      ].sort(),
    );
    // Juniors isolation: the junior add never touches the senior register.
    expect((await seniorRows(SEASON)).some((r) => /archer|bowler/i.test(r.name))).toBe(false);

    const again = await addJunior(SEASON).expect(200);
    expect(again.body).toMatchObject({ created: 0, skipped: 2 });
  });

  it("tenant isolation: each club adds only its own squad", async () => {
    await settings({ enabled: true }, "b");
    const senior = await addSenior(SEASON, "b").expect(200);
    expect(senior.body).toMatchObject({ created: 1 });
    expect((await seniorRows(SEASON, tenants.b)).map((r) => r.name)).toEqual(["Bob Other-Club"]);
    // Tenant B has no junior participants: its junior member is unmatched, and
    // tenant A's participants are never matched for it.
    const junior = await addJunior(SEASON, "b").expect(200);
    expect(junior.body).toMatchObject({ created: 0, unmatched: ["Kit Other-Junior"] });
    expect(await juniorRows(SEASON, tenants.b)).toEqual([]);
    // Tenant A's register is untouched by tenant B's runs.
    expect((await seniorRows(SEASON)).some((r) => r.name === "Bob Other-Club")).toBe(false);
  });

  it("a central-read club adds seniors but gets 404 from the junior route", async () => {
    await settings({ enabled: true }, "central");
    const senior = await addSenior(SEASON, "central").expect(200);
    expect(senior.body).toMatchObject({ created: 0, skipped: 0 });
    await addJunior(SEASON, "central").expect(404);
  });
});
