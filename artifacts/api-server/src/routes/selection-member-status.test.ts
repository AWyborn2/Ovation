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
  availabilitySettingsTable,
  availabilityRequestsTable,
  availabilityResponsesTable,
  fixturesTable,
  selectionEventsTable,
  squadMembersTable,
  teamListsTable,
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
import { DEFAULT_SCHEDULE, roundWeekendFor } from "../lib/availability-schedule";
import { defaultTokenExpiry, mintRequestToken } from "../lib/availability-tokens";

/**
 * An answer given in person, recorded in the Selection Hub (ADR-008 §3,
 * `PUT /selection/members/:id/status`): written for every date of the weekend
 * the member is asked about as an admin-set reply, audited against their side
 * or the round, shown as "set by", replaced by the member's own later answer,
 * refused for a past weekend, scoped to the tenant and to the caller's section.
 * The club starts with availability off (no settings row). Real-DB
 * integration test (needs DATABASE_URL with migrations applied).
 */

const STAMP = Date.now();

type Member = {
  id: number;
  status: string;
  note: string | null;
  statusSource: string | null;
  statusSetBy: string | null;
};
type BoardBody = {
  section: string;
  round: { roundId: number } | null;
  selections: { id: number; slots: { memberId: number | null; member: Member | null }[] }[];
  pool: Member[];
  events: {
    selectionId: number | null;
    action: string;
    actorName: string | null;
    detail: Record<string, unknown>;
  }[];
};

describe("PUT /selection/members/:id/status", () => {
  let tenantA = 0;
  let tenantB = 0;
  let adminA = "";
  let adminAId = 0;
  let adminB = "";
  let captainA = "";
  let alice = 0;
  let bob = 0;
  let jun = 0;
  let memberB = 0;
  let weekend = "";
  let sun = "";

  const asA = (r: request.Test) => r.set("x-tenant-id", String(tenantA));
  const put = (cookie: string, memberId: number, body: Record<string, unknown>) =>
    asA(request(app).put(`/api/selection/members/${memberId}/status`).set("Cookie", cookie)).send(
      body,
    );
  const board = async (section: "senior" | "junior" = "senior") =>
    (
      await asA(
        request(app).get(`/api/selection/board?section=${section}`).set("Cookie", adminA),
      ).expect(200)
    ).body as BoardBody;
  const replies = (memberId: number) =>
    db
      .select()
      .from(availabilityResponsesTable)
      .where(
        and(
          eq(availabilityResponsesTable.tenantId, tenantA),
          eq(availabilityResponsesTable.memberId, memberId),
        ),
      );
  const events = (memberId: number) =>
    db
      .select()
      .from(selectionEventsTable)
      .where(
        and(
          eq(selectionEventsTable.tenantId, tenantA),
          eq(selectionEventsTable.action, "status_set"),
        ),
      )
      .then((rows) => rows.filter((e) => e.detail.memberId === memberId));

  beforeAll(async () => {
    pinClockMidWeek();
    setSmsTransport(async () => {});
    setEmailTransport(async () => {});
    const tenants = await db
      .insert(tenantsTable)
      .values([
        {
          slug: `sel-status-a-${STAMP}`,
          centralClubId: 7_700_000 + (STAMP % 100_000) * 10,
          name: "Status A",
          plan: "pilot",
        },
        {
          slug: `sel-status-b-${STAMP}`,
          centralClubId: 7_700_001 + (STAMP % 100_000) * 10,
          name: "Status B",
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
          username: `st_a_${STAMP}`,
          displayName: "Sue Admin",
          passwordHash: "x",
        },
        {
          tenantId: tenantB,
          username: `st_b_${STAMP}`,
          displayName: "Bea Admin",
          passwordHash: "x",
        },
      ])
      .returning();
    adminAId = admins[0].id;
    adminA = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[0].id, issuedAt: Date.now() })}`;
    adminB = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[1].id, issuedAt: Date.now() })}`;
    const [cap] = await db
      .insert(captainsTable)
      .values({
        tenantId: tenantA,
        username: `st_cap_${STAMP}`,
        displayName: "Cal Captain",
        passwordHash: "x",
      })
      .returning();
    await db.insert(captainGradePermissionsTable).values({ captainId: cap.id, grade: "A Grade" });
    captainA = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({ captainId: cap.id, issuedAt: Date.now() })}`;

    const members = await db
      .insert(squadMembersTable)
      .values([
        { tenantId: tenantA, firstName: "Alice", lastName: "Able" },
        { tenantId: tenantA, firstName: "Bob", lastName: "Baker" },
        {
          tenantId: tenantA,
          firstName: "Jun",
          lastName: "Ior",
          section: "junior",
          dateOfBirth: "2013-05-01",
        },
        { tenantId: tenantB, firstName: "Ben", lastName: "Other" },
      ])
      .returning();
    [alice, bob, jun, memberB] = members.map((m) => m.id);

    weekend = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    sun = addDays(weekend, 1);
    const sat = perthDayStart(weekend).getTime();
    const [last] = await db
      .insert(fixturesTable)
      .values([
        {
          tenantId: tenantA,
          grade: "A Grade",
          opponentName: "Mandurah",
          startAt: new Date(sat - 7 * 86_400_000 + 13 * 3_600_000),
        },
        {
          tenantId: tenantA,
          grade: "A Grade",
          opponentName: "Rockingham",
          startAt: new Date(sat + 13 * 3_600_000),
        },
        {
          tenantId: tenantA,
          grade: "Under 15",
          opponentName: "Falcons",
          startAt: new Date(sat + 86_400_000 + 9 * 3_600_000),
        },
      ])
      .returning();
    // Last week's A Grade side was Alice: this weekend's draft starts from it.
    await db.insert(teamListsTable).values({
      tenantId: tenantA,
      fixtureId: last.id,
      isPublished: true,
      source: "admin",
      players: [{ order: 1, displayName: "Alice Able" }],
    });
    // The board drafts the weekend's sides (availability off).
    const b = await board();
    expect(b.selections).toHaveLength(1);
    expect(b.selections[0].slots[0].memberId).toBe(alice);
  });

  afterAll(async () => {
    vi.useRealTimers();
    setSmsTransport(null);
    setEmailTransport(null);
    await purgeTestTenants([tenantA, tenantB]);
  });

  it("records a pool member's answer with availability off, set by the admin", async () => {
    const res = await put(adminA, bob, {
      weekend,
      status: "yes",
      note: "  told me at training ",
    }).expect(200);
    const b = res.body as BoardBody;
    expect(b.section).toBe("senior");
    expect(b.pool.find((m) => m.id === bob)).toMatchObject({
      status: "yes",
      note: "told me at training",
      statusSource: "admin",
      statusSetBy: "Sue Admin",
    });
    const rows = await replies(bob);
    expect(rows.map((r) => r.date)).toEqual([weekend]);
    expect(rows[0]).toMatchObject({
      status: "yes",
      source: "admin",
      setByAdminId: adminAId,
      setByName: "Sue Admin",
      respondedBySlot: null,
    });
    // Bob is in no side: the event is the round's own, and the board lists it.
    const [e] = await events(bob);
    expect(e.selectionId).toBeNull();
    expect(e.roundId).toBe(b.round!.roundId);
    expect(e).toMatchObject({ actorKind: "admin", actorName: "Sue Admin" });
    expect(e.detail).toMatchObject({ section: "senior", status: "yes", name: "Bob Baker" });
    expect(
      b.events.some(
        (ev) => ev.action === "status_set" && ev.selectionId === null && ev.detail.memberId === bob,
      ),
    ).toBe(true);
    // The junior board doesn't carry a senior member's round event.
    const jb = await board("junior");
    expect(jb.events.some((ev) => ev.detail.memberId === bob)).toBe(false);
  });

  it("logs against each side the member is in", async () => {
    const res = await put(adminA, alice, { weekend, status: "maybe" }).expect(200);
    const b = res.body as BoardBody;
    const side = b.selections[0];
    expect(side.slots[0].member).toMatchObject({
      status: "maybe",
      statusSource: "admin",
      statusSetBy: "Sue Admin",
    });
    const [e] = await events(alice);
    expect(e.selectionId).toBe(side.id);
    expect(b.events.some((ev) => ev.action === "status_set" && ev.selectionId === side.id)).toBe(
      true,
    );
  });

  it("the member's own later answer from their link replaces it", async () => {
    const roundId = (await board()).round!.roundId;
    const [req] = await db
      .insert(availabilityRequestsTable)
      .values({ tenantId: tenantA, roundId, memberId: alice, recipientSlot: "account" })
      .returning();
    const { token } = await mintRequestToken({
      tenantId: tenantA,
      requestId: req.id,
      expiresAt: defaultTokenExpiry(weekend),
    });
    await asA(
      request(app)
        .put(`/api/availability/respond/${token}`)
        .send({ answers: [{ date: weekend, status: "no" }] }),
    ).expect(200);
    const [row] = await replies(alice);
    expect(row).toMatchObject({
      status: "no",
      source: "member",
      setByAdminId: null,
      setByName: null,
      respondedBySlot: "account",
    });
    const slot = (await board()).selections[0].slots[0].member;
    expect(slot).toMatchObject({ status: "no", statusSource: "member", statusSetBy: null });
  });

  it("a junior's answer goes to their own dates and returns the junior board", async () => {
    const res = await put(adminA, jun, { weekend, status: "no" }).expect(200);
    expect((res.body as BoardBody).section).toBe("junior");
    expect((await replies(jun)).map((r) => r.date)).toEqual([sun]);
  });

  it("refuses a past weekend, a weekday and an unknown status, writing nothing", async () => {
    const before = (await replies(bob)).length;
    const past = await put(adminA, bob, { weekend: addDays(weekend, -7), status: "no" }).expect(
      409,
    );
    expect(past.body.code).toBe("round_closed");
    await put(adminA, bob, { weekend: addDays(weekend, 1), status: "no" }).expect(400);
    await put(adminA, bob, { weekend, status: "away" }).expect(400);
    expect(await replies(bob)).toHaveLength(before);
  });

  it("is tenant-scoped: another club's member, or another club's admin, is refused", async () => {
    await put(adminA, memberB, { weekend, status: "yes" }).expect(404);
    await put(adminB, bob, { weekend, status: "no" }).expect(401);
    const res = await request(app)
      .put(`/api/selection/members/${bob}/status`)
      .set("x-tenant-id", String(tenantB))
      .set("Cookie", adminB)
      .send({ weekend, status: "no" });
    expect(res.status).toBe(404);
    expect((await replies(bob))[0].status).toBe("yes");
  });

  it("captains record answers in their own section only, and not at an admins-only club", async () => {
    await db
      .insert(availabilitySettingsTable)
      .values({ tenantId: tenantA, selectionRule: "captains_own_grade", enabled: false });
    const res = await put(captainA, bob, { weekend, status: "maybe" }).expect(200);
    expect((res.body as BoardBody).pool.find((m) => m.id === bob)).toMatchObject({
      status: "maybe",
      statusSource: "admin",
      statusSetBy: "Cal Captain",
    });
    expect((await replies(bob))[0]).toMatchObject({ setByAdminId: null, setByName: "Cal Captain" });
    await put(captainA, jun, { weekend, status: "yes" }).expect(403);

    await db
      .update(availabilitySettingsTable)
      .set({ selectionRule: "admins_only" })
      .where(eq(availabilitySettingsTable.tenantId, tenantA));
    await put(captainA, bob, { weekend, status: "no" }).expect(403);
    expect((await replies(bob))[0].status).toBe("maybe");
  });
});
