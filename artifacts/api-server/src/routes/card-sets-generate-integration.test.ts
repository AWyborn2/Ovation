import { describe, it, expect, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, cardSetsTable } from "@workspace/db";
import { NATIVE_STATS_TENANT_ID } from "../lib/tenant";
import { upsertGeneratedCardSet } from "../lib/card-set-generate-store";

/**
 * C3 (N3) — DB-backed integration test for generated carousel sets.
 *
 * Exercises the upsert transaction that the DB-free unit suite cannot: generate
 * a match-summary set, then regenerate the SAME (kind + grouping key) and
 * assert exactly ONE card_sets row exists (regenerate UPDATED it, not
 * duplicated) and its publish state is preserved. `upsertGeneratedCardSet` is
 * the one implementation behind both POST /card-sets/generate and
 * POST /card-sets/autoseed, so it is exercised directly here with a per-run
 * grade string; cleanup only touches this suite's own rows.
 *
 * Real-DB integration test (needs DATABASE_URL) — skipped in the no-DATABASE_URL
 * sandbox, runs in CI's API integration suite.
 */

const STAMP = Date.now();
const TEST_GRADE = `C3 Test Grade ${STAMP}`;
const KEY = { sourceKind: "matchSummary", season: 2099, sourceRound: 1, grade: TEST_GRADE };

describe("card-sets generate: idempotent regeneration (upsert)", () => {
  const tenantId = NATIVE_STATS_TENANT_ID;
  const where = () =>
    and(
      eq(cardSetsTable.tenantId, tenantId),
      eq(cardSetsTable.sourceKind, KEY.sourceKind),
      eq(cardSetsTable.season, KEY.season),
      eq(cardSetsTable.sourceRound, KEY.sourceRound),
      eq(cardSetsTable.grade, KEY.grade),
    );
  const slide = (title: string) => ({ kind: "matchSummary", matchTitle: title });

  afterAll(async () => {
    await db.delete(cardSetsTable).where(where());
  });

  it("regenerating the same group updates one row and preserves publish state", async () => {
    // First generation → a new draft set with one slide.
    const first = await upsertGeneratedCardSet(tenantId, KEY, {
      name: `${TEST_GRADE} • Round 1`,
      platformSize: "square",
      inputs: [slide("one")],
    });
    expect(first.row.sourceKind).toBe("matchSummary");
    expect(first.row.isPublished).toBe(false);
    expect(first.row.slides).toHaveLength(1);
    expect(first.truncated).toBe(0);

    // Simulate the admin publishing the set (bypassing the 2-slide publish floor
    // — we only care that regeneration doesn't reset the flag).
    await db
      .update(cardSetsTable)
      .set({ isPublished: true })
      .where(eq(cardSetsTable.id, first.row.id));

    // Second generation of the SAME group → must update the SAME row.
    const second = await upsertGeneratedCardSet(tenantId, KEY, {
      name: `${TEST_GRADE} • Round 1`,
      platformSize: "square",
      inputs: [slide("one"), slide("two")],
    });
    expect(second.row.id).toBe(first.row.id); // same row, not a duplicate
    expect(second.row.isPublished).toBe(true); // publish state preserved
    expect(second.row.slides).toHaveLength(2);

    const rows = await db.select({ id: cardSetsTable.id }).from(cardSetsTable).where(where());
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.row.id);
  });
});
