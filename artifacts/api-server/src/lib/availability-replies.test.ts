import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  squadMembersTable,
  availabilityRoundsTable,
  availabilityResponsesTable,
  selectionEventsTable,
} from "@workspace/db";
import { writeReplies } from "./availability-replies";
import { purgeTestTenants } from "./tenant-purge.test-helpers";

/**
 * The shared availability write path (ADR-008, migration 0046): a member's own
 * answer and an answer an admin recorded in the Hub land in the same row, the
 * latest wins, and a member's later answer clears who set it. Also the 0046
 * selection_events shape: a round-level event needs no side, but an event must
 * name a side or a round.
 *
 * Real-DB integration test (needs DATABASE_URL with migrations applied; CI's
 * api-tests job provides it).
 */

const STAMP = Date.now();

describe("writeReplies (migration 0046)", () => {
  let tenantId: number;
  let memberId: number;
  let roundId: number;

  const rows = () =>
    db
      .select()
      .from(availabilityResponsesTable)
      .where(
        and(
          eq(availabilityResponsesTable.roundId, roundId),
          eq(availabilityResponsesTable.memberId, memberId),
        ),
      );

  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({ slug: `replies-${STAMP}`, centralClubId: 8852, name: "Replies", plan: "pilot" })
      .returning();
    tenantId = tenant.id;
    const [member] = await db
      .insert(squadMembersTable)
      .values({ tenantId, firstName: "Robin", lastName: "Ash", section: "senior" })
      .returning();
    memberId = member.id;
    const [round] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId, weekendDate: "2026-10-24" })
      .returning();
    roundId = round.id;
  });

  afterAll(async () => {
    await purgeTestTenants([tenantId]);
  });

  it("defaults existing-style rows to a member's answer", async () => {
    await writeReplies({
      tenantId,
      roundId,
      memberId,
      answers: [{ date: "2026-10-24", status: "maybe", note: " ring me " }],
      late: false,
      by: { source: "member", slot: "account" },
      now: new Date(),
    });
    const [r] = await rows();
    expect(r).toMatchObject({
      status: "maybe",
      note: "ring me",
      source: "member",
      respondedBySlot: "account",
      setByAdminId: null,
      setByName: null,
    });
  });

  it("records an admin-set answer over it, keeping the note when none is sent", async () => {
    await writeReplies({
      tenantId,
      roundId,
      memberId,
      answers: [{ date: "2026-10-24", status: "yes" }],
      late: true,
      by: { source: "admin", adminId: 7, name: "Jo Selector" },
      now: new Date(),
    });
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      status: "yes",
      note: "ring me",
      source: "admin",
      respondedBySlot: null,
      setByAdminId: 7,
      setByName: "Jo Selector",
      late: true,
    });
  });

  it("lets the member's own later answer replace it and clear who set it", async () => {
    await writeReplies({
      tenantId,
      roundId,
      memberId,
      answers: [{ date: "2026-10-24", status: "no", note: null }],
      late: true,
      by: { source: "member", slot: "account" },
      now: new Date(),
    });
    const [r] = await rows();
    expect(r).toMatchObject({
      status: "no",
      note: null,
      source: "member",
      respondedBySlot: "account",
      setByAdminId: null,
      setByName: null,
    });
  });

  it("rejects an unknown source", async () => {
    await expect(
      db.insert(availabilityResponsesTable).values({
        tenantId,
        roundId,
        memberId,
        date: "2026-10-25",
        status: "yes",
        source: "robot" as never,
      }),
    ).rejects.toThrow();
  });

  it("stores a round-level selection event, but not one naming neither side nor round", async () => {
    const [e] = await db
      .insert(selectionEventsTable)
      .values({ tenantId, roundId, actorKind: "admin", action: "status_set" })
      .returning();
    expect(e.selectionId).toBeNull();
    await expect(
      db.insert(selectionEventsTable).values({ tenantId, actorKind: "admin", action: "x" }),
    ).rejects.toThrow();
  });
});
