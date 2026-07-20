/**
 * topup-clubs.test.ts — unit tests for the PCA club branding top-up logic.
 *
 * Tests the pure `computeUpdates` function and the SQL generation in
 * `buildTopUpStatements`, both without a live database connection.
 *
 * Run from the api-server vitest install (scripts has no vitest devDep):
 *   cd scripts
 *   node ../artifacts/api-server/node_modules/vitest/vitest.mjs run src/topup-clubs.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  computeUpdates,
  buildTopUpStatements,
  topUpClubs,
  type ClubBrandState,
} from "./topup-clubs.js";
import { PCA_CLUBS } from "./data/pca-clubs.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ClubBrandState with all branding columns null. */
function emptyClub(playhqOrgId: string): ClubBrandState {
  return {
    playhqOrgId,
    primaryColour: null,
    secondaryColour: null,
    tertiaryColour: null,
    quaternaryColour: null,
    logoUrl128: null,
  };
}

/** Build a ClubBrandState with all branding columns populated. */
function brandedClub(playhqOrgId: string): ClubBrandState {
  return {
    playhqOrgId,
    primaryColour: "#111111",
    secondaryColour: "#222222",
    tertiaryColour: "#333333",
    quaternaryColour: "#444444",
    logoUrl128: "https://example.com/logo.png",
  };
}

// ---------------------------------------------------------------------------
// computeUpdates
// ---------------------------------------------------------------------------

describe("computeUpdates", () => {
  it("updates colours and logo when existing club has null values", () => {
    const existing: ClubBrandState[] = [emptyClub("84fe5d06")]; // Mandurah CC
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(1);
    expect(updates[0].playhqOrgId).toBe("84fe5d06");
    expect(updates[0].name).toBe("Mandurah Cricket Club");

    const fieldMap = Object.fromEntries(updates[0].fields.map((f) => [f.column, f.value]));
    expect(fieldMap["primary_colour"]).toBe("#162850");
    expect(fieldMap["secondary_colour"]).toBe("#FFFFFF");
    expect(fieldMap["tertiary_colour"]).toBe("#384666");
    expect(fieldMap["logo_url_128"]).toContain("cloudinary");
    // Mandurah has no quaternary in the dataset
    expect(fieldMap["quaternary_colour"]).toBeUndefined();
  });

  it("updates colours and logo when existing club has empty-string values", () => {
    const existing: ClubBrandState[] = [
      {
        playhqOrgId: "84fe5d06",
        primaryColour: "",
        secondaryColour: "  ",
        tertiaryColour: "",
        quaternaryColour: null,
        logoUrl128: "",
      },
    ];
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(1);
    const columns = updates[0].fields.map((f) => f.column);
    expect(columns).toContain("primary_colour");
    expect(columns).toContain("secondary_colour");
    expect(columns).toContain("tertiary_colour");
    expect(columns).toContain("logo_url_128");
  });

  it("includes quaternary when dataset has it and DB value is null", () => {
    // Halls Head is the only club with quaternary in the dataset
    const existing: ClubBrandState[] = [emptyClub("5fe82f6b")];
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(1);
    const fieldMap = Object.fromEntries(updates[0].fields.map((f) => [f.column, f.value]));
    expect(fieldMap["quaternary_colour"]).toBe("#FFFFFF");
  });

  it("is idempotent — running on already-branded clubs produces no updates", () => {
    const existing: ClubBrandState[] = [brandedClub("84fe5d06")];
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(0);
  });

  it("does not touch existing clubs outside the PCA dataset", () => {
    const existing: ClubBrandState[] = [
      emptyClub("aaaaaaaa"), // not in PCA_CLUBS
      emptyClub("84fe5d06"), // Mandurah — in PCA_CLUBS
    ];
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(1);
    expect(updates[0].playhqOrgId).toBe("84fe5d06");
  });

  it("skips PCA clubs that are not present in the existing register", () => {
    // Provide only one club in existing — all other PCA clubs should be skipped
    const existing: ClubBrandState[] = [emptyClub("84fe5d06")];
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(1);
    expect(updates[0].playhqOrgId).toBe("84fe5d06");
  });

  it("matches on prefix when DB stores the full GUID", () => {
    const existing: ClubBrandState[] = [
      emptyClub("84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa"), // full GUID
    ];
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(1);
    expect(updates[0].playhqOrgId).toBe("84fe5d06");
  });

  it("preserves non-null existing values (partial backfill)", () => {
    const existing: ClubBrandState[] = [
      {
        playhqOrgId: "84fe5d06",
        primaryColour: "#CUSTOM1", // already set — should NOT be overwritten
        secondaryColour: null, // empty — should be filled
        tertiaryColour: "#CUSTOM3", // already set
        quaternaryColour: null,
        logoUrl128: null, // empty — should be filled
      },
    ];
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(1);
    const columns = updates[0].fields.map((f) => f.column);
    expect(columns).not.toContain("primary_colour");
    expect(columns).toContain("secondary_colour");
    expect(columns).not.toContain("tertiary_colour");
    expect(columns).toContain("logo_url_128");
  });

  it("returns updates for all 17 PCA clubs when all are present and empty", () => {
    const existing = PCA_CLUBS.map((c) => emptyClub(c.playhqOrgId));
    const updates = computeUpdates(existing);

    expect(updates).toHaveLength(17);
  });

  it("skips clubs with null playhqOrgId in the existing register", () => {
    const existing: ClubBrandState[] = [
      {
        playhqOrgId: null, // null org id — should never match
        primaryColour: null,
        secondaryColour: null,
        tertiaryColour: null,
        quaternaryColour: null,
        logoUrl128: null,
      },
    ];
    const updates = computeUpdates(existing);
    expect(updates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildTopUpStatements
// ---------------------------------------------------------------------------

describe("buildTopUpStatements", () => {
  it("generates one UPDATE statement per PCA club", () => {
    const stmts = buildTopUpStatements();
    expect(stmts).toHaveLength(PCA_CLUBS.length);
  });

  it("uses COALESCE/NULLIF pattern so existing values are preserved", () => {
    const stmts = buildTopUpStatements();
    for (const stmt of stmts) {
      expect(stmt).toContain("COALESCE(NULLIF(BTRIM(");
    }
  });

  it("matches on playhq_org_id with LIKE prefix%", () => {
    const stmts = buildTopUpStatements();
    for (const stmt of stmts) {
      expect(stmt).toMatch(/WHERE playhq_org_id LIKE '[0-9a-f]{8}%'/);
    }
  });

  it("includes quaternary_colour only for clubs that have it", () => {
    const stmts = buildTopUpStatements();
    // Halls Head (5fe82f6b) has quaternary
    const hhStmt = stmts.find((s) => s.includes("5fe82f6b"));
    expect(hhStmt).toContain("quaternary_colour");

    // Mandurah (84fe5d06) does NOT have quaternary
    const mandStmt = stmts.find((s) => s.includes("84fe5d06"));
    expect(mandStmt).not.toContain("quaternary_colour");
  });

  it("includes logo_url_128 for every club", () => {
    const stmts = buildTopUpStatements();
    for (const stmt of stmts) {
      expect(stmt).toContain("logo_url_128");
    }
  });
});

// ---------------------------------------------------------------------------
// topUpClubs (integration with mock psql)
// ---------------------------------------------------------------------------

describe("topUpClubs", () => {
  it("calls psql for each PCA club and logs the result", () => {
    const calls: string[] = [];
    const mockPsql = (sql: string): string => {
      calls.push(sql);
      return "UPDATE 1";
    };

    topUpClubs(mockPsql);

    expect(calls).toHaveLength(PCA_CLUBS.length);
    for (const call of calls) {
      expect(call).toMatch(/^UPDATE clubs SET /);
    }
  });

  it("is idempotent — second run produces same SQL calls", () => {
    const calls1: string[] = [];
    const calls2: string[] = [];

    topUpClubs((sql) => {
      calls1.push(sql);
      return "UPDATE 1";
    });
    topUpClubs((sql) => {
      calls2.push(sql);
      return "UPDATE 1";
    });

    expect(calls1).toEqual(calls2);
  });

  it("handles zero-row updates gracefully", () => {
    const mockPsql = (_sql: string): string => "UPDATE 0";
    // Should not throw
    expect(() => topUpClubs(mockPsql)).not.toThrow();
  });
});
