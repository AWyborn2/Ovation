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
 * The cut-off draft builder against real Postgres (plan 2026-10-06-002 U6):
 * one draft per fixture in the round's Friday–Sunday window, seeded from the
 * grade's most recent earlier team list (AE1), a grade's second fixture of the
 * weekend starting empty, re-runs creating nothing, other tenants untouched.
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

  it("seeds A Grade from last week's side with labelled gaps (AE1, R37)", async () => {
    const s = await selectionFor(fx.a);
    expect(s).toMatchObject({ roundId, state: "draft", version: 1 });
    expect(s.slots).toHaveLength(11);
    expect(s.slots[0]).toEqual({ memberId: memberIds.get("Ava Hill") });
    expect(s.slots[1]).toEqual({ memberId: null, gap: { name: "Ben Cole", reason: "no" } });
    expect(s.slots[2]).toEqual({ memberId: null, gap: { name: "Cal Dunn", reason: "no" } });
    expect(s.slots[5]).toEqual({ memberId: null, gap: { name: "Finn Hart", reason: "maybe" } });
    expect(s.slots[9]).toEqual({ memberId: null, gap: { name: "J. Hale", reason: "no_reply" } });
    expect(s.slots.filter((x) => x.memberId != null)).toHaveLength(7);
    expect(s.captainMemberId).toBe(memberIds.get("Ava Hill"));
    expect(s.keeperMemberId).toBeNull();
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
    // Bo Ray is away for the weekend (recorded as No); Cy Ash said Yes.
    expect(sat.slots[0]).toEqual({ memberId: null, gap: { name: "Bo Ray", reason: "no" } });
    expect(sat.slots[1]).toEqual({ memberId: memberIds.get("Cy Ash") });
    expect(sat.slots.slice(2).every((x) => x.memberId == null && !x.gap)).toBe(true);

    const sun = await selectionFor(fx.bSun);
    expect(sun.slots).toEqual(Array.from({ length: 11 }, () => ({ memberId: null })));
    const c = await selectionFor(fx.c);
    expect(c.slots).toEqual(Array.from({ length: 11 }, () => ({ memberId: null })));
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
    expect(events[0]).toMatchObject({ actorKind: "system", action: "draft" });
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

  it("does nothing for another tenant's round", async () => {
    await expect(buildRoundDrafts(otherTenantId, roundId, NOW)).resolves.toMatchObject({
      created: 0,
      skipped: 0,
    });
    expect(await selectionFor(fx.other)).toBeUndefined();
  });
});
