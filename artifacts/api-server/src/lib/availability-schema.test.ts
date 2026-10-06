import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import {
  db,
  tenantsTable,
  fixturesTable,
  squadMembersTable,
  availabilitySettingsTable,
  availabilityRoundsTable,
  availabilityRequestsTable,
  availabilityTokensTable,
  availabilityResponsesTable,
  availabilityAwayTable,
  selectionsTable,
  selectionEventsTable,
} from "@workspace/db";
import { purgeTestTenants } from "./tenant-purge.test-helpers";

/**
 * Availability and Selection Hub schema (plan 2026-10-06-002 U1, migration
 * 0032) against real Postgres: the uniques the scheduler and Hub rely on, the
 * cascades from fixture and round, the settings defaults (off until a club
 * opts in, KTD11), tenant purge reaching every new table, and re-applying 0032.
 *
 * Real-DB integration test (needs DATABASE_URL with migrations applied; CI's
 * api-tests job provides it).
 */

const STAMP = Date.now();

/** Postgres SQLSTATE of a failed query, through drizzle's error wrapper. */
function pgCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 5 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, `expected SQLSTATE ${code}`).toBeDefined();
  expect(pgCode(caught)).toBe(code);
}

const UNIQUE = "23505";
const CHECK = "23514";

describe("availability and selection schema (migration 0032)", () => {
  let tenantId: number;
  let memberId: number;
  let roundId: number;

  const newFixture = async (grade = "A Grade") => {
    const [f] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade,
        opponentName: "Test Opponents",
        startAt: new Date("2026-10-10T01:30:00Z"),
      })
      .returning();
    return f;
  };

  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({ slug: `avail-${STAMP}`, centralClubId: 8851, name: "Avail Tenant", plan: "pilot" })
      .returning();
    tenantId = tenant.id;
    const [member] = await db
      .insert(squadMembersTable)
      .values({ tenantId, playhqProfileId: `p-${STAMP}`, firstName: "Jo", lastName: "Hale" })
      .returning();
    memberId = member.id;
    const [round] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId, weekendDate: "2026-10-10" })
      .returning();
    roundId = round.id;
  });

  afterAll(async () => {
    await purgeTestTenants([tenantId]);
  });

  it("settings default to off, with the documented weekly rhythm", async () => {
    const [s] = await db.insert(availabilitySettingsTable).values({ tenantId }).returning();
    expect(s).toMatchObject({
      enabled: false,
      smsEnabled: true,
      sendDow: 1,
      sendTime: "18:00",
      reminderDow: 3,
      reminderTime: "18:00",
      cutoffDow: 4,
      cutoffTime: "18:00",
      finaliseDow: 5,
      finaliseTime: "20:00",
      selectionRule: "captains_own_grade",
    });
    // One settings row per tenant.
    await expectPgError(db.insert(availabilitySettingsTable).values({ tenantId }), UNIQUE);
  });

  it("rejects an out-of-range day and an unknown selection rule", async () => {
    await expectPgError(
      db.execute(sql`update availability_settings set send_dow = 7 where tenant_id = ${tenantId}`),
      CHECK,
    );
    await expectPgError(
      db.execute(
        sql`update availability_settings set selection_rule = 'anyone' where tenant_id = ${tenantId}`,
      ),
      CHECK,
    );
  });

  it("one member per PlayHQ profile per tenant; hand-added members may repeat a null id", async () => {
    await expectPgError(
      db
        .insert(squadMembersTable)
        .values({ tenantId, playhqProfileId: `p-${STAMP}`, firstName: "Jo", lastName: "Dup" }),
      UNIQUE,
    );
    const rows = await db
      .insert(squadMembersTable)
      .values([
        { tenantId, firstName: "Hand", lastName: "One" },
        { tenantId, firstName: "Hand", lastName: "Two" },
      ])
      .returning();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ section: "senior", active: true, accountSmsOptOut: false });
  });

  it("one round per tenant per weekend", async () => {
    await expectPgError(
      db.insert(availabilityRoundsTable).values({ tenantId, weekendDate: "2026-10-10" }),
      UNIQUE,
    );
  });

  it("one request per (round, member, recipient slot); tokens are unique by hash", async () => {
    const [req] = await db
      .insert(availabilityRequestsTable)
      .values({ tenantId, roundId, memberId, recipientSlot: "account" })
      .returning();
    await expectPgError(
      db
        .insert(availabilityRequestsTable)
        .values({ tenantId, roundId, memberId, recipientSlot: "account" }),
      UNIQUE,
    );
    const expiresAt = new Date("2026-10-12T00:00:00Z");
    // Several live tokens per request (one per message, KTD5).
    await db.insert(availabilityTokensTable).values([
      { tenantId, requestId: req.id, tokenHash: `h1-${STAMP}`, expiresAt },
      { tenantId, requestId: req.id, tokenHash: `h2-${STAMP}`, expiresAt },
    ]);
    await expectPgError(
      db
        .insert(availabilityTokensTable)
        .values({ tenantId, requestId: req.id, tokenHash: `h1-${STAMP}`, expiresAt }),
      UNIQUE,
    );
  });

  it("a second response for the same (round, member, date) violates the unique index", async () => {
    await db
      .insert(availabilityResponsesTable)
      .values({ tenantId, roundId, memberId, date: "2026-10-10", status: "yes" });
    await expectPgError(
      db
        .insert(availabilityResponsesTable)
        .values({ tenantId, roundId, memberId, date: "2026-10-10", status: "no" }),
      UNIQUE,
    );
    // Sunday is a separate answer.
    await db
      .insert(availabilityResponsesTable)
      .values({ tenantId, roundId, memberId, date: "2026-10-11", status: "maybe" });
    await expectPgError(
      db
        .insert(availabilityResponsesTable)
        .values({ tenantId, roundId, memberId, date: "2026-10-12", status: "perhaps" as "yes" }),
      CHECK,
    );
  });

  it("an away period must not end before it starts", async () => {
    await db
      .insert(availabilityAwayTable)
      .values({ tenantId, memberId, fromDate: "2026-11-01", toDate: "2026-11-14" });
    await expectPgError(
      db
        .insert(availabilityAwayTable)
        .values({ tenantId, memberId, fromDate: "2026-11-14", toDate: "2026-11-01" }),
      CHECK,
    );
  });

  it("a second selection for the same fixture violates the unique index", async () => {
    const fixture = await newFixture();
    const [sel] = await db
      .insert(selectionsTable)
      .values({ tenantId, roundId, fixtureId: fixture.id, slots: [{ memberId }] })
      .returning();
    expect(sel).toMatchObject({ state: "draft", version: 1, notifiedMemberIds: [] });
    await expectPgError(
      db.insert(selectionsTable).values({ tenantId, roundId, fixtureId: fixture.id }),
      UNIQUE,
    );
  });

  it("deleting a fixture removes its selection and the selection's events", async () => {
    const fixture = await newFixture("B Grade");
    const [sel] = await db
      .insert(selectionsTable)
      .values({
        tenantId,
        roundId,
        fixtureId: fixture.id,
        slots: [{ memberId: null, gap: { name: "J. Hale", reason: "no_reply" } }],
        captainMemberId: memberId,
      })
      .returning();
    await db
      .insert(selectionEventsTable)
      .values({ tenantId, selectionId: sel.id, actorKind: "system", action: "draft" });

    await db.delete(fixturesTable).where(eq(fixturesTable.id, fixture.id));

    expect(await db.select().from(selectionsTable).where(eq(selectionsTable.id, sel.id))).toEqual(
      [],
    );
    expect(
      await db
        .select()
        .from(selectionEventsTable)
        .where(eq(selectionEventsTable.selectionId, sel.id)),
    ).toEqual([]);
  });

  it("deleting a member clears them as captain without deleting the side", async () => {
    const fixture = await newFixture("C Grade");
    const [extra] = await db
      .insert(squadMembersTable)
      .values({ tenantId, firstName: "Tom", lastName: "Brooks" })
      .returning();
    const [sel] = await db
      .insert(selectionsTable)
      .values({
        tenantId,
        roundId,
        fixtureId: fixture.id,
        captainMemberId: extra.id,
        keeperMemberId: extra.id,
      })
      .returning();
    await db.delete(squadMembersTable).where(eq(squadMembersTable.id, extra.id));
    const [after] = await db.select().from(selectionsTable).where(eq(selectionsTable.id, sel.id));
    expect(after).toMatchObject({ captainMemberId: null, keeperMemberId: null });
  });

  it("re-applying migration 0032 is a no-op", async () => {
    const count = async () =>
      (
        await db.execute<{ n: string }>(
          sql`select count(*)::text as n from squad_members where tenant_id = ${tenantId}`,
        )
      ).rows[0]?.n;
    const before = await count();
    const file = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "lib",
        "db",
        "migrations",
        "0032_availability_selection.sql",
      ),
      "utf8",
    );
    for (const statement of file.split("--> statement-breakpoint")) {
      if (statement.replace(/--.*$/gm, "").trim()) await db.execute(sql.raw(statement));
    }
    expect(await count()).toBe(before);
  });

  it("purging a test tenant removes its rows from every new table", async () => {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `avail-p-${STAMP}`,
        centralClubId: 8852,
        name: "Purge Tenant",
        plan: "pilot",
      })
      .returning();
    const [m] = await db
      .insert(squadMembersTable)
      .values({ tenantId: t.id, firstName: "P", lastName: "Q" })
      .returning();
    const [r] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId: t.id, weekendDate: "2026-10-17" })
      .returning();
    const [req] = await db
      .insert(availabilityRequestsTable)
      .values({ tenantId: t.id, roundId: r.id, memberId: m.id, recipientSlot: "guardian1" })
      .returning();
    await db.insert(availabilityTokensTable).values({
      tenantId: t.id,
      requestId: req.id,
      tokenHash: `hp-${STAMP}`,
      expiresAt: new Date(),
    });
    await db.insert(availabilitySettingsTable).values({ tenantId: t.id });

    await purgeTestTenants([t.id]);

    const left = await db.execute<{ n: string }>(sql`
      select (
        (select count(*) from squad_members where tenant_id = ${t.id}) +
        (select count(*) from availability_rounds where tenant_id = ${t.id}) +
        (select count(*) from availability_requests where tenant_id = ${t.id}) +
        (select count(*) from availability_tokens where tenant_id = ${t.id}) +
        (select count(*) from availability_settings where tenant_id = ${t.id}) +
        (select count(*) from tenants where id = ${t.id})
      )::text as n`);
    expect(left.rows[0]?.n).toBe("0");
  });
});
