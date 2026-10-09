import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  captainsTable,
  captainGradePermissionsTable,
  squadMembersTable,
  availabilitySettingsTable,
  availabilityRoundsTable,
  availabilityRequestsTable,
  availabilityResponsesTable,
  fixturesTable,
  notificationsTable,
  selectionsTable,
  selectionEventsTable,
  teamListsTable,
  matchDisplaySettingsTable,
  type SelectionRule,
  type SelectionSlot,
} from "@workspace/db";
import {
  SESSION_COOKIE,
  CAPTAIN_SESSION_COOKIE,
  encodeSession,
  encodeCaptainSession,
} from "../lib/auth";
import { setEmailTransport, type EmailMessage } from "../lib/integrations/email";
import { setSmsTransport, type SmsMessage } from "../lib/integrations/sms";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { perthDayStart } from "../lib/availability-grades";
import { DEFAULT_SCHEDULE, roundWeekendFor, setSendPaceMs } from "../lib/availability-schedule";
import { normaliseGrade, selectionRight, withdrawFromSelection } from "../lib/selection-board";

/**
 * The Selection Hub API (plan 2026-10-06-002 U7; R19–R39, AE3–AE5, AE7–AE9,
 * KTD6, KTD8, KTD9). Real-DB integration test (needs DATABASE_URL with
 * migrations applied); SMS and email go to in-process fakes, nothing is sent.
 *
 * Tenant A has A, B and C Grade sides plus an Under 15 side for the current
 * round's Saturday. Every test starts from the same drafts (reset in
 * `beforeEach`): A Grade m1–m10 with one open slot (captain m1, keeper m2),
 * B Grade m11–m21 (full, captain m11), C Grade m22–m27 then open slots.
 * m28–m30 and an under-18 senior wait in the pool; m30 said No.
 */

const STAMP = Date.now();
const EMAIL = (i: number) => `sel${i}.${STAMP}@example.test`;
const MOBILE = (i: number) =>
  `0412 ${String(100 + i).padStart(3, "0")} ${String(STAMP % 1000).padStart(3, "0")}`;

type Change = {
  selectionId: number;
  version: number;
  slots: { memberId: number | null; gap?: SelectionSlot["gap"] | null }[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
};

type SideBody = {
  id: number;
  state: string;
  version: number;
  captainMemberId: number | null;
  keeperMemberId: number | null;
  canEdit: boolean;
  canFinalise: boolean;
  readOnlyReason: string | null;
  fixture: { grade: string };
  slots: { memberId: number | null; gap: unknown; member: { id: number; status: string } | null }[];
  warnings: {
    filled: number;
    open: number;
    twelfth: boolean;
    saidNo: number;
    noCaptain: boolean;
    noKeeper: boolean;
  };
};

describe("Selection Hub API", () => {
  let tenantA: number;
  let roundId: number;
  let weekendDate: string;
  const fixture: Record<"A" | "B" | "C" | "U15", number> = { A: 0, B: 0, C: 0, U15: 0 };
  const sel: Record<"A" | "B" | "C" | "U15", number> = { A: 0, B: 0, C: 0, U15: 0 };
  const m: number[] = []; // m[1]..m[30]
  let under18: number;
  let junior: number;
  let adminCookie: string;
  let captainCookie: string;

  let sms: SmsMessage[] = [];
  let email: EmailMessage[] = [];
  const emailsTo = (i: number) => email.filter((e) => e.to === EMAIL(i));

  const asAdmin = (r: request.Test) =>
    r.set("Cookie", adminCookie).set("x-tenant-id", String(tenantA));
  const asCaptain = (r: request.Test) =>
    r.set("Cookie", captainCookie).set("x-tenant-id", String(tenantA));

  const board = async (who: typeof asAdmin, section = "senior") =>
    (await who(request(app).get(`/api/selection/board?section=${section}`)).expect(200)).body as {
      selections: SideBody[];
      pool: { id: number; status: string; junior: boolean; displayName: string }[];
      events: { selectionId: number; action: string; detail: Record<string, unknown> }[];
      round: { roundId: number; counts: { no: number; total: number } } | null;
      actor: { kind: string; canRemind: boolean };
    };

  const loadSel = async (id: number) =>
    (await db.select().from(selectionsTable).where(eq(selectionsTable.id, id)))[0];
  /** The finalise body: the side's version as it stands now. */
  const ver = async (id: number) => ({ version: (await loadSel(id)).version });
  const teamListOf = async (fixtureId: number) =>
    (
      await db
        .select()
        .from(teamListsTable)
        .where(and(eq(teamListsTable.tenantId, tenantA), eq(teamListsTable.fixtureId, fixtureId)))
    )[0];

  /** A change for a side as it stands now, with `edit` applied to its member ids. */
  const changeFor = async (
    id: number,
    edit: (ids: (number | null)[]) => (number | null)[],
    roles?: { captain?: number | null; keeper?: number | null },
  ): Promise<Change> => {
    const row = await loadSel(id);
    const ids = edit(row.slots.map((s) => s.memberId));
    return {
      selectionId: id,
      version: row.version,
      slots: ids.map((memberId) => ({ memberId })),
      captainMemberId: roles && "captain" in roles ? roles.captain! : row.captainMemberId,
      keeperMemberId: roles && "keeper" in roles ? roles.keeper! : row.keeperMemberId,
    };
  };

  const put = (who: typeof asAdmin, changes: Change[]) =>
    who(request(app).put("/api/selection/board")).send({ changes });

  const setRule = async (rule: SelectionRule) => {
    await db
      .update(availabilitySettingsTable)
      .set({ selectionRule: rule })
      .where(eq(availabilitySettingsTable.tenantId, tenantA));
  };

  const pad = (ids: (number | null)[], size = 12) => [
    ...ids,
    ...Array(size - ids.length).fill(null),
  ];

  beforeAll(async () => {
    setSendPaceMs(0);
    process.env.PLATFORM_BASE_DOMAIN = "ovation.test";
    setSmsTransport(async (msg) => {
      sms.push(msg);
    });
    setEmailTransport(async (msg) => {
      email.push(msg);
    });

    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `sel-a-${STAMP}`,
        centralClubId: 7_500_000 + (STAMP % 100_000) * 10,
        name: "Selection A CC",
        plan: "pilot",
      })
      .returning();
    tenantA = t.id;
    await db.insert(availabilitySettingsTable).values({ tenantId: tenantA });

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantA,
        username: `sel_${STAMP}`,
        displayName: "Ada Admin",
        passwordHash: "x",
      })
      .returning();
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    const [cap] = await db
      .insert(captainsTable)
      .values({
        tenantId: tenantA,
        username: "bskip",
        displayName: "Bea Captain",
        passwordHash: "x",
      })
      .returning();
    // Stored as "B" to prove "B" and "B Grade" are one grade.
    await db.insert(captainGradePermissionsTable).values({ captainId: cap.id, grade: "B" });
    captainCookie = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({ captainId: cap.id, issuedAt: Date.now() })}`;

    weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    const sat = perthDayStart(weekendDate).getTime();
    const [round] = await db
      .insert(availabilityRoundsTable)
      .values({
        tenantId: tenantA,
        weekendDate,
        sendStartedAt: new Date(),
        sendCompletedAt: new Date(),
      })
      .returning();
    roundId = round.id;

    const fx = await db
      .insert(fixturesTable)
      .values([
        {
          tenantId: tenantA,
          grade: "A Grade",
          opponentName: "Mandurah",
          venue: "Halls Head Oval",
          startAt: new Date(sat + 13 * 3_600_000),
        },
        {
          tenantId: tenantA,
          grade: "B Grade",
          opponentName: "Rockingham",
          startAt: new Date(sat + 13 * 3_600_000),
        },
        {
          tenantId: tenantA,
          grade: "C Grade",
          opponentName: "Baldivis",
          startAt: new Date(sat + 13 * 3_600_000),
        },
        {
          tenantId: tenantA,
          grade: "Under 15",
          opponentName: "Pinjarra",
          startAt: new Date(sat + 8 * 3_600_000),
        },
      ])
      .returning();
    [fixture.A, fixture.B, fixture.C, fixture.U15] = fx.map((f) => f.id);

    for (let i = 1; i <= 30; i++) {
      const [row] = await db
        .insert(squadMembersTable)
        .values({
          tenantId: tenantA,
          firstName: `P${i}`,
          lastName: `Member`,
          dateOfBirth: "1995-01-01",
          accountHolderName: `P${i} Member`,
          accountHolderEmail: EMAIL(i),
          accountHolderMobile: MOBILE(i),
          // m1 links to a register player; m3 only to a fill-in id (never published, R7).
          linkedPlayerId: i === 1 ? 501 : i === 3 ? 95_000 : null,
        })
        .returning();
      m[i] = row.id;
    }
    const [u18] = await db
      .insert(squadMembersTable)
      .values({ tenantId: tenantA, firstName: "Young", lastName: "Gun", dateOfBirth: "2010-06-01" })
      .returning();
    under18 = u18.id;
    const [jr] = await db
      .insert(squadMembersTable)
      .values({
        tenantId: tenantA,
        firstName: "Junior",
        lastName: "Jones",
        section: "junior",
        dateOfBirth: "2013-06-01",
        guardian1Name: "Gail",
        guardian1Email: `gail.${STAMP}@example.test`,
      })
      .returning();
    junior = jr.id;

    // m30 said No; m3 said Yes. (m28, m29 and the junior are asked in `beforeEach`.)
    await db.insert(availabilityResponsesTable).values([
      {
        tenantId: tenantA,
        roundId,
        memberId: m[30],
        date: weekendDate,
        status: "no",
        respondedBySlot: "account",
        note: "Away at a wedding",
      },
      {
        tenantId: tenantA,
        roundId,
        memberId: m[3],
        date: weekendDate,
        status: "yes",
        respondedBySlot: "account",
      },
    ]);
  });

  beforeEach(async () => {
    await db
      .delete(matchDisplaySettingsTable)
      .where(eq(matchDisplaySettingsTable.tenantId, tenantA));
    await db.delete(selectionsTable).where(eq(selectionsTable.tenantId, tenantA));
    await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, tenantA));
    await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantA));
    // Finalising creates request rows for the members it messages; start each
    // test with only the members asked this round.
    await db
      .delete(availabilityRequestsTable)
      .where(eq(availabilityRequestsTable.tenantId, tenantA));
    await db.insert(availabilityRequestsTable).values([
      { tenantId: tenantA, roundId, memberId: m[28], recipientSlot: "account" },
      { tenantId: tenantA, roundId, memberId: m[29], recipientSlot: "account" },
      { tenantId: tenantA, roundId, memberId: m[30], recipientSlot: "account" },
      { tenantId: tenantA, roundId, memberId: junior, recipientSlot: "guardian1" },
    ]);
    await setRule("captains_own_grade");
    const side = (ids: (number | null)[]) => pad(ids).map((memberId) => ({ memberId }));
    const rows = await db
      .insert(selectionsTable)
      .values([
        {
          tenantId: tenantA,
          roundId,
          fixtureId: fixture.A,
          slots: side(m.slice(1, 11)),
          captainMemberId: m[1],
          keeperMemberId: m[2],
        },
        {
          tenantId: tenantA,
          roundId,
          fixtureId: fixture.B,
          slots: side(m.slice(11, 22)),
          captainMemberId: m[11],
        },
        { tenantId: tenantA, roundId, fixtureId: fixture.C, slots: side(m.slice(22, 28)) },
        { tenantId: tenantA, roundId, fixtureId: fixture.U15, slots: side([]) },
      ])
      .returning({ id: selectionsTable.id });
    [sel.A, sel.B, sel.C, sel.U15] = rows.map((r) => r.id);
    sms = [];
    email = [];
  });

  afterAll(async () => {
    setSmsTransport(null);
    setEmailTransport(null);
    setSendPaceMs(250);
    await purgeTestTenants([tenantA]);
  });

  describe("edit rights (KTD9)", () => {
    it('normalises grades so "B", "b grade" and "B Grade" are one grade', () => {
      expect(normaliseGrade("B Grade")).toBe("b");
      expect(normaliseGrade("  b   GRADE ")).toBe("b");
      expect(normaliseGrade("B")).toBe("b");
      expect(normaliseGrade("Under 15")).toBe("under 15");
    });

    it("admins always; captains by rule", () => {
      const admin = { kind: "admin" as const, id: 1, name: "A" };
      const cap = { kind: "captain" as const, id: 2, name: "C", grades: ["B"] };
      expect(selectionRight(admin, "admins_only", "A Grade").allowed).toBe(true);
      expect(selectionRight(cap, "captains_own_grade", "B Grade").allowed).toBe(true);
      expect(selectionRight(cap, "captains_own_grade", "A Grade").allowed).toBe(false);
      expect(selectionRight(cap, "captains_all_grades", "A Grade").allowed).toBe(true);
      expect(selectionRight(cap, "admins_only", "B Grade").allowed).toBe(false);
    });
  });

  it("requires an admin or captain session", async () => {
    await request(app).get("/api/selection/board").set("x-tenant-id", String(tenantA)).expect(401);
  });

  it("GET shows the section's sides, a pool of unplaced active members and the round", async () => {
    const b = await board(asAdmin);
    expect(b.selections.map((s) => s.fixture.grade)).toEqual(["A Grade", "B Grade", "C Grade"]);
    const poolIds = b.pool.map((p) => p.id);
    expect(poolIds).toEqual(expect.arrayContaining([m[28], m[29], m[30], under18]));
    expect(poolIds).not.toContain(m[1]);
    expect(poolIds).not.toContain(junior);
    expect(b.pool.find((p) => p.id === m[30])?.status).toBe("no");
    expect(b.pool.find((p) => p.id === under18)?.junior).toBe(true);
    expect(b.pool.find((p) => p.id === m[28])?.junior).toBe(false);
    expect(b.round?.roundId).toBe(roundId);
    // Counts cover the senior section only: m28, m29, m30 and m3 were asked or answered.
    expect(b.round?.counts.total).toBe(4);
    expect(b.round?.counts.no).toBe(1);
    const a = b.selections.find((s) => s.id === sel.A)!;
    expect(a.slots).toHaveLength(12);
    expect(a.warnings).toMatchObject({
      filled: 10,
      open: 1,
      twelfth: false,
      saidNo: 0,
      noCaptain: false,
    });
    expect(a.slots.find((s) => s.memberId === m[3])?.member?.status).toBe("yes");

    const jb = await board(asAdmin, "junior");
    expect(jb.selections.map((s) => s.fixture.grade)).toEqual(["Under 15"]);
    expect(jb.pool.map((p) => p.id)).toEqual([junior]);
  });

  it("uses configured grade order for both roles and after a save, with seniority fallback", async () => {
    await db
      .insert(matchDisplaySettingsTable)
      .values({ tenantId: tenantA, gradeOrder: ["C Grade"] });
    for (const who of [asAdmin, asCaptain]) {
      expect((await board(who)).selections.map((s) => s.fixture.grade)).toEqual([
        "C Grade",
        "A Grade",
        "B Grade",
      ]);
    }
    const saved = await put(asAdmin, [await changeFor(sel.A, (ids) => ids)]);
    expect(saved.status).toBe(200);
    expect(saved.body.selections.map((s: SideBody) => s.fixture.grade)).toEqual([
      "C Grade",
      "A Grade",
      "B Grade",
    ]);
    // A settings change is picked up by the next board load, without restarting.
    await db
      .update(matchDisplaySettingsTable)
      .set({ gradeOrder: ["B Grade", "A Grade"] })
      .where(eq(matchDisplaySettingsTable.tenantId, tenantA));
    expect((await board(asCaptain)).selections.map((s) => s.fixture.grade)).toEqual([
      "B Grade",
      "A Grade",
      "C Grade",
    ]);
  });

  it("exposes linked statistics IDs rather than squad IDs, but hides private and junior links", async () => {
    const get = async () =>
      (await asCaptain(request(app).get("/api/selection/board?section=senior")).expect(200)).body;
    const initial = await get();
    const linked = initial.selections
      .flatMap((s: SideBody) => s.slots)
      .find((s: { memberId: number }) => s.memberId === m[1]).member;
    expect(linked.linkedPlayerId).toBe(501);
    expect(linked.linkedPlayerId).not.toBe(linked.id);
    await db
      .update(squadMembersTable)
      .set({ isPrivate: true })
      .where(eq(squadMembersTable.id, m[1]));
    await db
      .update(squadMembersTable)
      .set({ linkedPlayerId: 95_001 })
      .where(eq(squadMembersTable.id, junior));
    try {
      const hidden = await get();
      expect(
        hidden.selections
          .flatMap((s: SideBody) => s.slots)
          .find((s: { memberId: number }) => s.memberId === m[1]).member.linkedPlayerId,
      ).toBeNull();
      const jr = (
        await asCaptain(request(app).get("/api/selection/board?section=junior")).expect(200)
      ).body;
      expect(jr.pool.find((p: { id: number }) => p.id === junior).linkedPlayerId).toBeNull();
    } finally {
      await db
        .update(squadMembersTable)
        .set({ isPrivate: false })
        .where(eq(squadMembersTable.id, m[1]));
      await db
        .update(squadMembersTable)
        .set({ linkedPlayerId: null })
        .where(eq(squadMembersTable.id, junior));
    }
  });

  it("more than 12 slots, too few, or a member twice → 400 and nothing written", async () => {
    const thirteen = await changeFor(sel.C, (ids) => [...ids, m[28]]);
    expect((await put(asAdmin, [thirteen])).status).toBe(400);
    const ten = await changeFor(sel.C, (ids) => ids.slice(0, 10));
    expect((await put(asAdmin, [ten])).status).toBe(400);

    // m11 is in B Grade, which the save doesn't change.
    const dupAcross = await changeFor(sel.A, (ids) => [...ids.slice(0, 10), m[11], ids[11]]);
    expect((await put(asAdmin, [dupAcross])).status).toBe(400);

    const dupWithin = await changeFor(sel.A, (ids) => [...ids.slice(0, 10), m[1], ids[11]]);
    expect((await put(asAdmin, [dupWithin])).status).toBe(400);

    expect((await loadSel(sel.A)).version).toBe(1);
    expect((await loadSel(sel.C)).version).toBe(1);
    const events = await db
      .select()
      .from(selectionEventsTable)
      .where(eq(selectionEventsTable.tenantId, tenantA));
    expect(events).toHaveLength(0);
  });

  describe("the 12th player", () => {
    /** A Grade with m28 as 12th player (slot 12), saved through the API. */
    const withTwelfth = async () => {
      const a = await changeFor(sel.A, (ids) => [...ids.slice(0, 11), m[28]]);
      expect((await put(asAdmin, [a])).status).toBe(200);
    };

    it("a side saved with 11 slots (before the 12th) reads and saves as 12 with an empty 12th", async () => {
      const legacy = pad(m.slice(22, 28), 11).map((memberId) => ({ memberId }));
      await db.update(selectionsTable).set({ slots: legacy }).where(eq(selectionsTable.id, sel.C));
      const c = (await board(asAdmin)).selections.find((s) => s.id === sel.C)!;
      expect(c.slots).toHaveLength(12);
      expect(c.slots[11]).toMatchObject({ memberId: null, member: null });
      expect(c.warnings).toMatchObject({ filled: 6, open: 5, twelfth: false });

      // An older client's 11-slot save is accepted and stored as 12.
      const old = await changeFor(sel.C, (ids) => [...ids.slice(0, 6), m[28], ...ids.slice(7)]);
      expect(old.slots).toHaveLength(11);
      expect((await put(asAdmin, [old])).status).toBe(200);
      const row = await loadSel(sel.C);
      expect(row.slots).toHaveLength(12);
      expect(row.slots[6].memberId).toBe(m[28]);
      expect(row.slots[11]).toEqual({ memberId: null });
    });

    it("an empty 12th is not an open slot; a filled one counts as +12th, not in the XI", async () => {
      const full = (await board(asAdmin)).selections.find((s) => s.id === sel.B)!;
      expect(full.warnings).toMatchObject({ filled: 11, open: 0, twelfth: false });
      const b = await changeFor(sel.B, (ids) => [...ids.slice(0, 11), m[28]]);
      const res = await put(asAdmin, [b]);
      expect(res.status).toBe(200);
      const side = (res.body.selections as SideBody[]).find((s) => s.id === sel.B)!;
      expect(side.warnings).toMatchObject({ filled: 11, open: 0, twelfth: true });
    });

    it("a captain or keeper moved to 12th loses the role, logged as moved to 12th", async () => {
      // m1 (captain) to slot 12, m28 into their XI slot; the client still names m1 captain.
      const a = await changeFor(sel.A, (ids) => [m[28], ...ids.slice(1, 11), m[1]]);
      const res = await put(asAdmin, [a]);
      expect(res.status).toBe(200);
      const row = await loadSel(sel.A);
      expect(row.slots[11].memberId).toBe(m[1]);
      expect(row.captainMemberId).toBeNull();
      expect(row.keeperMemberId).toBe(m[2]);
      const [event] = await db
        .select()
        .from(selectionEventsTable)
        .where(
          and(
            eq(selectionEventsTable.selectionId, sel.A),
            eq(selectionEventsTable.action, "update"),
          ),
        );
      expect(event.detail.rolesCleared).toEqual([
        { role: "captain", memberId: m[1], name: "P1 Member", twelfth: true },
      ]);

      // Naming the 12th as keeper clears it too.
      const k = await changeFor(sel.A, (ids) => ids, { keeper: m[1] });
      expect((await put(asAdmin, [k])).status).toBe(200);
      expect((await loadSel(sel.A)).keeperMemberId).toBeNull();
    });

    it("finalise publishes the 12th as order 12 and tells them they're 12th player", async () => {
      await withTwelfth();
      const res = await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
        .send(await ver(sel.A))
        .expect(200);
      expect(res.body.messaged).toEqual({ selected: 11, deselected: 0, failed: 0 });
      const list = await teamListOf(fixture.A);
      expect(list.players).toHaveLength(11);
      // A Grade's XI has an open slot: the XI is 1–10 and the 12th stays order 12.
      expect(list.players.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
      expect(list.players[10]).toEqual({ order: 12, displayName: "P28 Member" });
      expect(emailsTo(28)).toHaveLength(1);
      expect(emailsTo(28)[0].text).toMatch(/selected as 12th player for A Grade v Mandurah/);
      expect(emailsTo(1)[0].text).not.toMatch(/12th/);
      const toTwelfth = sms.filter((x) => x.body.includes("12th player"));
      expect(toTwelfth).toHaveLength(1);

      // A withdrawal from the XI renumbers it and leaves the 12th at order 12.
      await withdrawFromSelection(tenantA, m[2], roundId, {
        kind: "player",
        id: null,
        name: null,
      });
      const after = await teamListOf(fixture.A);
      expect(after.players.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 12]);
    });
  });

  it("moving a C Grade player into A Grade's open slot updates both sides in one save (AE3)", async () => {
    const a = await changeFor(sel.A, (ids) => [...ids.slice(0, 10), m[22], ids[11]]);
    const c = await changeFor(sel.C, (ids) => [null, ...ids.slice(1)]);
    const res = await put(asAdmin, [a, c]);
    expect(res.status).toBe(200);
    const [rowA, rowC] = [await loadSel(sel.A), await loadSel(sel.C)];
    expect(rowA.slots[10].memberId).toBe(m[22]);
    expect(rowC.slots[0].memberId).toBeNull();
    expect([rowA.version, rowC.version]).toEqual([2, 2]);
    const events = await db
      .select()
      .from(selectionEventsTable)
      .where(eq(selectionEventsTable.tenantId, tenantA));
    expect(events.map((e) => [e.selectionId, e.action, e.actorKind, e.actorName]).sort()).toEqual(
      [
        [sel.A, "update", "admin", "Ada Admin"],
        [sel.C, "update", "admin", "Ada Admin"],
      ].sort(),
    );
    const added = events.find((e) => e.selectionId === sel.A)!.detail.added as { id: number }[];
    expect(added.map((x) => x.id)).toEqual([m[22]]);
    // The response is the updated board.
    expect((res.body.selections as SideBody[]).find((s) => s.id === sel.A)?.version).toBe(2);
  });

  it("a member who said No can be placed and stays flagged (AE4)", async () => {
    const a = await changeFor(sel.A, (ids) => [...ids.slice(0, 10), m[30], ids[11]]);
    const res = await put(asAdmin, [a]);
    expect(res.status).toBe(200);
    const side = (res.body.selections as SideBody[]).find((s) => s.id === sel.A)!;
    expect(side.slots[10].member?.status).toBe("no");
    expect(side.warnings.saidNo).toBe(1);
  });

  it("a B Grade captain under captains_own_grade can't touch A Grade (AE5)", async () => {
    const b = await board(asCaptain);
    const aSide = b.selections.find((s) => s.id === sel.A)!;
    expect(aSide.canEdit).toBe(false);
    expect(aSide.readOnlyReason).toMatch(/own grade/);
    expect(b.selections.find((s) => s.id === sel.B)!.canEdit).toBe(true);

    const toA = await changeFor(sel.A, (ids) => [...ids.slice(0, 10), m[28], ids[11]]);
    expect((await put(asCaptain, [toA])).status).toBe(403);

    // Pulling m1 out of A Grade into B Grade.
    const pullB = await changeFor(sel.B, (ids) => [m[1], ...ids.slice(1)]);
    expect((await put(asCaptain, [pullB])).status).toBe(403);
    const pullA = await changeFor(sel.A, (ids) => [null, ...ids.slice(1)], { captain: null });
    expect((await put(asCaptain, [pullB, pullA])).status).toBe(403);
    expect((await loadSel(sel.B)).version).toBe(1);

    // Their own grade, from the pool: fine.
    const own = await changeFor(sel.B, (ids) => [m[28], ...ids.slice(1)]);
    expect((await put(asCaptain, [own])).status).toBe(200);
  });

  it("captains_all_grades lets the captain change both sides; admins_only refuses every captain write", async () => {
    await setRule("captains_all_grades");
    const pullB = await changeFor(sel.B, (ids) => [m[1], ...ids.slice(1)]);
    const pullA = await changeFor(sel.A, (ids) => [m[11], ...ids.slice(1)], { captain: null });
    expect((await put(asCaptain, [pullB, pullA])).status).toBe(200);

    await setRule("admins_only");
    const own = await changeFor(sel.B, (ids) => [m[28], ...ids.slice(1)]);
    expect((await put(asCaptain, [own])).status).toBe(403);
    expect(
      (
        await asCaptain(request(app).post(`/api/selection/${sel.B}/finalise`)).send(
          await ver(sel.B),
        )
      ).status,
    ).toBe(403);
    expect((await board(asCaptain)).actor.canRemind).toBe(false);
  });

  it("a stale version → 409 and nothing written", async () => {
    const first = await changeFor(sel.C, (ids) => [...ids.slice(0, 6), m[28], ...ids.slice(7)]);
    expect((await put(asAdmin, [first])).status).toBe(200);
    const stale = { ...first, slots: pad(m.slice(22, 28)).map((memberId) => ({ memberId })) };
    const res = await put(asAdmin, [stale]);
    expect(res.status).toBe(409);
    const row = await loadSel(sel.C);
    expect(row.version).toBe(2);
    expect(row.slots[6].memberId).toBe(m[28]);
  });

  it("moving A Grade's captain into B Grade clears A's captain and logs it (AE8)", async () => {
    // The client still names m1 as A's captain; the server clears it.
    const a = await changeFor(sel.A, (ids) => [null, ...ids.slice(1)]);
    const b = await changeFor(sel.B, (ids) => [...ids.slice(0, 10), m[1], ids[11]]);
    const res = await put(asAdmin, [a, b]);
    expect(res.status).toBe(200);
    const [rowA, rowB] = [await loadSel(sel.A), await loadSel(sel.B)];
    expect(rowA.captainMemberId).toBeNull();
    expect(rowA.keeperMemberId).toBe(m[2]);
    expect(rowB.captainMemberId).toBe(m[11]);
    const side = (res.body.selections as SideBody[]).find((s) => s.id === sel.A)!;
    expect(side.warnings.noCaptain).toBe(true);
    const [event] = await db
      .select()
      .from(selectionEventsTable)
      .where(
        and(eq(selectionEventsTable.selectionId, sel.A), eq(selectionEventsTable.action, "update")),
      );
    expect(event.detail.rolesCleared).toEqual([
      { role: "captain", memberId: m[1], name: "P1 Member" },
    ]);
    expect(event.detail.captain).toEqual({ from: { id: m[1], name: "P1 Member" }, to: null });
  });

  it("finalise publishes the side, messages each selected member once, and allows no captain (R31, R39)", async () => {
    const noCaptain = await changeFor(sel.A, (ids) => ids, { captain: null });
    expect((await put(asAdmin, [noCaptain])).status).toBe(200);
    const res = await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    expect(res.body.messaged).toEqual({ selected: 10, deselected: 0, failed: 0 });
    expect(res.body.selection.state).toBe("final");
    expect(res.body.selection.canEdit).toBe(false);

    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(and(eq(teamListsTable.tenantId, tenantA), eq(teamListsTable.fixtureId, fixture.A)));
    expect(list.source).toBe("selection");
    expect(list.isPublished).toBe(true);
    expect(list.players).toHaveLength(10);
    expect(list.players[0]).toEqual({ order: 1, playerId: 501, displayName: "P1 Member" });
    expect(list.players[1]).toEqual({ order: 2, displayName: "P2 Member", role: "WK" });
    // A fill-in link never reaches the list.
    expect(list.players[2]).toEqual({ order: 3, displayName: "P3 Member" });

    for (let i = 1; i <= 10; i++) expect(emailsTo(i)).toHaveLength(1);
    expect(emailsTo(11)).toHaveLength(0);
    expect(emailsTo(2)[0].text).toMatch(/selected \(keeper\) for A Grade v Mandurah/);
    expect(sms.filter((s) => s.body.includes("selected"))).toHaveLength(10);

    // Locked: a second finalise and a save are both refused.
    expect(
      (await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`)).send(await ver(sel.A)))
        .status,
    ).toBe(409);
    const edit = await changeFor(sel.A, (ids) => [...ids.slice(0, 10), m[28], ids[11]]);
    expect((await put(asAdmin, [edit])).status).toBe(409);
  });

  it("the same member as captain and keeper publishes C/WK (AE9)", async () => {
    const both = await changeFor(sel.A, (ids) => ids, { captain: m[2], keeper: m[2] });
    expect((await put(asAdmin, [both])).status).toBe(200);
    await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(and(eq(teamListsTable.tenantId, tenantA), eq(teamListsTable.fixtureId, fixture.A)));
    expect(list.players.find((p) => p.displayName === "P2 Member")?.role).toBe("C/WK");
    expect(list.players.filter((p) => p.role)).toHaveLength(1);
    expect(emailsTo(2)[0].text).toMatch(/captain and keeper/);
  });

  it("re-open, swap one player, re-finalise → only the added and dropped players are messaged (R32)", async () => {
    await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    const published = (
      await db
        .select()
        .from(teamListsTable)
        .where(and(eq(teamListsTable.tenantId, tenantA), eq(teamListsTable.fixtureId, fixture.A)))
    )[0];
    email = [];
    sms = [];

    const reopened = await asAdmin(request(app).post(`/api/selection/${sel.A}/reopen`)).expect(200);
    expect(reopened.body.state).toBe("draft");
    expect(reopened.body.canEdit).toBe(true);
    // The published list stays as last finalised (KTD6).
    const [still] = await db
      .select()
      .from(teamListsTable)
      .where(eq(teamListsTable.id, published.id));
    expect(still.players).toEqual(published.players);
    expect(still.isPublished).toBe(true);
    expect((await asAdmin(request(app).post(`/api/selection/${sel.A}/reopen`))).status).toBe(409);

    const swap = await changeFor(sel.A, (ids) => [...ids.slice(0, 9), m[28], null, ids[11]]);
    expect((await put(asAdmin, [swap])).status).toBe(200);
    const res = await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    expect(res.body.messaged).toEqual({ selected: 1, deselected: 1, failed: 0 });
    expect(email.map((e) => e.to).sort()).toEqual([EMAIL(10), EMAIL(28)].sort());
    expect(emailsTo(10)[0].text).toMatch(/no longer in it/);
    expect(emailsTo(28)[0].text).toMatch(/selected/);

    const actions = (
      await db
        .select()
        .from(selectionEventsTable)
        .where(eq(selectionEventsTable.selectionId, sel.A))
    ).map((e) => e.action);
    expect(actions).toEqual(["finalise", "reopen", "update", "finalise"]);
  });

  it("a captain's board carries no mobile, email or phone anywhere (R6)", async () => {
    const res = await asCaptain(request(app).get("/api/selection/board?section=senior")).expect(
      200,
    );
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, child] of Object.entries(v)) {
          keys.push(k);
          walk(child);
        }
      }
    };
    walk(res.body);
    expect(keys.filter((k) => /mobile|email|phone|contact|guardian|account/i.test(k))).toEqual([]);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("@");
    expect(raw).not.toContain(MOBILE(1));
    expect(raw).not.toContain("Gail");
  });

  it("the fixtures team-list PUT refuses a list finalised in the Hub (409)", async () => {
    await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    const res = await asAdmin(request(app).put(`/api/fixtures/${fixture.A}/team-list`)).send({
      players: [{ order: 1, displayName: "Someone Else" }],
      isPublished: true,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Selection Hub/);
    // Another fixture's list is still the admin's to edit.
    await asAdmin(request(app).put(`/api/fixtures/${fixture.B}/team-list`))
      .send({ players: [{ order: 1, displayName: "Someone Else" }] })
      .expect(200);
  });

  it("remind messages the section's non-responders, and a second remind within 12 hours sends nothing (R28)", async () => {
    const first = await asCaptain(request(app).post("/api/selection/rounds/current/remind"))
      .send({ section: "senior" })
      .expect(200);
    expect(first.body).toMatchObject({ step: "remind", roundId, messaged: 2 });
    expect(email.map((e) => e.to).sort()).toEqual([EMAIL(28), EMAIL(29)].sort());
    email = [];
    sms = [];
    const second = await asAdmin(request(app).post("/api/selection/rounds/current/remind"))
      .send({ section: "senior" })
      .expect(200);
    expect(second.body).toMatchObject({ messaged: 0, throttled: 2 });
    expect(email).toHaveLength(0);
    expect(sms).toHaveLength(0);

    await setRule("admins_only");
    await asCaptain(request(app).post("/api/selection/rounds/current/remind"))
      .send({ section: "senior" })
      .expect(403);
  });

  it("a withdrawal re-opens the slot, keeps the rest published and alerts staff; the replacement is told (AE7)", async () => {
    await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    email = [];

    const out = await withdrawFromSelection(tenantA, m[2], roundId, {
      kind: "player",
      id: null,
      name: "P2 Member",
    });
    expect(out.selectionIds).toEqual([sel.A]);
    const row = await loadSel(sel.A);
    expect(row.state).toBe("draft");
    expect(row.slots[1]).toEqual({
      memberId: null,
      gap: { name: "P2 Member", reason: "withdrew" },
    });
    expect(row.keeperMemberId).toBeNull();
    expect(row.notifiedMemberIds).not.toContain(m[2]);
    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(and(eq(teamListsTable.tenantId, tenantA), eq(teamListsTable.fixtureId, fixture.A)));
    expect(list.isPublished).toBe(true);
    expect(list.players.map((p) => p.displayName)).not.toContain("P2 Member");
    expect(list.players).toHaveLength(9);
    expect(list.players.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const notices = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.tenantId, tenantA));
    expect(notices.map((n) => n.kind)).toEqual(["selection_slot_reopened"]);
    const [event] = await db
      .select()
      .from(selectionEventsTable)
      .where(
        and(
          eq(selectionEventsTable.selectionId, sel.A),
          eq(selectionEventsTable.action, "withdraw"),
        ),
      );
    expect(event.actorKind).toBe("player");

    // Not placed anywhere → nothing changes.
    expect(
      (
        await withdrawFromSelection(tenantA, m[29], roundId, {
          kind: "player",
          id: null,
          name: null,
        })
      ).selectionIds,
    ).toEqual([]);

    const fill = await changeFor(sel.A, (ids) => [ids[0], m[28], ...ids.slice(2)]);
    expect((await put(asAdmin, [fill])).status).toBe(200);
    const res = await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    expect(res.body.messaged).toEqual({ selected: 1, deselected: 0, failed: 0 });
    expect(email.map((e) => e.to)).toEqual([EMAIL(28)]);
  });

  it("a duplicate already in the round doesn't block saving another grade, and a save can't add one", async () => {
    // An older draft left m28 in both A and B Grade.
    for (const id of [sel.A, sel.B]) {
      const row = await loadSel(id);
      await db
        .update(selectionsTable)
        .set({ slots: row.slots.map((s, i) => (i === 10 ? { memberId: m[28] } : s)) })
        .where(eq(selectionsTable.id, id));
    }
    const c = await changeFor(sel.C, (ids) => [...ids.slice(0, 6), m[29], ...ids.slice(7)]);
    expect((await put(asAdmin, [c])).status).toBe(200);
    // Adding m28 to a third side is still refused.
    const c2 = await changeFor(sel.C, (ids) => [...ids.slice(0, 7), m[28], ...ids.slice(8)]);
    expect((await put(asAdmin, [c2])).status).toBe(400);
    // Taking m28 out of A Grade resolves it.
    const a = await changeFor(sel.A, (ids) => [...ids.slice(0, 10), null, ids[11]]);
    expect((await put(asAdmin, [a])).status).toBe(200);
  });

  it("a save with one valid and one stale side → 409, the valid side unchanged and nothing logged", async () => {
    const a = await changeFor(sel.A, (ids) => [...ids.slice(0, 10), m[28], ids[11]]);
    const c = { ...(await changeFor(sel.C, (ids) => ids)), version: 99 };
    expect((await put(asAdmin, [a, c])).status).toBe(409);
    const rowA = await loadSel(sel.A);
    expect(rowA.version).toBe(1);
    expect(rowA.slots[10].memberId).toBeNull();
    const events = await db
      .select()
      .from(selectionEventsTable)
      .where(eq(selectionEventsTable.tenantId, tenantA));
    expect(events).toHaveLength(0);
  });

  it("finalise needs the side's current version", async () => {
    await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send({})
      .expect(400);
    const stale = await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send({ version: 99 })
      .expect(409);
    expect(stale.body.error).toMatch(/changed/);
    expect((await loadSel(sel.A)).state).toBe("draft");
    expect(email).toHaveLength(0);
  });

  it("two concurrent finalises → one 200, one 409, and each member is messaged once", async () => {
    const body = await ver(sel.A);
    const [r1, r2] = await Promise.all([
      asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`)).send(body),
      asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`)).send(body),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    for (let i = 1; i <= 10; i++) expect(emailsTo(i)).toHaveLength(1);
    const finals = await db
      .select()
      .from(selectionEventsTable)
      .where(
        and(
          eq(selectionEventsTable.selectionId, sel.A),
          eq(selectionEventsTable.action, "finalise"),
        ),
      );
    expect(finals).toHaveLength(1);
  });

  it("a private member is published as Private Player, with no player id, and can still withdraw", async () => {
    await db
      .update(squadMembersTable)
      .set({ isPrivate: true })
      .where(inArray(squadMembersTable.id, [m[1], m[4]]));
    try {
      await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
        .send(await ver(sel.A))
        .expect(200);
      const list = await teamListOf(fixture.A);
      expect(list.players[0]).toEqual({ order: 1, displayName: "Private Player", role: "C" });
      expect(list.players[3]).toEqual({ order: 4, displayName: "Private Player" });
      expect(JSON.stringify(list.players)).not.toMatch(/P1 Member|P4 Member|501/);

      await withdrawFromSelection(tenantA, m[4], roundId, { kind: "player", id: null, name: null });
      const after = await teamListOf(fixture.A);
      expect(after.players).toHaveLength(9);
      expect(after.players.filter((p) => p.displayName === "Private Player")).toEqual([
        { order: 1, displayName: "Private Player", role: "C" },
      ]);
    } finally {
      await db
        .update(squadMembersTable)
        .set({ isPrivate: false })
        .where(inArray(squadMembersTable.id, [m[1], m[4]]));
    }
  });

  it("finalise, re-open and withdraw are refused once the match has started", async () => {
    await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    const [fxA] = await db.select().from(fixturesTable).where(eq(fixturesTable.id, fixture.A));
    const [fxB] = await db.select().from(fixturesTable).where(eq(fixturesTable.id, fixture.B));
    const past = new Date(Date.now() - 3_600_000);
    await db
      .update(fixturesTable)
      .set({ startAt: past })
      .where(inArray(fixturesTable.id, [fixture.A, fixture.B]));
    try {
      const reopen = await asAdmin(request(app).post(`/api/selection/${sel.A}/reopen`)).expect(409);
      expect(reopen.body.error).toMatch(/started/);
      await expect(
        withdrawFromSelection(tenantA, m[2], roundId, { kind: "player", id: null, name: null }),
      ).rejects.toMatchObject({ status: 409 });
      expect((await loadSel(sel.A)).state).toBe("final");
      const fin = await asAdmin(request(app).post(`/api/selection/${sel.B}/finalise`))
        .send(await ver(sel.B))
        .expect(409);
      expect(fin.body.error).toMatch(/started/);
      expect((await loadSel(sel.B)).state).toBe("draft");
    } finally {
      await db
        .update(fixturesTable)
        .set({ startAt: fxA.startAt })
        .where(eq(fixturesTable.id, fixture.A));
      await db
        .update(fixturesTable)
        .set({ startAt: fxB.startAt })
        .where(eq(fixturesTable.id, fixture.B));
    }
  });

  it("finalise never replaces a team list PlayHQ supplied", async () => {
    await db.insert(teamListsTable).values({
      tenantId: tenantA,
      fixtureId: fixture.B,
      players: [{ order: 1, displayName: "PlayHQ Pick" }],
      isPublished: true,
      source: "playhq",
    });
    await asAdmin(request(app).post(`/api/selection/${sel.B}/finalise`))
      .send(await ver(sel.B))
      .expect(200);
    const list = await teamListOf(fixture.B);
    expect(list.source).toBe("playhq");
    expect(list.players).toEqual([{ order: 1, displayName: "PlayHQ Pick" }]);
  });

  it("a member every delivery failed for is counted, left un-notified and messaged on the next finalise", async () => {
    const down = MOBILE(4).replace(/\s/g, "").slice(1);
    setEmailTransport(async (msg) => {
      if (msg.to === EMAIL(4)) throw new Error("mail down");
      email.push(msg);
    });
    setSmsTransport(async (msg) => {
      if (msg.to.endsWith(down)) throw new Error("sms down");
      sms.push(msg);
    });
    try {
      const res = await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
        .send(await ver(sel.A))
        .expect(200);
      expect(res.body.messaged).toEqual({ selected: 9, deselected: 0, failed: 1 });
      const row = await loadSel(sel.A);
      expect(row.notifiedMemberIds).not.toContain(m[4]);
      expect(row.notifiedMemberIds).toHaveLength(9);
    } finally {
      setSmsTransport(async (msg) => {
        sms.push(msg);
      });
      setEmailTransport(async (msg) => {
        email.push(msg);
      });
    }
    email = [];
    await asAdmin(request(app).post(`/api/selection/${sel.A}/reopen`)).expect(200);
    const again = await asAdmin(request(app).post(`/api/selection/${sel.A}/finalise`))
      .send(await ver(sel.A))
      .expect(200);
    expect(again.body.messaged).toEqual({ selected: 1, deselected: 0, failed: 0 });
    expect(email.map((e) => e.to)).toEqual([EMAIL(4)]);
  });
});
