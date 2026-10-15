import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  tenantsTable,
  juniorFixturesTable,
  juniorParticipantsTable,
  juniorShirtNumbersTable,
  juniorTeamListsTable,
  shirtNumberSettingsTable,
} from "@workspace/db";
import { teamListAction } from "@workspace/db/playhq-ingest";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Junior fixtures and team lists (junior PlayHQ sync plan U6; KTD9, KTD12, KTD15,
 * R8, R9, R15, R17, R23):
 *
 *  - the upcoming list holds only this tenant's junior fixtures, soonest first,
 *    filterable by age group;
 *  - another tenant's fixture id is a 404; a club with junior sync off gets an
 *    empty public list and 404s;
 *  - the public detail names the published team list in the club's style and
 *    withholds a private player;
 *  - an admin PUT saves the list as `admin`, which the next sync leaves alone;
 *  - a PUT naming another tenant's or an opposition participant is refused;
 *  - the admin view shows each player's season shirt number.
 *
 * Real-DB integration test (needs DATABASE_URL): CI only.
 */

const STAMP = Date.now();
const SEASON = 2026;
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(Date.now() + hours * HOUR);

const pid = (tag: string) => `${tag}-${STAMP}`.toLowerCase();
const A_OLLIE = pid("jfx-a-ollie");
const A_SAM = pid("jfx-a-sam"); // private in PlayHQ, not overridden
const A_KIT = pid("jfx-a-kit");
const B_ONLY = pid("jfx-b-only"); // tenant B's junior
const OPPOSITION = pid("jfx-opp"); // nobody's participant row

describe("junior fixtures and team lists", () => {
  let tenantA = 0;
  let tenantB = 0;
  let tenantOff = 0;
  let cookieA = "";
  let cookieB = "";
  let fxA6 = 0; // Year 6, in 2 days, PlayHQ list published
  let fxA7 = 0; // Year 7, in 1 day
  let fxAPast = 0; // 3 days ago
  let fxB = 0;
  let fxOff = 0;

  const asA = (r: request.Test) => r.set("x-tenant-id", String(tenantA));
  const asAdminA = (r: request.Test) => asA(r).set("Cookie", cookieA);
  const asB = (r: request.Test) => r.set("x-tenant-id", String(tenantB));
  const asAdminB = (r: request.Test) => asB(r).set("Cookie", cookieB);
  const asOff = (r: request.Test) => r.set("x-tenant-id", String(tenantOff));

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-juniors-fixtures";
    const make = async (key: string, clubId: number, juniorSyncEnabled: boolean) => {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `jfx-${key}-${STAMP}`,
          centralClubId: clubId,
          name: `JFX ${key}`,
          plan: "pro",
          playhqOrgId: `jfx-org-${key}-${STAMP}`,
          playhqSyncEnabled: true,
          juniorSyncEnabled,
        })
        .returning();
      return t.id;
    };
    tenantA = await make("a", 94_000 + (STAMP % 1000), true);
    tenantB = await make("b", 95_000 + (STAMP % 1000), true);
    tenantOff = await make("off", 96_000 + (STAMP % 1000), false);

    const admin = async (tenantId: number, key: string) => {
      const [row] = await db
        .insert(adminsTable)
        .values({
          tenantId,
          username: `test_admin_jfx_${key}_${STAMP}`,
          displayName: key,
          passwordHash: "x",
        })
        .returning();
      return `${SESSION_COOKIE}=${encodeSession({ adminId: row.id, issuedAt: Date.now() })}`;
    };
    cookieA = await admin(tenantA, "a");
    cookieB = await admin(tenantB, "b");

    await db.insert(juniorParticipantsTable).values([
      { tenantId: tenantA, participantId: A_OLLIE, displayName: "Ollie Gallash" },
      { tenantId: tenantA, participantId: A_SAM, displayName: "Sam Hidden", isPrivate: true },
      { tenantId: tenantA, participantId: A_KIT, displayName: "Kit Carson" },
      { tenantId: tenantB, participantId: B_ONLY, displayName: "Bea Other" },
    ]);

    // Tenant A has shirt numbers on, with numbers for two of its juniors.
    await db.insert(shirtNumberSettingsTable).values({ tenantId: tenantA, enabled: true });
    await db.insert(juniorShirtNumbersTable).values([
      {
        tenantId: tenantA,
        season: SEASON,
        participantId: A_OLLIE,
        name: "Ollie Gallash",
        number: "7",
      },
      { tenantId: tenantA, season: SEASON, participantId: A_SAM, name: "Sam Hidden", number: "12" },
    ]);

    const fixture = async (tenantId: number, key: string, ageGroup: string, startAt: Date) => {
      const [row] = await db
        .insert(juniorFixturesTable)
        .values({
          tenantId,
          playhqMatchId: `jfx-${key}-${STAMP}`,
          seasonStartYear: SEASON,
          ageGroup,
          grade: `${ageGroup} Gold`,
          teamName: "Hawks",
          opponentName: "Eagles",
          venue: "Oval 1",
          startAt,
          isHome: true,
          status: "UPCOMING",
        })
        .returning();
      return row.id;
    };
    fxA6 = await fixture(tenantA, "a6", "Year 6", at(48));
    fxA7 = await fixture(tenantA, "a7", "Year 7", at(24));
    fxAPast = await fixture(tenantA, "apast", "Year 6", at(-72));
    fxB = await fixture(tenantB, "b", "Year 6", at(30));
    fxOff = await fixture(tenantOff, "off", "Year 6", at(30));

    await db.insert(juniorTeamListsTable).values({
      tenantId: tenantA,
      juniorFixtureId: fxA6,
      players: [
        { order: 1, participantId: A_OLLIE, role: "C" },
        { order: 2, participantId: A_SAM },
      ],
      isPublished: true,
      source: "playhq",
    });
  });

  afterAll(async () => {
    const tenants = [tenantA, tenantB, tenantOff];
    await db.delete(juniorTeamListsTable).where(inArray(juniorTeamListsTable.tenantId, tenants));
    await db.delete(juniorFixturesTable).where(inArray(juniorFixturesTable.tenantId, tenants));
    await db
      .delete(juniorShirtNumbersTable)
      .where(inArray(juniorShirtNumbersTable.tenantId, tenants));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, tenants));
    await db
      .delete(juniorParticipantsTable)
      .where(inArray(juniorParticipantsTable.tenantId, tenants));
    await db.delete(adminsTable).where(inArray(adminsTable.tenantId, tenants));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenants));
  });

  it("lists only this tenant's upcoming junior fixtures, soonest first", async () => {
    const res = await asA(request(app).get("/api/juniors/fixtures")).expect(200);
    const ids = res.body.map((f: { id: number }) => f.id);
    expect(ids).toEqual([fxA7, fxA6]);
    expect(ids).not.toContain(fxAPast);
    expect(ids).not.toContain(fxB);
    const a6 = res.body.find((f: { id: number }) => f.id === fxA6);
    expect(a6).toMatchObject({ ageGroup: "Year 6", teamName: "Hawks", hasTeamList: true });
    expect(res.body.find((f: { id: number }) => f.id === fxA7).hasTeamList).toBe(false);
  });

  it("filters by age group", async () => {
    const res = await asA(request(app).get("/api/juniors/fixtures?ageGroup=Year%206")).expect(200);
    expect(res.body.map((f: { id: number }) => f.id)).toEqual([fxA6]);
  });

  it("a club with junior sync off gets nothing publicly", async () => {
    expect((await asOff(request(app).get("/api/juniors/fixtures")).expect(200)).body).toEqual([]);
    await asOff(request(app).get(`/api/juniors/fixtures/${fxOff}`)).expect(404);
  });

  it("another tenant's fixture id is a 404, publicly and for an admin", async () => {
    await asB(request(app).get(`/api/juniors/fixtures/${fxA6}`)).expect(404);
    await asAdminB(request(app).get(`/api/juniors/fixtures/${fxA6}/team-list`)).expect(404);
    await asAdminB(request(app).put(`/api/juniors/fixtures/${fxA6}/team-list`))
      .send({ players: [{ order: 1, participantId: B_ONLY }] })
      .expect(404);
    const [row] = await db
      .select()
      .from(juniorTeamListsTable)
      .where(
        and(
          eq(juniorTeamListsTable.tenantId, tenantA),
          eq(juniorTeamListsTable.juniorFixtureId, fxA6),
        ),
      );
    expect(row.source).toBe("playhq");
  });

  it("names the published team list publicly and withholds a private player", async () => {
    const res = await asA(request(app).get(`/api/juniors/fixtures/${fxA6}`)).expect(200);
    expect(res.body.fixture.id).toBe(fxA6);
    expect(res.body.teamList).toEqual([
      { order: 1, name: "Ollie Gallash", participantId: A_OLLIE, role: "C", shirtNumber: "7" },
      { order: 2, name: "Private Player", participantId: null, role: null, shirtNumber: null },
    ]);
    const unlisted = await asA(request(app).get(`/api/juniors/fixtures/${fxA7}`)).expect(200);
    expect(unlisted.body.teamList).toBeNull();
  });

  it("the admin view needs an admin and shows full names and season shirt numbers", async () => {
    await asA(request(app).get(`/api/juniors/fixtures/${fxA6}/team-list`)).expect(401);
    const res = await asAdminA(request(app).get(`/api/juniors/fixtures/${fxA6}/team-list`)).expect(
      200,
    );
    expect(res.body.season).toBe(SEASON);
    expect(res.body.shirtNumbersEnabled).toBe(true);
    expect(res.body.teamList.source).toBe("playhq");
    expect(res.body.teamList.players).toEqual([
      expect.objectContaining({ participantId: A_OLLIE, name: "Ollie Gallash", shirtNumber: "7" }),
      expect.objectContaining({
        participantId: A_SAM,
        name: "Sam Hidden",
        shirtNumber: "12",
        isPrivate: true,
      }),
    ]);
    const candidates = res.body.candidates.map((c: { participantId: string }) => c.participantId);
    expect(candidates).toEqual(expect.arrayContaining([A_OLLIE, A_SAM, A_KIT]));
    expect(candidates).not.toContain(B_ONLY);
  });

  it("refuses another tenant's or an opposition participant", async () => {
    for (const participantId of [B_ONLY, OPPOSITION]) {
      await asAdminA(request(app).put(`/api/juniors/fixtures/${fxA7}/team-list`))
        .send({
          players: [
            { order: 1, participantId: A_OLLIE },
            { order: 2, participantId },
          ],
        })
        .expect(400);
    }
    const rows = await db
      .select()
      .from(juniorTeamListsTable)
      .where(
        and(
          eq(juniorTeamListsTable.tenantId, tenantA),
          eq(juniorTeamListsTable.juniorFixtureId, fxA7),
        ),
      );
    expect(rows).toEqual([]);
  });

  it("an admin save is stored as `admin`, and the next sync leaves it alone", async () => {
    const res = await asAdminA(request(app).put(`/api/juniors/fixtures/${fxA6}/team-list`))
      .send({
        players: [
          { order: 2, participantId: A_KIT.toUpperCase(), role: "WK" },
          { order: 1, participantId: A_OLLIE, role: "C" },
        ],
      })
      .expect(200);
    expect(res.body.teamList.source).toBe("admin");
    // isPublished omitted: the published PlayHQ list stays published.
    expect(res.body.teamList.isPublished).toBe(true);
    expect(
      res.body.teamList.players.map((p: { participantId: string }) => p.participantId),
    ).toEqual([A_OLLIE, A_KIT]);

    const [row] = await db
      .select()
      .from(juniorTeamListsTable)
      .where(
        and(
          eq(juniorTeamListsTable.tenantId, tenantA),
          eq(juniorTeamListsTable.juniorFixtureId, fxA6),
        ),
      );
    expect(row.source).toBe("admin");
    expect(row.players).toEqual([
      { order: 1, participantId: A_OLLIE, role: "C" },
      { order: 2, participantId: A_KIT, role: "WK" },
    ]);
    // The projection's decision for a re-synced PlayHQ side over this row.
    expect(
      teamListAction(row, [
        { order: 1, participantId: A_OLLIE },
        { order: 2, participantId: A_SAM },
      ]),
    ).toBe("keepAdmin");

    // Public detail now reflects the admin's list.
    const pub = await asA(request(app).get(`/api/juniors/fixtures/${fxA6}`)).expect(200);
    expect(pub.body.teamList.map((p: { name: string }) => p.name)).toEqual([
      "Ollie Gallash",
      "Kit Carson",
    ]);
  });

  it("a save creates an unpublished list by default and refuses bad roles or orders", async () => {
    await asAdminA(request(app).put(`/api/juniors/fixtures/${fxA7}/team-list`))
      .send({
        players: [
          { order: 1, participantId: A_OLLIE, role: "C" },
          { order: 2, participantId: A_KIT, role: "C" },
        ],
      })
      .expect(400);
    await asAdminA(request(app).put(`/api/juniors/fixtures/${fxA7}/team-list`))
      .send({
        players: [
          { order: 1, participantId: A_OLLIE },
          { order: 1, participantId: A_KIT },
        ],
      })
      .expect(400);
    const res = await asAdminA(request(app).put(`/api/juniors/fixtures/${fxA7}/team-list`))
      .send({ players: [{ order: 1, participantId: A_OLLIE }] })
      .expect(200);
    expect(res.body.teamList).toMatchObject({ source: "admin", isPublished: false });
    const pub = await asA(request(app).get(`/api/juniors/fixtures/${fxA7}`)).expect(200);
    expect(pub.body.teamList).toBeNull();
  });
});
