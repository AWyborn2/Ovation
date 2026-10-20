import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  captainsTable,
  captainGradePermissionsTable,
  availabilityRoundsTable,
  fixturesTable,
  selectionsTable,
  squadMembersTable,
  squadMemberSeasonsTable,
  teamListsTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import {
  SESSION_COOKIE,
  CAPTAIN_SESSION_COOKIE,
  encodeSession,
  encodeCaptainSession,
} from "../lib/auth";
import { setEmailTransport } from "../lib/integrations/email";
import { setSmsTransport } from "../lib/integrations/sms";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { pinClockMidWeek } from "../lib/mid-week-clock.test-helpers";
import { perthDayStart } from "../lib/availability-grades";
import { DEFAULT_SCHEDULE, roundWeekendFor } from "../lib/availability-schedule";
import { buildTeamSheet } from "../lib/team-sheet";

/**
 * Overseas players (ADR-009, PR C):
 * - the per-season squad flag (`PUT /squad/:id/seasons/:season`): admin only,
 *   tenant-scoped, and no carry-over between seasons;
 * - the per-grade cap in the availability settings;
 * - the board's per-slot flag and counter, finalise over the cap (never
 *   blocked), and the snapshot into the side and the published team list.
 * Real-DB integration test (needs DATABASE_URL with migrations applied).
 */

const STAMP = Date.now();

type BoardSide = {
  id: number;
  version: number;
  state: string;
  slots: { memberId: number | null; overseas?: boolean }[];
  overseas: { count: number; cap: number | null; over: boolean };
};

describe("overseas players", () => {
  let tenantA = 0;
  let tenantB = 0;
  let adminA = "";
  let adminB = "";
  let captainA = "";
  let ana = 0;
  let ben = 0;
  let priv = 0;
  let sideId = 0;
  let fixtureId = 0;
  let season = 0;

  const asA = (r: request.Test) => r.set("x-tenant-id", String(tenantA));
  const setFlag = (cookie: string, id: number, s: number, overseas: unknown) =>
    asA(request(app).put(`/api/squad/${id}/seasons/${s}`).set("Cookie", cookie)).send({
      overseas,
    });
  const squadOverseas = async (id: number) => {
    const list = await asA(request(app).get("/api/squad").set("Cookie", adminA)).expect(200);
    return list.body.find((m: { id: number }) => m.id === id).overseas as boolean;
  };
  const side = async (): Promise<BoardSide> => {
    const board = await asA(
      request(app).get("/api/selection/board?section=senior").set("Cookie", adminA),
    ).expect(200);
    return board.body.selections.find((s: BoardSide) => s.id === sideId);
  };

  beforeAll(async () => {
    pinClockMidWeek();
    setSmsTransport(async () => {});
    setEmailTransport(async () => {});
    season = seasonStartYearFor(new Date());
    const tenants = await db
      .insert(tenantsTable)
      .values([
        {
          slug: `overseas-a-${STAMP}`,
          centralClubId: 7_900_000 + (STAMP % 100_000) * 10,
          name: "Overseas A",
          plan: "pilot",
        },
        {
          slug: `overseas-b-${STAMP}`,
          centralClubId: 7_900_001 + (STAMP % 100_000) * 10,
          name: "Overseas B",
          plan: "pilot",
        },
      ])
      .returning();
    [tenantA, tenantB] = tenants.map((t) => t.id);
    const admins = await db
      .insert(adminsTable)
      .values([
        {
          tenantId: tenantA,
          username: `os_a_${STAMP}`,
          displayName: "Pat Admin",
          passwordHash: "x",
        },
        {
          tenantId: tenantB,
          username: `os_b_${STAMP}`,
          displayName: "Bo Admin",
          passwordHash: "x",
        },
      ])
      .returning();
    adminA = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[0].id, issuedAt: Date.now() })}`;
    adminB = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[1].id, issuedAt: Date.now() })}`;
    const [cap] = await db
      .insert(captainsTable)
      .values({
        tenantId: tenantA,
        username: `os_cap_${STAMP}`,
        displayName: "Cy Captain",
        passwordHash: "x",
      })
      .returning();
    await db.insert(captainGradePermissionsTable).values({ captainId: cap.id, grade: "A Grade" });
    captainA = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({ captainId: cap.id, issuedAt: Date.now() })}`;

    const rows = await db
      .insert(squadMembersTable)
      .values([
        { tenantId: tenantA, firstName: "Ana", lastName: "Abroad" },
        { tenantId: tenantA, firstName: "Ben", lastName: "Local" },
        { tenantId: tenantA, firstName: "Pia", lastName: "Private", isPrivate: true },
      ])
      .returning();
    [ana, ben, priv] = rows.map((r) => r.id);

    const weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    const startAt = new Date(perthDayStart(weekendDate).getTime() + 13 * 3_600_000);
    const [round] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId: tenantA, weekendDate })
      .returning();
    const [f] = await db
      .insert(fixturesTable)
      .values({ tenantId: tenantA, grade: "A Grade", opponentName: "Mandurah", startAt })
      .returning();
    fixtureId = f.id;
    const slots = [ana, ben, priv, ...Array(9).fill(null)].map((memberId) => ({ memberId }));
    const [s] = await db
      .insert(selectionsTable)
      .values({ tenantId: tenantA, roundId: round.id, fixtureId, slots })
      .returning();
    sideId = s.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    setSmsTransport(null);
    setEmailTransport(null);
    await purgeTestTenants([tenantA, tenantB]);
  });

  it("an admin flags a member for a season; the squad shows it for the current season", async () => {
    expect(await squadOverseas(ana)).toBe(false);
    const res = await setFlag(adminA, ana, season, true).expect(200);
    expect(res.body).toMatchObject({ memberId: ana, season, overseas: true });
    expect(res.body.setAt).toEqual(expect.any(String));
    expect(await squadOverseas(ana)).toBe(true);
    const detail = await asA(request(app).get(`/api/squad/${ana}`).set("Cookie", adminA)).expect(
      200,
    );
    expect(detail.body.overseas).toBe(true);
    expect(await squadOverseas(ben)).toBe(false);
  });

  it("never carries a flag into another season", async () => {
    // Next season unticked until set; setting it leaves this season alone.
    const rows = () =>
      db.select().from(squadMemberSeasonsTable).where(eq(squadMemberSeasonsTable.memberId, ana));
    expect((await rows()).map((r) => r.season)).toEqual([season]);
    await setFlag(adminA, ana, season + 1, false).expect(200);
    expect(await squadOverseas(ana)).toBe(true);
    await setFlag(adminA, ben, season - 1, true).expect(200);
    expect(await squadOverseas(ben)).toBe(false);
  });

  it("refuses a bad body or season", async () => {
    await setFlag(adminA, ana, season, "yes").expect(400);
    await setFlag(adminA, ana, 1990, true).expect(400);
    await setFlag(adminA, 987_654_321, season, true).expect(404);
  });

  it("captains can't set it", async () => {
    const res = await setFlag(captainA, ben, season, true);
    expect([401, 403]).toContain(res.status);
    expect(await squadOverseas(ben)).toBe(false);
  });

  it("is tenant-scoped", async () => {
    // Another club's admin on this club's host, and on their own host.
    expect((await setFlag(adminB, ben, season, true)).status).toBe(401);
    await request(app)
      .put(`/api/squad/${ben}/seasons/${season}`)
      .set("x-tenant-id", String(tenantB))
      .set("Cookie", adminB)
      .send({ overseas: true })
      .expect(404);
    const leaked = await db
      .select()
      .from(squadMemberSeasonsTable)
      .where(
        and(eq(squadMemberSeasonsTable.memberId, ben), eq(squadMemberSeasonsTable.season, season)),
      );
    expect(leaked).toEqual([]);
    const own = await request(app)
      .get("/api/squad")
      .set("x-tenant-id", String(tenantB))
      .set("Cookie", adminB)
      .expect(200);
    expect(own.body).toEqual([]);
  });

  it("saves the per-grade cap, 0–14, and refuses one out of range", async () => {
    const body = {
      enabled: false,
      smsEnabled: true,
      ...DEFAULT_SCHEDULE,
      selectionRule: "captains_own_grade",
    };
    const put = (overseasCaps?: Record<string, number>) =>
      asA(request(app).put("/api/availability/settings").set("Cookie", adminA)).send({
        ...body,
        ...(overseasCaps ? { overseasCaps } : {}),
      });
    const saved = await put({ "A Grade": 1, " ": 3 }).expect(200);
    expect(saved.body.overseasCaps).toEqual({ "A Grade": 1 });
    // Omitted keeps the stored map.
    expect((await put().expect(200)).body.overseasCaps).toEqual({ "A Grade": 1 });
    await put({ "A Grade": 15 }).expect(400);
    const read = await asA(
      request(app).get("/api/availability/settings").set("Cookie", adminA),
    ).expect(200);
    expect(read.body.overseasCaps).toEqual({ "A Grade": 1 });
  });

  it("the board shows each overseas slot and the count against the cap, live for a draft", async () => {
    await setFlag(adminA, priv, season, true).expect(200);
    const draft = await side();
    expect(draft.state).toBe("draft");
    expect(draft.slots.slice(0, 3).map((s) => s.overseas ?? false)).toEqual([true, false, true]);
    expect(draft.overseas).toEqual({ count: 2, cap: 1, over: true });
  });

  it("finalising over the cap still works and snapshots the flag", async () => {
    const before = await side();
    await asA(request(app).post(`/api/selection/${sideId}/finalise`).set("Cookie", adminA))
      .send({ version: before.version })
      .expect(200);
    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(and(eq(teamListsTable.tenantId, tenantA), eq(teamListsTable.fixtureId, fixtureId)));
    const players = [...list.players].sort((a, b) => a.order - b.order);
    // A private member shows no name publicly, and so no marker.
    expect(players.map((p) => [p.displayName, p.overseas ?? false])).toEqual([
      ["Ana Abroad", true],
      ["Ben Local", false],
      ["Private Player", false],
    ]);
    const [stored] = await db.select().from(selectionsTable).where(eq(selectionsTable.id, sideId));
    expect(stored.slots.slice(0, 3).map((s) => s.overseas ?? false)).toEqual([true, false, true]);

    // The team sheet names everyone, private members included, with the snapshot's OS.
    const sheet = await buildTeamSheet(tenantA, sideId);
    expect(sheet.players.map((p) => [p.name, p.overseas])).toEqual([
      ["Ana Abroad", true],
      ["Ben Local", false],
      ["Pia Private", true],
    ]);
  });

  it("a later squad change never rewrites a finalised side", async () => {
    await setFlag(adminA, ana, season, false).expect(200);
    await setFlag(adminA, ben, season, true).expect(200);
    const final = await side();
    expect(final.state).toBe("final");
    expect(final.slots.slice(0, 3).map((s) => s.overseas ?? false)).toEqual([true, false, true]);
    expect(final.overseas).toEqual({ count: 2, cap: 1, over: true });
    const sheet = await buildTeamSheet(tenantA, sideId);
    expect(sheet.players.map((p) => p.overseas)).toEqual([true, false, true]);
  });

  it("re-opened, the side reads the live flags again", async () => {
    await asA(request(app).post(`/api/selection/${sideId}/reopen`).set("Cookie", adminA)).expect(
      200,
    );
    const draft = await side();
    expect(draft.slots.slice(0, 3).map((s) => s.overseas ?? false)).toEqual([false, true, true]);
    expect(draft.overseas).toEqual({ count: 2, cap: 1, over: true });
  });
});
