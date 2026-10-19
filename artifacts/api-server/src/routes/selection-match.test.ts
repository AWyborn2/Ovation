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
  squadMembersTable,
  squadMemberParticipantsTable,
  availabilityRoundsTable,
  fixturesTable,
  selectionsTable,
  selectionEventsTable,
  teamListsTable,
  juniorFixturesTable,
  juniorParticipantsTable,
  juniorTeamListsTable,
} from "@workspace/db";
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
import { addDays, perthDayStart } from "../lib/availability-grades";
import { DEFAULT_SCHEDULE, roundWeekendFor, setSendPaceMs } from "../lib/availability-schedule";
import { buildTeamSheet } from "../lib/team-sheet";

/**
 * "Match to squad member" and "Unmatch" in the Selection Hub (ADR-008 §4): a
 * PlayHQ row named only "Private Player" is matched to the member it is, the
 * club remembers the PlayHQ participant, the next PlayHQ sync resolves it on
 * its own, and the team sheet prints the real name. Rights, section, version
 * and closed-round refusals. A club without availability. Real-DB integration
 * test (needs DATABASE_URL with migrations applied).
 */

const STAMP = Date.now();
const guid = (i: number) =>
  `00000000-0000-4000-a000-${String(STAMP % 1e6).padStart(6, "0")}${String(i).padStart(6, "0")}`;
const PRIVATE_1 = guid(1);
const PRIVATE_2 = guid(2);
const JUNIOR_ONLY = guid(3);
const SENIOR_MAPPED = guid(4);

type Slot = {
  memberId: number | null;
  gap: { name: string; reason: string; participantId?: string | null } | null;
};
type Side = {
  id: number;
  version: number;
  state: string;
  fixture: { grade: string };
  slots: Slot[];
};
type Board = {
  selections: Side[];
  participantMatches: { participantId: string; memberId: number; createdBy: string | null }[];
};

describe("Selection Hub: match a Private Player to a squad member", () => {
  let tenantId = 0;
  let adminCookie = "";
  let bCaptainCookie = "";
  let noGradeCaptainCookie = "";
  const m: Record<string, number> = {};
  let pastSideId = 0;

  const as = (cookie: string, r: request.Test) =>
    r.set("Cookie", cookie).set("x-tenant-id", String(tenantId));
  const asAdmin = (r: request.Test) => as(adminCookie, r);
  const board = async (section: "senior" | "junior") =>
    (await asAdmin(request(app).get(`/api/selection/board?section=${section}`)).expect(200))
      .body as Board;
  const side = async (grade: string, section: "senior" | "junior" = "senior") =>
    (await board(section)).selections.find((s) => s.fixture.grade === grade)!;
  const sync = async (s: Side) =>
    (
      await asAdmin(request(app).post(`/api/selection/${s.id}/playhq-sync`))
        .send({ version: s.version })
        .expect(200)
    ).body as Side;
  const match = (cookie: string, s: Side, slot: number, memberId: number, version = s.version) =>
    as(cookie, request(app).post(`/api/selection/${s.id}/match`)).send({
      slot,
      memberId,
      version,
    });

  beforeAll(async () => {
    pinClockMidWeek();
    setSendPaceMs(0);
    setSmsTransport(async () => {});
    setEmailTransport(async () => {});

    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `sel-match-${STAMP}`,
        centralClubId: 7_900_000 + (STAMP % 100_000) * 10,
        name: "Match CC",
        plan: "pro",
      })
      .returning();
    tenantId = t.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({ tenantId, username: `match_${STAMP}`, displayName: "Pat Admin", passwordHash: "x" })
      .returning();
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    const caps = await db
      .insert(captainsTable)
      .values([
        { tenantId, username: `bcap_${STAMP}`, displayName: "B Captain", passwordHash: "x" },
        { tenantId, username: `nocap_${STAMP}`, displayName: "No Grades", passwordHash: "x" },
      ])
      .returning();
    await db
      .insert(captainGradePermissionsTable)
      .values({ captainId: caps[0].id, grade: "B Grade" });
    bCaptainCookie = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({ captainId: caps[0].id, issuedAt: Date.now() })}`;
    noGradeCaptainCookie = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({ captainId: caps[1].id, issuedAt: Date.now() })}`;

    const add = async (
      key: string,
      firstName: string,
      lastName: string,
      extra: Partial<typeof squadMembersTable.$inferInsert> = {},
    ) => {
      const [row] = await db
        .insert(squadMembersTable)
        .values({ tenantId, firstName, lastName, ...extra })
        .returning();
      m[key] = row.id;
    };
    await add("adam", "Adam", "Smith");
    await add("priya", "Priya", "Patel", { isPrivate: true });
    await add("ina", "Ina", "Inactive", { active: false });
    await add("bo", "Bo", "Busy");
    await add("jess", "Jess", "Junior", { section: "junior" });
    // The crosswalk names Adam for a participant on the junior list: a senior record
    // never lands on a junior side.
    await db
      .insert(squadMemberParticipantsTable)
      .values({ tenantId, participantId: SENIOR_MAPPED, memberId: m.adam, createdBy: "seed" });

    const weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    const sat = perthDayStart(weekendDate).getTime();
    const [a] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade: "A Grade",
        opponentName: "Mandurah",
        startAt: new Date(sat + 13 * 3_600_000),
      })
      .returning();
    const [b] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade: "B Grade",
        opponentName: "Rockingham",
        startAt: new Date(sat + 13 * 3_600_000),
      })
      .returning();
    // PlayHQ names Adam and two players it shows only as "Private Player".
    await db.insert(teamListsTable).values({
      tenantId,
      fixtureId: a.id,
      isPublished: true,
      source: "playhq",
      players: [
        { order: 1, displayName: "Adam Smith", role: "C" },
        { order: 2, displayName: "Private Player", participantId: PRIVATE_1 },
        { order: 3, displayName: "Private Player", participantId: PRIVATE_2 },
      ],
    });
    // Bo plays B Grade at the same time as A Grade.
    await db.insert(teamListsTable).values({
      tenantId,
      fixtureId: b.id,
      isPublished: true,
      source: "playhq",
      players: [{ order: 1, displayName: "Bo Busy" }],
    });

    await db.insert(juniorParticipantsTable).values([
      { tenantId, participantId: JUNIOR_ONLY, displayName: "Private Player" },
      { tenantId, participantId: SENIOR_MAPPED, displayName: "Private Player" },
    ]);
    const [jf] = await db
      .insert(juniorFixturesTable)
      .values({
        tenantId,
        playhqMatchId: `match-jr-${STAMP}`,
        seasonStartYear: 2026,
        ageGroup: "Year 8",
        teamName: "Match Year 8",
        opponentName: "Baldivis Year 8",
        startAt: new Date(sat + 9 * 3_600_000),
        isHome: true,
      })
      .returning();
    await db.insert(juniorTeamListsTable).values({
      tenantId,
      juniorFixtureId: jf.id,
      isPublished: true,
      source: "playhq",
      players: [
        { order: 1, participantId: JUNIOR_ONLY },
        { order: 2, participantId: SENIOR_MAPPED },
      ],
    });

    // Last weekend's round, with a side still holding a gap: it is closed.
    const lastWeekend = addDays(weekendDate, -7);
    const [past] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId, weekendDate: lastWeekend })
      .returning();
    const [pf] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade: "A Grade",
        opponentName: "Waroona",
        startAt: new Date(perthDayStart(lastWeekend).getTime() + 13 * 3_600_000),
      })
      .returning();
    const [ps] = await db
      .insert(selectionsTable)
      .values({
        tenantId,
        roundId: past.id,
        fixtureId: pf.id,
        slots: [
          {
            memberId: null,
            gap: { name: "Private Player", reason: "not_on_register", participantId: PRIVATE_2 },
          },
        ],
      })
      .returning();
    pastSideId = ps.id;

    // Load the board (drafts the weekend), then take PlayHQ's sides.
    await sync(await side("A Grade"));
    await sync(await side("B Grade"));
  });

  afterAll(async () => {
    vi.useRealTimers();
    setSmsTransport(null);
    setEmailTransport(null);
    setSendPaceMs(250);
    await purgeTestTenants([tenantId]);
  });

  it("a Private Player row stays a gap carrying its PlayHQ participant id", async () => {
    const a = await side("A Grade");
    expect(a.slots[0].memberId).toBe(m.adam);
    expect(a.slots[1].gap).toEqual({
      name: "Private Player",
      reason: "not_on_register",
      participantId: PRIVATE_1,
    });
    expect(a.slots[2].gap?.participantId).toBe(PRIVATE_2);
  });

  it("refuses a captain without the grade, a stale version, and a slot that isn't a gap", async () => {
    const a = await side("A Grade");
    await match(bCaptainCookie, a, 2, m.priya).expect(403);
    await match(adminCookie, a, 2, m.priya, a.version - 1).expect(409);
    await match(adminCookie, a, 1, m.priya).expect(400);
    await match(adminCookie, a, 4, m.priya).expect(400); // an empty slot, no gap
  });

  it("refuses an inactive, unknown or already-placed member, and one playing elsewhere at the time", async () => {
    const a = await side("A Grade");
    for (const id of [m.ina, 987_654_321, m.adam, m.bo]) {
      const res = await match(adminCookie, a, 2, id);
      expect(res.status).toBe(400);
    }
    const [row] = await db.select().from(selectionsTable).where(eq(selectionsTable.id, a.id));
    expect(row.version).toBe(a.version);
  });

  it("fills the slot, remembers the participant, and logs the match", async () => {
    const a = await side("A Grade");
    const res = await match(adminCookie, a, 2, m.priya).expect(200);
    const after = (res.body as Board).selections.find((s) => s.id === a.id)!;
    expect(after.slots[1].memberId).toBe(m.priya);
    expect(after.version).toBe(a.version + 1);
    expect((res.body as Board).participantMatches).toContainEqual(
      expect.objectContaining({
        participantId: PRIVATE_1,
        memberId: m.priya,
        createdBy: "Pat Admin",
      }),
    );
    const [event] = await db
      .select()
      .from(selectionEventsTable)
      .where(
        and(eq(selectionEventsTable.selectionId, a.id), eq(selectionEventsTable.action, "match")),
      );
    expect(event.detail).toMatchObject({
      slot: 2,
      member: { id: m.priya, name: "Priya Patel" },
      remembered: true,
      participantId: PRIVATE_1,
    });
    expect(event.actorName).toBe("Pat Admin");
  });

  it("the next PlayHQ sync resolves the remembered player on its own", async () => {
    const after = await sync(await side("A Grade"));
    expect(after.slots[1].memberId).toBe(m.priya);
    expect(after.slots[2].gap?.participantId).toBe(PRIVATE_2);
  });

  it("unmatch: forgets the participant (204), then 404; a captain who picks nothing is refused", async () => {
    await as(
      noGradeCaptainCookie,
      request(app).delete(`/api/squad/${m.priya}/participants/${PRIVATE_1}`),
    ).expect(403);
    await asAdmin(request(app).delete(`/api/squad/${m.adam}/participants/${PRIVATE_1}`)).expect(
      404,
    );
    await asAdmin(
      request(app).delete(`/api/squad/${m.priya}/participants/${PRIVATE_1.toUpperCase()}`),
    ).expect(204);
    await asAdmin(request(app).delete(`/api/squad/${m.priya}/participants/${PRIVATE_1}`)).expect(
      404,
    );
    const rows = await db
      .select()
      .from(squadMemberParticipantsTable)
      .where(eq(squadMemberParticipantsTable.participantId, PRIVATE_1));
    expect(rows).toEqual([]);
    const [event] = await db
      .select()
      .from(selectionEventsTable)
      .where(
        and(
          eq(selectionEventsTable.tenantId, tenantId),
          eq(selectionEventsTable.action, "unmatch"),
        ),
      );
    expect(event.roundId).not.toBeNull();
    expect(event.detail).toMatchObject({ member: { id: m.priya }, participantId: PRIVATE_1 });
    // Only later matching changes: the next sync leaves the row a gap again.
    const after = await sync(await side("A Grade"));
    expect(after.slots[1]).toMatchObject({ memberId: null, gap: { participantId: PRIVATE_1 } });
  });

  it("a matched private player prints by real name on the team sheet", async () => {
    const a = await side("A Grade");
    await match(adminCookie, a, 2, m.priya).expect(200);
    const ready = await side("A Grade");
    await asAdmin(request(app).post(`/api/selection/${ready.id}/finalise`))
      .send({ version: ready.version })
      .expect(200);
    const sheet = await buildTeamSheet(tenantId, ready.id);
    expect(sheet.players.map((p) => p.name)).toContain("Priya Patel");
    expect(JSON.stringify(sheet.players)).not.toContain("Private Player");
  });

  it("refuses a finalised side and a closed round", async () => {
    const a = await side("A Grade");
    expect(a.state).toBe("final");
    await match(adminCookie, a, 3, m.bo).expect(409);
    await asAdmin(request(app).post(`/api/selection/${pastSideId}/match`))
      .send({ slot: 1, memberId: m.bo, version: 1 })
      .expect(409);
  });

  it("junior sides: a senior record is refused, and a senior crosswalk row never lands there", async () => {
    const j = await sync(await side("Match Year 8", "junior"));
    // SENIOR_MAPPED is remembered as Adam (senior): the junior side keeps the gap.
    expect(j.slots[1]).toMatchObject({
      memberId: null,
      gap: { reason: "not_on_register", participantId: SENIOR_MAPPED },
    });
    await match(adminCookie, j, 1, m.adam).expect(400);
    await match(adminCookie, j, 1, m.jess).expect(200);
    const juniorBoard = await board("junior");
    expect(juniorBoard.participantMatches.map((x) => x.memberId)).toEqual([m.jess]);
    // The junior's match is reused by the next junior sync.
    const again = await sync(await side("Match Year 8", "junior"));
    expect(again.slots[0].memberId).toBe(m.jess);
  });
});
