import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  squadMembersTable,
  availabilityRoundsTable,
  fixturesTable,
  selectionsTable,
  teamListsTable,
  shirtNumbersTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { buildTeamSheet } from "../lib/team-sheet";
import { SESSION_COOKIE, encodeSession } from "../lib/auth";
import { setEmailTransport, type EmailMessage } from "../lib/integrations/email";
import { setSmsTransport, type SmsMessage } from "../lib/integrations/sms";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { pinClockMidWeek } from "../lib/mid-week-clock.test-helpers";
import { addDays, perthDayStart } from "../lib/availability-grades";
import { DEFAULT_SCHEDULE, roundWeekendFor, setSendPaceMs } from "../lib/availability-schedule";

/**
 * The Selection Hub for a club that doesn't use availability (no settings row,
 * so availability is off): the weekend's sides are drafted on demand from each
 * grade's last team list with everyone listed kept, and finalising publishes
 * the team list without messaging anyone. Real-DB integration test (needs
 * DATABASE_URL with migrations applied); SMS and email go to in-process fakes.
 */

const STAMP = Date.now();

type BoardBody = {
  availability: boolean;
  readOnly: boolean;
  weekends: { previous: string | null; current: string; next: string | null };
  round: { roundId: number } | null;
  selections: {
    id: number;
    version: number;
    fixture: { grade: string };
    canEdit: boolean;
    slots: { memberId: number | null }[];
    captainMemberId: number | null;
    keeperMemberId: number | null;
  }[];
  pool: { id: number }[];
  events: { selectionId: number; action: string; detail: Record<string, unknown> }[];
};

describe("Selection Hub without availability", () => {
  let tenantId = 0;
  let adminCookie = "";
  const m: number[] = [];
  let fixtureA = 0;
  const sms: SmsMessage[] = [];
  const email: EmailMessage[] = [];

  let weekendDate = "";
  const board = async (section: "senior" | "junior", weekend?: string) =>
    (
      await request(app)
        .get(`/api/selection/board?section=${section}${weekend ? `&weekend=${weekend}` : ""}`)
        .set("Cookie", adminCookie)
        .set("x-tenant-id", String(tenantId))
        .expect(200)
    ).body as BoardBody;

  beforeAll(async () => {
    pinClockMidWeek();
    setSendPaceMs(0);
    setSmsTransport(async (msg) => {
      sms.push(msg);
    });
    setEmailTransport(async (msg) => {
      email.push(msg);
    });

    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `sel-solo-${STAMP}`,
        centralClubId: 7_600_000 + (STAMP % 100_000) * 10,
        name: "Standalone CC",
        plan: "pilot",
      })
      .returning();
    tenantId = t.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({ tenantId, username: `solo_${STAMP}`, displayName: "Sol Admin", passwordHash: "x" })
      .returning();
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;

    for (let i = 1; i <= 11; i++) {
      const [row] = await db
        .insert(squadMembersTable)
        .values({
          tenantId,
          firstName: `S${i}`,
          lastName: "Solo",
          ...(i === 1 ? { linkedPlayerId: 501 } : {}),
          accountHolderMobile: `0412 ${String(300 + i)} ${String(STAMP % 1000).padStart(3, "0")}`,
          accountHolderEmail: `solo${i}.${STAMP}@example.test`,
        })
        .returning();
      m[i] = row.id;
    }

    weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    const sat = perthDayStart(weekendDate).getTime();
    const [last, current] = await db
      .insert(fixturesTable)
      .values([
        {
          tenantId,
          grade: "A Grade",
          opponentName: "Mandurah",
          startAt: new Date(sat - 7 * 86_400_000 + 13 * 3_600_000),
        },
        {
          tenantId,
          grade: "A Grade",
          opponentName: "Rockingham",
          startAt: new Date(sat + 13 * 3_600_000),
        },
      ])
      .returning();
    fixtureA = current.id;
    await db.insert(shirtNumbersTable).values({
      tenantId,
      season: seasonStartYearFor(current.startAt),
      name: "S1 Solo",
      playerId: 501,
      number: "7",
    });
    // Last week's XI: S1 captain and keeper, S1–S11 in order.
    await db.insert(teamListsTable).values({
      tenantId,
      fixtureId: last.id,
      isPublished: true,
      source: "admin",
      players: Array.from({ length: 11 }, (_, i) => ({
        order: i + 1,
        displayName: `S${i + 1} Solo`,
        ...(i === 0 ? { role: "C/WK" as const } : {}),
      })),
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    setSmsTransport(null);
    setEmailTransport(null);
    setSendPaceMs(250);
    await purgeTestTenants([tenantId]);
  });

  it("drafts the weekend's side on demand from last week's XI, everyone kept", async () => {
    const b = await board("senior");
    expect(b.availability).toBe(false);
    expect(b.round).not.toBeNull();
    expect(b.selections).toHaveLength(1);
    const side = b.selections[0];
    expect(side.fixture.grade).toBe("A Grade");
    expect(side.slots.slice(0, 11).map((s) => s.memberId)).toEqual(m.slice(1, 12));
    expect(side.captainMemberId).toBe(m[1]);
    expect(side.keeperMemberId).toBe(m[1]);
    // The pool is the whole squad: all 11 are picked, and still listed.
    expect(b.pool).toHaveLength(11);
  });

  it("a second load drafts nothing new", async () => {
    await board("senior");
    const rows = await db
      .select({ id: selectionsTable.id })
      .from(selectionsTable)
      .where(eq(selectionsTable.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    const rounds = await db
      .select({ id: availabilityRoundsTable.id })
      .from(availabilityRoundsTable)
      .where(eq(availabilityRoundsTable.tenantId, tenantId));
    expect(rounds).toHaveLength(1);
  });

  it("finalise publishes the team list and messages nobody", async () => {
    const side = (await board("senior")).selections[0];
    const res = await request(app)
      .post(`/api/selection/${side.id}/finalise`)
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenantId))
      .send({ version: side.version })
      .expect(200);
    expect(res.body.messaged).toEqual({ selected: 0, deselected: 0, failed: 0 });
    expect(sms).toHaveLength(0);
    expect(email).toHaveLength(0);
    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.fixtureId, fixtureA)));
    expect(list.source).toBe("selection");
    expect(list.players).toHaveLength(11);
    expect(list.players[0]).toMatchObject({ order: 1, displayName: "S1 Solo", role: "C/WK" });
  });

  it("the team sheet prints register shirt numbers with the club's setting off", async () => {
    const side = (await board("senior")).selections[0];
    const sheet = await buildTeamSheet(tenantId, side.id);
    expect(sheet.players[0]).toMatchObject({ order: 1, name: "S1 Solo", shirtNumber: "7" });
    expect(sheet.players[1].shirtNumber).toBeNull();
  });

  it("plans next weekend from this weekend's finalised side, with availability off (ADR-008)", async () => {
    const next = addDays(weekendDate, 7);
    await db.insert(fixturesTable).values({
      tenantId,
      grade: "A Grade",
      opponentName: "Baldivis",
      startAt: new Date(perthDayStart(next).getTime() + 13 * 3_600_000),
    });
    const now = await board("senior");
    expect(now.weekends).toEqual({ previous: null, current: weekendDate, next });
    const thisSide = now.selections[0];

    const ahead = await board("senior", next);
    expect(ahead.readOnly).toBe(false);
    expect(ahead.weekends).toMatchObject({ previous: weekendDate, current: next, next: null });
    expect(ahead.selections).toHaveLength(1);
    const side = ahead.selections[0];
    expect(side.canEdit).toBe(true);
    expect(side.slots.map((s) => s.memberId)).toEqual(thisSide.slots.map((s) => s.memberId));
    expect(side.captainMemberId).toBe(m[1]);
    const draft = ahead.events.find((e) => e.selectionId === side.id && e.action === "draft");
    expect(draft?.detail).toMatchObject({ seededFrom: { kind: "selection", id: thisSide.id } });
  });
});
