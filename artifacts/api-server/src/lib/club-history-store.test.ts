import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  tenantsTable,
  clubHistoryBatchesTable,
  clubHistoryBatchCoverageTable,
  clubHistoryRowsTable,
  clubHistoryBoundariesTable,
  clubCorrectionsTable,
} from "@workspace/db";
import { purgeTestTenants } from "./tenant-purge.test-helpers";

/**
 * Club history store (hybrid stats plan U9, migration 0021) against real
 * Postgres: batch coverage, cascade undo, the corrections journal's required
 * fields and one-active-row index, tenant scoping, and re-applying 0021.
 *
 * Real-DB integration test (needs DATABASE_URL with migrations applied; CI's
 * api-tests job provides it). No route reads these tables yet (U10).
 */

const STAMP = Date.now();
const DEFAULT_TENANT_ID = 1;
const MATCH = `test-ch-match-${STAMP}`;
const GUID = `test-ch-guid-${STAMP}`;

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

const NOT_NULL = "23502";
const UNIQUE = "23505";
const CHECK = "23514";

describe("club history store (migration 0021)", () => {
  let tenantBId: number;
  const tenant1Batches: number[] = [];
  const tenant1Corrections: number[] = [];

  beforeAll(async () => {
    const [tenantB] = await db
      .insert(tenantsTable)
      .values({ slug: `ch-b-${STAMP}`, centralClubId: 8841, name: "CH Tenant B", plan: "pilot" })
      .returning();
    tenantBId = tenantB.id;
  });

  afterAll(async () => {
    if (tenant1Batches.length > 0)
      await db
        .delete(clubHistoryBatchesTable)
        .where(inArray(clubHistoryBatchesTable.id, tenant1Batches));
    if (tenant1Corrections.length > 0)
      await db
        .delete(clubCorrectionsTable)
        .where(inArray(clubCorrectionsTable.id, tenant1Corrections));
    await purgeTestTenants([tenantBId]);
  });

  async function batch(tenantId: number, label: string): Promise<number> {
    const [b] = await db
      .insert(clubHistoryBatchesTable)
      .values({ tenantId, source: "test", label, createdBy: "test" })
      .returning();
    if (tenantId === DEFAULT_TENANT_ID) tenant1Batches.push(b.id);
    return b.id;
  }

  it("a batch covering two grades records both", async () => {
    const id = await batch(tenantBId, "two grades");
    await db.insert(clubHistoryBatchCoverageTable).values([
      { tenantId: tenantBId, batchId: id, grade: "A Grade", season: 1998 },
      { tenantId: tenantBId, batchId: id, grade: "B Grade", season: 1998 },
      { tenantId: tenantBId, batchId: id, grade: "B Grade", season: null },
    ]);
    const rows = await db
      .select()
      .from(clubHistoryBatchCoverageTable)
      .where(eq(clubHistoryBatchCoverageTable.batchId, id));
    expect(new Set(rows.map((r) => r.grade))).toEqual(new Set(["A Grade", "B Grade"]));
    // (batch, grade, NULL season) is unique too: NULLS NOT DISTINCT.
    await expectPgError(
      db
        .insert(clubHistoryBatchCoverageTable)
        .values({ tenantId: tenantBId, batchId: id, grade: "B Grade", season: null }),
      UNIQUE,
    );
  });

  it("deleting a batch removes its rows and coverage only", async () => {
    const undo = await batch(tenantBId, "to undo");
    const keep = await batch(tenantBId, "to keep");
    await db.insert(clubHistoryRowsTable).values([
      {
        tenantId: tenantBId,
        batchId: undo,
        playerId: 1,
        grade: "A Grade",
        season: 1990,
        grain: "season",
        runs: 400,
      },
      {
        tenantId: tenantBId,
        batchId: undo,
        playerId: 2,
        grade: "A Grade",
        season: null,
        grain: "career",
        runs: 3000,
      },
      {
        tenantId: tenantBId,
        batchId: keep,
        playerId: 1,
        grade: "A Grade",
        season: 1991,
        grain: "season",
        runs: 250,
      },
    ]);
    await db
      .insert(clubHistoryBatchCoverageTable)
      .values({ tenantId: tenantBId, batchId: undo, grade: "A Grade", season: 1990 });

    await db.delete(clubHistoryBatchesTable).where(eq(clubHistoryBatchesTable.id, undo));

    const left = await db
      .select({ batchId: clubHistoryRowsTable.batchId, runs: clubHistoryRowsTable.runs })
      .from(clubHistoryRowsTable)
      .where(inArray(clubHistoryRowsTable.batchId, [undo, keep]));
    expect(left).toEqual([{ batchId: keep, runs: 250 }]);
    const coverage = await db
      .select()
      .from(clubHistoryBatchCoverageTable)
      .where(eq(clubHistoryBatchCoverageTable.batchId, undo));
    expect(coverage).toEqual([]);
  });

  it("enforces the grain rules", async () => {
    const id = await batch(tenantBId, "grain rules");
    const base = { tenantId: tenantBId, batchId: id, playerId: 3, grade: "A Grade" };
    // Career rows have no season; season/match rows need one.
    await expectPgError(
      db.insert(clubHistoryRowsTable).values({ ...base, season: 1990, grain: "career" }),
      CHECK,
    );
    await expectPgError(
      db.insert(clubHistoryRowsTable).values({ ...base, season: null, grain: "season" }),
      CHECK,
    );
    // A match descriptor only on match rows.
    await expectPgError(
      db
        .insert(clubHistoryRowsTable)
        .values({ ...base, season: 1990, grain: "season", opponent: "Rivals CC" }),
      CHECK,
    );
    await db.insert(clubHistoryRowsTable).values({
      ...base,
      season: 1990,
      grain: "match",
      matchDate: "1990-11-03",
      opponent: "Rivals CC",
      round: "4",
      runs: 101,
    });
  });

  it("a correction requires a match id, GUID, field and previous value", async () => {
    const full = {
      tenantId: tenantBId,
      playhqMatchId: MATCH,
      participantId: GUID,
      field: "runs" as const,
      previousValue: 12,
      newValue: 21,
      createdBy: "test",
    };
    for (const missing of ["playhqMatchId", "participantId", "field", "previousValue"] as const) {
      const { [missing]: _omit, ...rest } = full;
      await expectPgError(db.insert(clubCorrectionsTable).values(rest as typeof full), NOT_NULL);
    }
    // Blank identity, an unknown field, or a no-op value are rejected too.
    await expectPgError(
      db.insert(clubCorrectionsTable).values({ ...full, playhqMatchId: " " }),
      CHECK,
    );
    await expectPgError(
      db
        .insert(clubCorrectionsTable)
        .values({ ...full, field: "dismissal" as unknown as typeof full.field }),
      CHECK,
    );
    await expectPgError(
      db.insert(clubCorrectionsTable).values({ ...full, newValue: full.previousValue }),
      CHECK,
    );
  });

  it("only one active correction per (tenant, match, participant, field)", async () => {
    const row = {
      tenantId: tenantBId,
      playhqMatchId: MATCH,
      participantId: GUID,
      field: "wickets" as const,
      previousValue: 2,
      newValue: 3,
      createdBy: "test",
    };
    const [first] = await db.insert(clubCorrectionsTable).values(row).returning();
    await expectPgError(db.insert(clubCorrectionsTable).values({ ...row, newValue: 4 }), UNIQUE);
    // Another field on the same line is independent.
    await db.insert(clubCorrectionsTable).values({ ...row, field: "maidens", newValue: 1 });
    // Reversing the first frees the slot; the reversed row stays as history.
    await db
      .update(clubCorrectionsTable)
      .set({ removedAt: new Date(), removedBy: "test" })
      .where(eq(clubCorrectionsTable.id, first.id));
    await db.insert(clubCorrectionsTable).values({ ...row, newValue: 4 });
    const wickets = await db
      .select()
      .from(clubCorrectionsTable)
      .where(
        and(
          eq(clubCorrectionsTable.tenantId, tenantBId),
          eq(clubCorrectionsTable.field, "wickets"),
        ),
      );
    expect(wickets).toHaveLength(2);
    expect(wickets.filter((w) => w.removedAt === null).map((w) => w.newValue)).toEqual([4]);
  });

  it("one club default and one override per grade", async () => {
    await db.insert(clubHistoryBoundariesTable).values([
      { tenantId: tenantBId, grade: null, startSeason: 2003 },
      { tenantId: tenantBId, grade: "B Grade", startSeason: 2004 },
    ]);
    await expectPgError(
      db
        .insert(clubHistoryBoundariesTable)
        .values({ tenantId: tenantBId, grade: null, startSeason: 2005 }),
      UNIQUE,
    );
    await expectPgError(
      db
        .insert(clubHistoryBoundariesTable)
        .values({ tenantId: tenantBId, grade: "C Grade", startSeason: 3003 }),
      CHECK,
    );
  });

  it("a tenant-2 scoped query never returns tenant-1 rows", async () => {
    const t1 = await batch(DEFAULT_TENANT_ID, "tenant 1 history");
    await db.insert(clubHistoryRowsTable).values({
      tenantId: DEFAULT_TENANT_ID,
      batchId: t1,
      playerId: 1,
      grade: "A Grade",
      season: 1990,
      grain: "season",
      runs: 999,
    });
    const [c1] = await db
      .insert(clubCorrectionsTable)
      .values({
        tenantId: DEFAULT_TENANT_ID,
        playhqMatchId: MATCH,
        participantId: GUID,
        field: "wickets",
        previousValue: 2,
        newValue: 5,
        createdBy: "test",
      })
      .returning();
    tenant1Corrections.push(c1.id);

    const rowsB = await db
      .select()
      .from(clubHistoryRowsTable)
      .where(eq(clubHistoryRowsTable.tenantId, tenantBId));
    expect(rowsB.length).toBeGreaterThan(0);
    expect(rowsB.every((r) => r.tenantId === tenantBId)).toBe(true);
    expect(rowsB.some((r) => r.batchId === t1)).toBe(false);

    const batchesB = await db
      .select()
      .from(clubHistoryBatchesTable)
      .where(eq(clubHistoryBatchesTable.tenantId, tenantBId));
    expect(batchesB.some((b) => b.id === t1)).toBe(false);

    // Same (match, participant, field) active in both tenants: no collision,
    // and tenant B's scoped read sees only its own.
    const activeB = await db
      .select()
      .from(clubCorrectionsTable)
      .where(
        and(
          eq(clubCorrectionsTable.tenantId, tenantBId),
          eq(clubCorrectionsTable.playhqMatchId, MATCH),
          isNull(clubCorrectionsTable.removedAt),
        ),
      );
    expect(activeB.every((c) => c.tenantId === tenantBId)).toBe(true);
    expect(activeB.some((c) => c.id === c1.id)).toBe(false);
  });

  it("re-applying migration 0021 is a no-op", async () => {
    const count = async () =>
      (
        await db.execute<{ n: string }>(
          sql`select count(*)::text as n from club_history_rows where tenant_id = ${tenantBId}`,
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
        "0021_club_history_store.sql",
      ),
      "utf8",
    );
    for (const statement of file.split("--> statement-breakpoint")) {
      if (statement.replace(/--.*$/gm, "").trim()) await db.execute(sql.raw(statement));
    }
    expect(await count()).toBe(before);
  });
});
