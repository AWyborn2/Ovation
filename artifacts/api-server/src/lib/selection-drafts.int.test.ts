import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  fixturesTable,
  teamListsTable,
  squadMembersTable,
  availabilityRoundsTable,
  availabilityResponsesTable,
  availabilityAwayTable,
  selectionsTable,
  selectionEventsTable,
  type TeamListPlayer,
} from "@workspace/db";
import { buildRoundDrafts } from "./selection-drafts";
import { purgeTestTenants } from "./tenant-purge.test-helpers";

/**
 * The draft builder against real Postgres (plan 2026-10-06-002 U6, ADR-008):
 * one draft per fixture in the round's Friday–Sunday window, seeded from the
 * grade's side in the previous round that has one, else its most recent
 * earlier team list, every carried player kept whatever they replied; a
 * grade's second fixture of the weekend starting empty, re-runs creating
 * nothing, other tenants untouched.
 *
 * Real-DB integration test (needs DATABASE_URL with migrations applied; CI's
 * api-tests job provides it).
 */

const STAMP = Date.now();
const WEEKEND = "2026-10-17";
const NOW = new Date("2026-10-15T10:00:00Z");
const NAMES = [
  "Ava Hill",
  "Ben Cole",
  "Cal Dunn",
  "Dan Ford",
  "Eli Grant",
  "Finn Hart",
  "Gus Ives",
  "Hal Jones",
  "Ian Kerr",
  "Jack Hale",
  "Kai Long",
];

let tenantId: number;
let otherTenantId: number;
let roundId: number;
const memberIds = new Map<string, number>();
const fx: Record<string, number> = {};

async function fixture(tid: number, grade: string, startAt: string): Promise<number> {
  const [f] = await db
    .insert(fixturesTable)
    .values({ tenantId: tid, grade, opponentName: "Rivals", startAt: new Date(startAt) })
    .returning();
  return f.id;
}

async function teamList(fixtureId: number, players: TeamListPlayer[]) {
  await db.insert(teamListsTable).values({ tenantId, fixtureId, players, isPublished: true });
}

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `drafts-${STAMP}`, centralClubId: 8861, name: "Drafts CC", plan: "pilot" })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({ slug: `drafts-o-${STAMP}`, centralClubId: 8862, name: "Other CC", plan: "pilot" })
    .returning();
  otherTenantId = o.id;

  for (const n of [...NAMES, "Zed Young", "Bo Ray", "Cy Ash"]) {
    const [firstName, lastName] = n.split(" ");
    const [m] = await db
      .insert(squadMembersTable)
      .values({
        tenantId,
        firstName,
        lastName,
        ...(n === "Jack Hale" ? { linkedPlayerId: 410 } : {}),
      })
      .returning();
    memberIds.set(n, m.id);
  }

  // Earlier sides: A Grade last week (with C/WK roles), B Grade a fortnight ago.
  fx.aLast = await fixture(tenantId, "A Grade", "2026-10-10T04:30:00Z");
  await teamList(
    fx.aLast,
    NAMES.map((n, i) => ({
      order: i + 1,
      ...(n === "Jack Hale" ? { playerId: 410, displayName: "J. Hale" } : { displayName: n }),
      ...(i === 0 ? { role: "C" as const } : i === 1 ? { role: "WK" as const } : {}),
    })),
  );
  fx.bLast = await fixture(tenantId, "B Grade", "2026-10-03T04:30:00Z");
  await teamList(fx.bLast, [
    { order: 1, displayName: "Bo Ray" },
    { order: 2, displayName: "Cy Ash" },
  ]);

  // This weekend (Fri 16 – Sun 18 Oct, Perth).
  fx.a = await fixture(tenantId, "A Grade", "2026-10-17T04:30:00Z");
  fx.bSat = await fixture(tenantId, "B Grade", "2026-10-17T02:00:00Z");
  fx.bSun = await fixture(tenantId, "B Grade", "2026-10-18T02:00:00Z");
  fx.c = await fixture(tenantId, "C Grade", "2026-10-16T09:00:00Z");
  // Outside the window, and another club's fixture inside it.
  fx.next = await fixture(tenantId, "A Grade", "2026-10-24T04:30:00Z");
  fx.other = await fixture(otherTenantId, "A Grade", "2026-10-17T04:30:00Z");

  const [r] = await db
    .insert(availabilityRoundsTable)
    .values({ tenantId, weekendDate: WEEKEND })
    .returning();
  roundId = r.id;

  // A Grade: everyone Yes except Cal (No), Finn (Maybe), Jack Hale (no reply) and
  // Ben the keeper (No). Zed answers Yes but played no previous side. Bo is away.
  const answer: Record<string, "yes" | "no" | "maybe"> = {
    "Cal Dunn": "no",
    "Finn Hart": "maybe",
    "Ben Cole": "no",
  };
  const rows = [...NAMES, "Zed Young", "Cy Ash"]
    .filter((n) => n !== "Jack Hale")
    .map((n) => ({
      tenantId,
      roundId,
      memberId: memberIds.get(n)!,
      date: WEEKEND,
      status: answer[n] ?? ("yes" as const),
    }));
  await db.insert(availabilityResponsesTable).values(rows);
  await db.insert(availabilityAwayTable).values({
    tenantId,
    memberId: memberIds.get("Bo Ray")!,
    fromDate: "2026-10-12",
    toDate: "2026-10-25",
  });
});

afterAll(async () => {
  await purgeTestTenants([tenantId, otherTenantId]);
});

const selectionFor = async (fixtureId: number) => {
  const [s] = await db
    .select()
    .from(selectionsTable)
    .where(eq(selectionsTable.fixtureId, fixtureId));
  return s;
};

describe("buildRoundDrafts", () => {
  it("drafts one side per fixture in the round window", async () => {
    const summary = await buildRoundDrafts(tenantId, roundId, NOW);
    expect(summary).toMatchObject({ created: 4, skipped: 0 });

    const rows = await db
      .select({ fixtureId: selectionsTable.fixtureId })
      .from(selectionsTable)
      .where(eq(selectionsTable.tenantId, tenantId));
    expect(rows.map((r) => r.fixtureId).sort()).toEqual([fx.a, fx.bSat, fx.bSun, fx.c].sort());
    expect(await selectionFor(fx.other)).toBeUndefined();
    expect(await selectionFor(fx.next)).toBeUndefined();
  });

  it("seeds A Grade from last week's team list, keeping No, Maybe and no-reply players (ADR-008)", async () => {
    const s = await selectionFor(fx.a);
    expect(s).toMatchObject({ roundId, state: "draft", version: 1 });
    expect(s.slots).toHaveLength(12);
    expect(s.slots.slice(0, 11).map((x) => x.memberId)).toEqual(NAMES.map((n) => memberIds.get(n)));
    // Ben the keeper said No: he stays in his slot and keeps the gloves.
    expect(s.captainMemberId).toBe(memberIds.get("Ava Hill"));
    expect(s.keeperMemberId).toBe(memberIds.get("Ben Cole"));
  });

  it("leaves a Yes player who played no previous side out of every draft (R18)", async () => {
    const all = await db
      .select()
      .from(selectionsTable)
      .where(eq(selectionsTable.tenantId, tenantId));
    const placed = all.flatMap((s) => s.slots.map((x) => x.memberId));
    expect(placed).not.toContain(memberIds.get("Zed Young"));
  });

  it("seeds a grade's first fixture of the weekend and starts the second empty", async () => {
    const sat = await selectionFor(fx.bSat);
    // Bo Ray is away for the weekend (recorded as No) and still carried; Cy Ash said Yes.
    expect(sat.slots[0]).toEqual({ memberId: memberIds.get("Bo Ray") });
    expect(sat.slots[1]).toEqual({ memberId: memberIds.get("Cy Ash") });
    expect(sat.slots.slice(2).every((x) => x.memberId == null && !x.gap)).toBe(true);

    const sun = await selectionFor(fx.bSun);
    expect(sun.slots).toEqual(Array.from({ length: 12 }, () => ({ memberId: null })));
    const c = await selectionFor(fx.c);
    expect(c.slots).toEqual(Array.from({ length: 12 }, () => ({ memberId: null })));
  });

  it("logs a system draft event per side", async () => {
    const s = await selectionFor(fx.a);
    const events = await db
      .select()
      .from(selectionEventsTable)
      .where(
        and(
          eq(selectionEventsTable.selectionId, s.id),
          eq(selectionEventsTable.tenantId, tenantId),
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorKind: "system", action: "draft", roundId });
    const [list] = await db
      .select({ id: teamListsTable.id })
      .from(teamListsTable)
      .where(eq(teamListsTable.fixtureId, fx.aLast));
    expect(events[0].detail).toMatchObject({
      seededFrom: { kind: "team_list", id: list.id, fixtureId: fx.aLast },
    });
  });

  it("never overwrites an existing selection on a re-run", async () => {
    const before = await selectionFor(fx.a);
    await db
      .update(selectionsTable)
      .set({ slots: before.slots.slice().reverse(), version: 2 })
      .where(eq(selectionsTable.id, before.id));

    const summary = await buildRoundDrafts(tenantId, roundId, NOW);
    expect(summary).toMatchObject({ created: 0, skipped: 4 });
    const after = await selectionFor(fx.a);
    expect(after.version).toBe(2);
    expect(after.slots).toEqual(before.slots.slice().reverse());
  });

  it("places a member on two grades' last lists once, in the earlier fixture, and never beside an existing side", async () => {
    const weekend = "2026-10-31";
    const [r] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId, weekendDate: weekend })
      .returning();
    const [ava, gus, ian, kai] = ["Ava Hill", "Gus Ives", "Ian Kerr", "Kai Long"].map((n) =>
      memberIds.get(n)!,
    );
    await db.insert(availabilityResponsesTable).values(
      [ava, gus, ian, kai].map((memberId) => ({
        tenantId,
        roundId: r.id,
        memberId,
        date: weekend,
        status: "yes" as const,
      })),
    );
    // E and F Grade both listed Ava last time; G Grade's side already exists with Ian.
    const eLast = await fixture(tenantId, "E Grade", "2026-10-24T02:00:00Z");
    const fLast = await fixture(tenantId, "F Grade", "2026-10-24T02:00:00Z");
    await teamList(eLast, [
      { order: 1, displayName: "Ava Hill" },
      { order: 2, displayName: "Ian Kerr" },
    ]);
    await teamList(fLast, [
      { order: 1, displayName: "Gus Ives" },
      { order: 2, displayName: "Ava Hill" },
      { order: 3, displayName: "Kai Long" },
    ]);
    // F starts first, so it keeps Ava; E (later) leaves her slot open.
    const f = await fixture(tenantId, "F Grade", "2026-10-31T01:00:00Z");
    const e = await fixture(tenantId, "E Grade", "2026-10-31T04:30:00Z");
    const g = await fixture(tenantId, "G Grade", "2026-10-31T03:00:00Z");
    await db.insert(selectionsTable).values({
      tenantId,
      roundId: r.id,
      fixtureId: g,
      slots: [{ memberId: ian }, ...Array.from({ length: 10 }, () => ({ memberId: null }))],
    });

    const summary = await buildRoundDrafts(tenantId, r.id, NOW);
    expect(summary).toMatchObject({ created: 2, skipped: 1 });
    expect((await selectionFor(f)).slots.slice(0, 3)).toEqual([
      { memberId: gus },
      { memberId: ava },
      { memberId: kai },
    ]);
    expect((await selectionFor(e)).slots.slice(0, 2)).toEqual([
      { memberId: null, gap: { name: "Ava Hill", reason: "picked_elsewhere" } },
      { memberId: null, gap: { name: "Ian Kerr", reason: "picked_elsewhere" } },
    ]);
    const all = await db.select().from(selectionsTable).where(eq(selectionsTable.roundId, r.id));
    const ids = all.flatMap((s) =>
      s.slots.flatMap((x) => (x.memberId != null ? [x.memberId] : [])),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does nothing for another tenant's round", async () => {
    await expect(buildRoundDrafts(otherTenantId, roundId, NOW)).resolves.toMatchObject({
      created: 0,
      skipped: 0,
    });
    expect(await selectionFor(fx.other)).toBeUndefined();
  });
});

describe("buildRoundDrafts carry-over (ADR-008)", () => {
  const W1 = "2026-11-07";
  const W2 = "2026-11-14";
  const id = (n: string) => memberIds.get(n)!;
  const twelve = (ids: (number | null)[]) =>
    Array.from({ length: 12 }, (_, i) => ({ memberId: ids[i] ?? null }));
  let w1: number;
  let w2: number;
  const prior: Record<string, number> = {};

  beforeAll(async () => {
    [w1, w2] = (
      await db
        .insert(availabilityRoundsTable)
        .values([
          { tenantId, weekendDate: W1 },
          { tenantId, weekendDate: W2 },
        ])
        .returning()
    ).map((r) => r.id);
    // Last weekend's sides: H Grade finalised (Ava C, Ben WK, Cal 12th); I Grade a
    // draft with Dan; J Grade two sides, Finn on Saturday and Gus on Sunday.
    const side = async (fixtureId: number, slots: ReturnType<typeof twelve>, extra = {}) => {
      const [row] = await db
        .insert(selectionsTable)
        .values({ tenantId, roundId: w1, fixtureId, slots, ...extra })
        .returning();
      return row.id;
    };
    prior.h = await side(
      await fixture(tenantId, "H Grade", "2026-11-07T04:30:00Z"),
      twelve([id("Ava Hill"), id("Ben Cole"), ...Array(9).fill(null), id("Cal Dunn")]),
      { state: "final", captainMemberId: id("Ava Hill"), keeperMemberId: id("Ben Cole") },
    );
    await side(
      await fixture(tenantId, "I Grade", "2026-11-07T02:00:00Z"),
      twelve([id("Dan Ford")]),
    );
    prior.jSat = await side(
      await fixture(tenantId, "J Grade", "2026-11-07T01:00:00Z"),
      twelve([id("Finn Hart")]),
    );
    prior.jSun = await side(
      await fixture(tenantId, "J Grade", "2026-11-08T01:00:00Z"),
      twelve([id("Gus Ives")]),
    );
    // I Grade played midweek since, without the Hub: that team list is newer.
    fx.iMid = await fixture(tenantId, "I Grade", "2026-11-11T09:00:00Z");
    await teamList(fx.iMid, [{ order: 1, displayName: "Eli Grant" }]);

    fx.h2 = await fixture(tenantId, "H Grade", "2026-11-14T04:30:00Z");
    fx.i2 = await fixture(tenantId, "I Grade", "2026-11-14T02:00:00Z");
    fx.jSat2 = await fixture(tenantId, "J Grade", "2026-11-14T01:00:00Z");
    fx.jSun2 = await fixture(tenantId, "J Grade", "2026-11-15T01:00:00Z");
    // Ben said No this weekend.
    await db.insert(availabilityResponsesTable).values({
      tenantId,
      roundId: w2,
      memberId: id("Ben Cole"),
      date: W2,
      status: "no",
    });
  });

  it("two runs at once draft each side exactly once", async () => {
    const [a, b] = await Promise.all([
      buildRoundDrafts(tenantId, w2, NOW),
      buildRoundDrafts(tenantId, w2, NOW),
    ]);
    expect(a.created + b.created).toBe(4);
    const rows = await db.select().from(selectionsTable).where(eq(selectionsTable.roundId, w2));
    expect(rows).toHaveLength(4);
  });

  it("starts from last weekend's side slot for slot, keeping a No player and the roles", async () => {
    const s = await selectionFor(fx.h2);
    expect(s.slots.map((x) => x.memberId)).toEqual([
      id("Ava Hill"),
      id("Ben Cole"),
      ...Array(9).fill(null),
      id("Cal Dunn"),
    ]);
    expect(s.captainMemberId).toBe(id("Ava Hill"));
    expect(s.keeperMemberId).toBe(id("Ben Cole"));
    const [event] = await db
      .select()
      .from(selectionEventsTable)
      .where(eq(selectionEventsTable.selectionId, s.id));
    expect(event.detail).toMatchObject({
      seededFrom: { kind: "selection", id: prior.h, fixtureId: expect.any(Number) },
    });
  });

  it("takes a newer team list over an older selection", async () => {
    const s = await selectionFor(fx.i2);
    expect(s.slots[0]).toEqual({ memberId: id("Eli Grant") });
  });

  it("maps a grade's sides in fixture order", async () => {
    expect((await selectionFor(fx.jSat2)).slots[0]).toEqual({ memberId: id("Finn Hart") });
    expect((await selectionFor(fx.jSun2)).slots[0]).toEqual({ memberId: id("Gus Ives") });
  });
});
