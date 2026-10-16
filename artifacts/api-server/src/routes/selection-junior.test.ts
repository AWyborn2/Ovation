import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  squadMembersTable,
  juniorFixturesTable,
  juniorParticipantsTable,
  juniorTeamListsTable,
  juniorShirtNumbersTable,
} from "@workspace/db";
import { buildTeamSheet } from "../lib/team-sheet";
import { SESSION_COOKIE, encodeSession } from "../lib/auth";
import { setEmailTransport } from "../lib/integrations/email";
import { setSmsTransport } from "../lib/integrations/sms";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { pinClockMidWeek } from "../lib/mid-week-clock.test-helpers";
import { perthDayStart } from "../lib/availability-grades";
import { DEFAULT_SCHEDULE, roundWeekendFor, setSendPaceMs } from "../lib/availability-schedule";

/**
 * Junior sides in the Selection Hub: one side per junior fixture (junior PlayHQ
 * sync), seeded from the same team's last junior team list, published to the
 * junior team list with PlayHQ participant ids. A club without availability,
 * so nothing is messaged. Real-DB integration test (needs DATABASE_URL with
 * migrations applied).
 */

const STAMP = Date.now();
// Distinct first names: name matching ignores digits, so "Kid1"/"Kid2" would collide.
const FIRST = ["", "Ava", "Ben", "Cal", "Dan", "Eli"];
const pid = (i: number) =>
  `00000000-0000-4000-8000-${String(STAMP % 1e6).padStart(6, "0")}${String(i).padStart(6, "0")}`;

type BoardBody = {
  availability: boolean;
  selections: {
    id: number;
    version: number;
    fixture: { kind: string; grade: string; id: number };
    slots: { memberId: number | null; gap: { name: string; reason: string } | null }[];
    captainMemberId: number | null;
  }[];
};

describe("Selection Hub junior sides", () => {
  let tenantId = 0;
  let adminCookie = "";
  const m: number[] = [];
  let currentFixture = 0;

  const asAdmin = (r: request.Test) =>
    r.set("Cookie", adminCookie).set("x-tenant-id", String(tenantId));
  const board = async () =>
    (await asAdmin(request(app).get("/api/selection/board?section=junior")).expect(200))
      .body as BoardBody;

  beforeAll(async () => {
    pinClockMidWeek();
    setSendPaceMs(0);
    setSmsTransport(async () => {});
    setEmailTransport(async () => {});

    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `sel-jr-${STAMP}`,
        centralClubId: 7_700_000 + (STAMP % 100_000) * 10,
        name: "Junior Hub CC",
        plan: "pro",
      })
      .returning();
    tenantId = t.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({ tenantId, username: `jr_${STAMP}`, displayName: "Jo Admin", passwordHash: "x" })
      .returning();
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;

    // Juniors 1–4 are PlayHQ participants; 1–3 carry their profile id, 4 matches by
    // name; 5 is on the squad but matches no participant.
    await db.insert(juniorParticipantsTable).values(
      [1, 2, 3, 4].map((i) => ({
        tenantId,
        participantId: pid(i),
        displayName: `${FIRST[i]} Jones`,
      })),
    );
    for (let i = 1; i <= 5; i++) {
      const [row] = await db
        .insert(squadMembersTable)
        .values({
          tenantId,
          firstName: FIRST[i],
          lastName: "Jones",
          section: "junior",
          playhqProfileId: i <= 3 ? pid(i) : null,
        })
        .returning();
      m[i] = row.id;
    }

    const weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    const sat = perthDayStart(weekendDate).getTime();
    const [last, current, other] = await db
      .insert(juniorFixturesTable)
      .values([
        {
          tenantId,
          playhqMatchId: `jr-last-${STAMP}`,
          seasonStartYear: 2026,
          ageGroup: "Year 7",
          teamName: "Hub Year 7 Gold",
          opponentName: "Mandurah Year 7",
          startAt: new Date(sat - 7 * 86_400_000 + 9 * 3_600_000),
          isHome: true,
        },
        {
          tenantId,
          playhqMatchId: `jr-now-${STAMP}`,
          seasonStartYear: 2026,
          ageGroup: "Year 7",
          teamName: "Hub Year 7 Gold",
          opponentName: "Rockingham Year 7",
          startAt: new Date(sat + 9 * 3_600_000),
          isHome: false,
        },
        {
          tenantId,
          playhqMatchId: `jr-grey-${STAMP}`,
          seasonStartYear: 2026,
          ageGroup: "Year 7",
          teamName: "Hub Year 7 Grey",
          opponentName: "Baldivis Year 7",
          startAt: new Date(sat + 9 * 3_600_000),
          isHome: true,
        },
      ])
      .returning();
    currentFixture = current.id;
    await db.insert(juniorShirtNumbersTable).values([
      { tenantId, season: 2026, participantId: pid(1), name: "Ava Jones", number: "12" },
      { tenantId, season: 2026, participantId: pid(4), name: "Dan Jones", number: "9" },
      { tenantId, season: 2026, participantId: pid(2), name: "Ben Jones", number: "5", held: true },
    ]);
    void other;
    // Last week's Gold side: kid 1 captain, kids 2–4.
    await db.insert(juniorTeamListsTable).values({
      tenantId,
      juniorFixtureId: last.id,
      isPublished: true,
      source: "playhq",
      players: [
        { order: 1, participantId: pid(1), role: "C" },
        { order: 2, participantId: pid(2) },
        { order: 3, participantId: pid(3) },
        { order: 4, participantId: pid(4) },
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

  it("drafts one side per junior team, seeding Gold from its last list", async () => {
    const b = await board();
    expect(b.availability).toBe(false);
    expect(b.selections.map((s) => [s.fixture.kind, s.fixture.grade]).sort()).toEqual([
      ["junior", "Hub Year 7 Gold"],
      ["junior", "Hub Year 7 Grey"],
    ]);
    const gold = b.selections.find((s) => s.fixture.grade === "Hub Year 7 Gold")!;
    expect(gold.fixture.id).toBe(currentFixture);
    expect(gold.slots.slice(0, 4).map((s) => s.memberId)).toEqual([m[1], m[2], m[3], m[4]]);
    expect(gold.captainMemberId).toBe(m[1]);
    const grey = b.selections.find((s) => s.fixture.grade === "Hub Year 7 Grey")!;
    expect(grey.slots.every((s) => s.memberId == null)).toBe(true);
  });

  it("finalise publishes participant ids to the junior team list and names the unmatched", async () => {
    let gold = (await board()).selections.find((s) => s.fixture.grade === "Hub Year 7 Gold")!;
    // Put Eli (kid 5, no PlayHQ match) in slot 5.
    const slots = gold.slots.map((s, i) => ({ memberId: i === 4 ? m[5] : s.memberId }));
    await asAdmin(request(app).put("/api/selection/board"))
      .send({
        changes: [
          {
            selectionId: gold.id,
            version: gold.version,
            slots,
            captainMemberId: m[1],
            keeperMemberId: m[2],
          },
        ],
      })
      .expect(200);
    gold = (await board()).selections.find((s) => s.fixture.grade === "Hub Year 7 Gold")!;
    const res = await asAdmin(request(app).post(`/api/selection/${gold.id}/finalise`))
      .send({ version: gold.version })
      .expect(200);
    expect(res.body.unlisted).toEqual(["Eli Jones"]);
    expect(res.body.messaged).toEqual({ selected: 0, deselected: 0, failed: 0 });

    const [list] = await db
      .select()
      .from(juniorTeamListsTable)
      .where(
        and(
          eq(juniorTeamListsTable.tenantId, tenantId),
          eq(juniorTeamListsTable.juniorFixtureId, currentFixture),
        ),
      );
    expect(list.source).toBe("selection");
    expect(list.isPublished).toBe(true);
    expect(list.players).toEqual([
      { order: 1, participantId: pid(1), role: "C" },
      { order: 2, participantId: pid(2), role: "WK" },
      { order: 3, participantId: pid(3) },
      { order: 4, participantId: pid(4) },
    ]);
  });

  it("the admin junior team-list editor refuses a list picked in the Hub (409)", async () => {
    await asAdmin(request(app).put(`/api/juniors/fixtures/${currentFixture}/team-list`))
      .send({ players: [{ order: 1, participantId: pid(1) }], isPublished: true })
      .expect(409);
  });

  it("the finalised junior side's team sheet shows its age group and teams", async () => {
    const gold = (await board()).selections.find((s) => s.fixture.grade === "Hub Year 7 Gold")!;
    const res = await asAdmin(request(app).get(`/api/selection/${gold.id}/team-sheet`)).expect(200);
    expect(res.body).toMatchObject({
      section: "junior",
      grade: "Year 7",
      bowlingRulesSource: null,
    });
  });

  it("the junior team sheet prints numbers by profile id or name, held ones included", async () => {
    const gold = (await board()).selections.find((s) => s.fixture.grade === "Hub Year 7 Gold")!;
    const sheet = await buildTeamSheet(tenantId, gold.id);
    const numberOf = (name: string) => sheet.players.find((p) => p.name === name)?.shirtNumber;
    expect(numberOf("Ava Jones")).toBe("12");
    expect(numberOf("Dan Jones")).toBe("9");
    // Held (not yet confirmed in PlayHQ) still prints for a picked player.
    expect(numberOf("Ben Jones")).toBe("5");
  });
});
