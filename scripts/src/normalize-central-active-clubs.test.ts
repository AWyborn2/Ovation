/**
 * normalize-central-active-clubs.test.ts — unit tests for the central club
 * `active_to` normaliser + onboarding guard. Pure logic + a mock-psql
 * integration; no live database.
 *
 * Run from the api-server vitest install (scripts has no vitest devDep):
 *   cd scripts
 *   node ../artifacts/api-server/node_modules/vitest/vitest.mjs run src/normalize-central-active-clubs.test.ts
 */
import { describe, expect, it, vi } from "vitest";
import {
  NORMALIZE_SQL,
  GUARD_SQL,
  parseGuardOutput,
  parseUpdateCount,
  assertProvisionable,
  normalizeCentralActiveClubs,
} from "./normalize-central-active-clubs.js";

// ---------------------------------------------------------------------------
// SQL shape
// ---------------------------------------------------------------------------

describe("NORMALIZE_SQL", () => {
  it("only NULLs the latest-season clubs, leaving earlier (folded) ones", () => {
    expect(NORMALIZE_SQL).toContain("SET active_to = NULL");
    expect(NORMALIZE_SQL).toContain("active_to = (SELECT max(active_to) FROM central.clubs)");
    // Must not blank the whole table.
    expect(NORMALIZE_SQL).toContain("active_to IS NOT NULL");
    expect(NORMALIZE_SQL).not.toMatch(/SET active_to = NULL\s*$/);
  });
});

describe("GUARD_SQL", () => {
  it("counts provisionable (NULL active_to) and total clubs", () => {
    expect(GUARD_SQL).toContain("FILTER (WHERE active_to IS NULL)");
    expect(GUARD_SQL).toContain("FROM central.clubs");
  });
});

// ---------------------------------------------------------------------------
// parseGuardOutput
// ---------------------------------------------------------------------------

describe("parseGuardOutput", () => {
  it("parses `provisionable|total` from psql -A -t", () => {
    expect(parseGuardOutput("8|27")).toEqual({ provisionable: 8, total: 27 });
  });

  it("tolerates surrounding whitespace and trailing newline", () => {
    expect(parseGuardOutput("  8|27  \n")).toEqual({
      provisionable: 8,
      total: 27,
    });
  });

  it("handles the all-stamped case (0 provisionable)", () => {
    expect(parseGuardOutput("0|27")).toEqual({ provisionable: 0, total: 27 });
  });

  it("handles the empty register", () => {
    expect(parseGuardOutput("0|0")).toEqual({ provisionable: 0, total: 0 });
  });

  it("throws on unparseable output", () => {
    expect(() => parseGuardOutput("ERROR: relation does not exist")).toThrow(
      /Could not parse club counts/,
    );
  });
});

// ---------------------------------------------------------------------------
// parseUpdateCount
// ---------------------------------------------------------------------------

describe("parseUpdateCount", () => {
  it("reads the row count from an UPDATE command tag", () => {
    expect(parseUpdateCount("UPDATE 14")).toBe(14);
  });

  it("returns 0 when nothing was updated", () => {
    expect(parseUpdateCount("UPDATE 0")).toBe(0);
  });

  it("returns 0 when there is no command tag", () => {
    expect(parseUpdateCount("")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// assertProvisionable (the guard)
// ---------------------------------------------------------------------------

describe("assertProvisionable", () => {
  it("passes when at least one club is provisionable", () => {
    expect(() => assertProvisionable({ provisionable: 8, total: 27 })).not.toThrow();
  });

  it("throws — clubs exist but none provisionable (the empty-picker bug)", () => {
    expect(() => assertProvisionable({ provisionable: 0, total: 27 })).toThrow(
      /0 are provisionable/,
    );
  });

  it("throws — empty register", () => {
    expect(() => assertProvisionable({ provisionable: 0, total: 0 })).toThrow(
      /central\.clubs is empty/,
    );
  });
});

// ---------------------------------------------------------------------------
// normalizeCentralActiveClubs (mock psql)
// ---------------------------------------------------------------------------

describe("normalizeCentralActiveClubs", () => {
  it("normalises then guards: UPDATE runs, guard passes", () => {
    const calls: string[] = [];
    const psql = (sql: string): string => {
      calls.push(sql);
      return sql === NORMALIZE_SQL ? "UPDATE 14" : "8|27";
    };

    const counts = normalizeCentralActiveClubs(psql);

    expect(counts).toEqual({ provisionable: 8, total: 27 });
    expect(calls[0]).toBe(NORMALIZE_SQL);
    expect(calls[1]).toBe(GUARD_SQL);
    expect(calls).toHaveLength(2);
  });

  it("checkOnly skips the UPDATE and only runs the guard", () => {
    const calls: string[] = [];
    const psql = (sql: string): string => {
      calls.push(sql);
      return "8|27";
    };

    normalizeCentralActiveClubs(psql, { checkOnly: true });

    expect(calls).toEqual([GUARD_SQL]);
  });

  it("still throws when normalisation leaves nothing provisionable", () => {
    // e.g. a load where every club shares one season label that the UPDATE
    // then NULLs, but the guard is what a broken/empty load trips.
    const psql = (sql: string): string => (sql === NORMALIZE_SQL ? "UPDATE 0" : "0|27");

    expect(() => normalizeCentralActiveClubs(psql)).toThrow(/0 are provisionable/);
  });

  it("checkOnly surfaces the empty-picker state without writing", () => {
    const write = vi.fn();
    const psql = (sql: string): string => {
      if (sql === NORMALIZE_SQL) write();
      return "0|27";
    };

    expect(() => normalizeCentralActiveClubs(psql, { checkOnly: true })).toThrow(
      /0 are provisionable/,
    );
    expect(write).not.toHaveBeenCalled();
  });
});
