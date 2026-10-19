import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  squadMembersTable,
  fixturesTable,
  teamListsTable,
  juniorFixturesTable,
  juniorParticipantsTable,
  juniorTeamListsTable,
} from "@workspace/db";
import { SESSION_COOKIE, encodeSession } from "../lib/auth";
import { setEmailTransport } from "../lib/integrations/email";
import { setSmsTransport } from "../lib/integrations/sms";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { pinClockMidWeek } from "../lib/mid-week-clock.test-helpers";
import { perthDayStart } from "../lib/availability-grades";
import { DEFAULT_SCHEDULE, roundWeekendFor, setSendPaceMs } from "../lib/availability-schedule";

/**
 * "Use PlayHQ team" in the Selection Hub: a draft side is replaced by the side
 * PlayHQ has published for its fixture (senior team list or junior team list,
 * both source "playhq"). A club without availability. Real-DB integration test
 * (needs DATABASE_URL with migrations applied).
 */

const STAMP = Date.now();
const pid = (i: number) =>
  `00000000-0000-4000-9000-${String(STAMP % 1e6).padStart(6, "0")}${String(i).padStart(6, "0")}`;
const SENIOR = ["", "Adam", "Brett", "Chris", "Drew"];
const JUNIOR = ["", "Ava", "Ben", "Cal"];

type Side = {
  id: number;
  version: number;
  fixture: { grade: string };
  playhqPlayers: number | null;
  slots: { memberId: number | null; gap: { name: string; reason: string } | null }[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
};

describe("Selection Hub: use PlayHQ's published side", () => {
  let tenantId = 0;
  let adminCookie = "";
  const s: number[] = [];
  const j: number[] = [];
  let eve = 0;

  const asAdmin = (r: request.Test) =>
    r.set("Cookie", adminCookie).set("x-tenant-id", String(tenantId));
  const sides = async (section: "senior" | "junior") =>
    (await asAdmin(request(app).get(`/api/selection/board?section=${section}`)).expect(200)).body
      .selections as Side[];

  beforeAll(async () => {
    pinClockMidWeek();
    setSendPaceMs(0);
    setSmsTransport(async () => {});
    setEmailTransport(async () => {});

    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `sel-phq-${STAMP}`,
        centralClubId: 7_800_000 + (STAMP % 100_000) * 10,
        name: "PlayHQ Sync CC",
        plan: "pro",
      })
      .returning();
    tenantId = t.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({ tenantId, username: `phq_${STAMP}`, displayName: "Pat Admin", passwordHash: "x" })
      .returning();
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;

    for (let i = 1; i <= 4; i++) {
      const [row] = await db
        .insert(squadMembersTable)
        .values({ tenantId, firstName: SENIOR[i], lastName: "Smith" })
        .returning();
      s[i] = row.id;
    }
    await db.insert(juniorParticipantsTable).values(
      [1, 2, 3].map((i) => ({
        tenantId,
        participantId: pid(i),
        displayName: `${JUNIOR[i]} Lee`,
      })),
    );
    for (let i = 1; i <= 2; i++) {
      const [row] = await db
        .insert(squadMembersTable)
        .values({
          tenantId,
          firstName: JUNIOR[i],
          lastName: "Lee",
          section: "junior",
          playhqProfileId: pid(i),
        })
        .returning();
      j[i] = row.id;
    }
    // Eve is on the junior register only and plays up; Drew is on both registers.
    const [e] = await db
      .insert(squadMembersTable)
      .values({ tenantId, firstName: "Eve", lastName: "Lee", section: "junior" })
      .returning();
    eve = e.id;
    await db
      .insert(squadMembersTable)
      .values({ tenantId, firstName: "Drew", lastName: "Smith", section: "junior" });

    const weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    const sat = perthDayStart(weekendDate).getTime();
    const [fx] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade: "A Grade",
        opponentName: "Mandurah",
        startAt: new Date(sat + 13 * 3_600_000),
      })
      .returning();
    // PlayHQ names Brett (captain), Adam (keeper) and a player not on the squad.
    await db.insert(teamListsTable).values({
      tenantId,
      fixtureId: fx.id,
      isPublished: true,
      source: "playhq",
      players: [
        { order: 1, displayName: "Brett Smith", role: "C" },
        { order: 2, displayName: "Adam Smith", role: "WK" },
        { order: 3, displayName: "Zed Newcomer" },
        { order: 4, displayName: "Eve Lee" },
        { order: 5, displayName: "Drew Smith" },
      ],
    });
    const [jf] = await db
      .insert(juniorFixturesTable)
      .values({
        tenantId,
        playhqMatchId: `phq-jr-${STAMP}`,
        seasonStartYear: 2026,
        ageGroup: "Year 8",
        teamName: "Sync Year 8",
        opponentName: "Baldivis Year 8",
        startAt: new Date(sat + 9 * 3_600_000),
        isHome: true,
      })
      .returning();
    // Junior PlayHQ list: Ben (captain), Ava, and Cal (a participant not on the squad).
    await db.insert(juniorTeamListsTable).values({
      tenantId,
      juniorFixtureId: jf.id,
      isPublished: true,
      source: "playhq",
      players: [
        { order: 1, participantId: pid(2), role: "C" },
        { order: 2, participantId: pid(1) },
        { order: 3, participantId: pid(3) },
      ],
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    setSmsTransport(null);
    setEmailTransport(null);
    setSendPaceMs(250);
    await purgeTestTenants([tenantId]);
  });

  it("flags each side PlayHQ has named, with its size", async () => {
    expect((await sides("senior"))[0].playhqPlayers).toBe(5);
    expect((await sides("junior"))[0].playhqPlayers).toBe(3);
  });

  it("replaces a senior draft with PlayHQ's side, roles included, unknowns as gaps", async () => {
    const side = (await sides("senior"))[0];
    const res = await asAdmin(request(app).post(`/api/selection/${side.id}/playhq-sync`))
      .send({ version: side.version })
      .expect(200);
    const after = res.body as Side;
    expect(after.slots.slice(0, 3).map((x) => x.memberId)).toEqual([s[2], s[1], null]);
    // A junior playing up is placed; a name on both registers is the senior record.
    expect(after.slots[3].memberId).toBe(eve);
    expect(after.slots[4].memberId).toBe(s[4]);
    expect(after.slots[2].gap).toEqual({ name: "Zed Newcomer", reason: "not_on_register" });
    expect(after.captainMemberId).toBe(s[2]);
    expect(after.keeperMemberId).toBe(s[1]);
    expect(after.version).toBe(side.version + 1);
  });

  it("a stale version is refused", async () => {
    const side = (await sides("senior"))[0];
    await asAdmin(request(app).post(`/api/selection/${side.id}/playhq-sync`))
      .send({ version: side.version - 1 })
      .expect(409);
  });

  it("replaces a junior draft from PlayHQ's participant ids", async () => {
    const side = (await sides("junior"))[0];
    const res = await asAdmin(request(app).post(`/api/selection/${side.id}/playhq-sync`))
      .send({ version: side.version })
      .expect(200);
    const after = res.body as Side;
    expect(after.slots.slice(0, 3).map((x) => x.memberId)).toEqual([j[2], j[1], null]);
    // The gap keeps Cal's PlayHQ participant id, for "Match to squad member".
    expect(after.slots[2].gap).toEqual({
      name: "Cal Lee",
      reason: "not_on_register",
      participantId: pid(3),
    });
    expect(after.captainMemberId).toBe(j[2]);
  });
});
