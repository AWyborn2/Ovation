import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
// Import via the `./schema` entrypoint (NOT `@workspace/db`) so the DB pool
// module — which throws without DATABASE_URL — is never loaded. Keeps this a
// pure, DB-free schema/contract/mapping round-trip.
import { cardSetsTable } from "@workspace/db/schema";
import type { PlayerGradeStat } from "@workspace/db/schema";
import { GenerateCardSetBody, GenerateCardSetResponse } from "@workspace/api-zod";
import {
  assembleSlides,
  gradeLeaderInput,
  leaderValue,
  topLeaderRow,
  GENERATE_GRADES,
} from "../lib/social-cards-generate";

/**
 * C3 — server-side themed carousel-set generation: schema + OpenAPI contract +
 * pure mapping round-trip. DB-free.
 *
 * Asserts (1) the Drizzle `card_sets` table carries the nullable grouping
 * columns plus the partial unique index that makes regeneration idempotent,
 * (2) the generated Zod body/response schemas round-trip the generate contract,
 * and (3) the pure slide-assembly + gradeLeader mapping helpers behave. The
 * upsert transaction itself is exercised against a live DB elsewhere; here we
 * pin the index shape + the pure logic.
 */
describe("C3 card_sets generation — schema shape", () => {
  const config = getTableConfig(cardSetsTable);

  it("adds nullable source_kind / source_round / season / grade grouping columns", () => {
    for (const name of ["source_kind", "source_round", "season", "grade"]) {
      const col = config.columns.find((c) => c.name === name);
      expect(col, `${name} column present`).toBeTruthy();
      // Grouping columns are null for hand-authored sets.
      expect(col?.notNull, `${name} is nullable`).toBe(false);
    }
    const sourceKind = config.columns.find((c) => c.name === "source_kind");
    expect(sourceKind?.columnType).toContain("Text");
    const season = config.columns.find((c) => c.name === "season");
    expect(season?.columnType).toContain("Integer");
  });

  it("has a partial unique index on the grouping key for idempotent regeneration", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "card_sets_source_dedupe",
    );
    expect(idx, "card_sets_source_dedupe index present").toBeTruthy();
    expect(idx?.config.unique).toBe(true);

    // The key is (tenant_id, source_kind, COALESCE(season,-1),
    // COALESCE(source_round,-1), COALESCE(grade,'')): two named columns first,
    // then three COALESCE-sentinel expressions that fold the nullable columns to
    // non-null so the all-null gradeLeader key dedupes at the DB level (and the
    // expression is identical in the Drizzle schema + the SQL migration, so both
    // sync paths build the same index). Named columns expose `.name`; SQL
    // expressions do not.
    const entries = idx?.config.columns ?? [];
    expect(entries).toHaveLength(5);
    const named = entries.map((c) =>
      typeof c === "object" && c !== null && "name" in c
        ? (c as { name: string }).name
        : null,
    );
    expect(named.slice(0, 2)).toEqual(["tenant_id", "source_kind"]);
    // The last three are COALESCE expressions, not plain named columns.
    expect(named.slice(2)).toEqual([null, null, null]);

    // Partial: only generated rows (source_kind IS NOT NULL) are constrained.
    expect(idx?.config.where, "index is partial (WHERE source_kind is not null)").toBeTruthy();
  });
});

describe("C3 generate contract — Zod round-trip", () => {
  it("accepts a matchSummary generate body", () => {
    const body = GenerateCardSetBody.parse({
      kind: "matchSummary",
      round: 5,
      season: 2025,
      grades: ["A Grade"],
      platformSize: "square",
    });
    expect(body.kind).toBe("matchSummary");
    expect(body.round).toBe(5);
  });

  it("accepts a gradeLeader body with round/season/grades omitted", () => {
    const body = GenerateCardSetBody.parse({
      kind: "gradeLeader",
      platformSize: "portrait",
    });
    expect(body.kind).toBe("gradeLeader");
    expect(body.round).toBeUndefined();
    expect(body.grades).toBeUndefined();
  });

  it("rejects an unknown kind and a bad platform size", () => {
    expect(() =>
      GenerateCardSetBody.parse({ kind: "nope", platformSize: "square" }),
    ).toThrow();
    expect(() =>
      GenerateCardSetBody.parse({ kind: "gradeLeader", platformSize: "banner" }),
    ).toThrow();
  });

  it("materialises the grouping columns on the CardSet response schema", () => {
    const set = GenerateCardSetResponse.parse({
      id: 1,
      name: "A Grade • Round 5",
      platformSize: "square",
      slides: [],
      isPublished: false,
      sourceKind: "matchSummary",
      sourceRound: 5,
      season: 2025,
      grade: "A Grade",
    });
    expect(set.sourceKind).toBe("matchSummary");
    // Nullable — a hand-authored set carries nulls (or omits them).
    const plain = GenerateCardSetResponse.parse({
      id: 2,
      name: "Untitled set",
      platformSize: "square",
      slides: [],
      isPublished: false,
      sourceKind: null,
      sourceRound: null,
      season: null,
      grade: null,
    });
    expect(plain.sourceKind).toBeNull();
  });
});

describe("C3 slide assembly + mapping — pure helpers", () => {
  const input = (kind: string) => ({ kind });

  it("assembles ordered slides with deterministic ids and draft defaults", () => {
    const { slides, truncated } = assembleSlides(
      [input("a"), input("b"), input("c")],
      10,
    );
    expect(truncated).toBe(0);
    expect(slides.map((s) => s.id)).toEqual(["gen-1", "gen-2", "gen-3"]);
    expect(slides[0].themeId).toBeNull();
    expect(slides[0].motionPreset).toBe("none");
    expect(slides[0].input).toEqual({ kind: "a" });
  });

  it("clamps to max and reports how many were dropped", () => {
    const inputs = Array.from({ length: 13 }, (_, i) => input(`m${i}`));
    const { slides, truncated } = assembleSlides(inputs, 10);
    expect(slides).toHaveLength(10);
    expect(truncated).toBe(3);
    expect(slides.at(-1)?.id).toBe("gen-10");
  });

  it("emits no slides for an empty gather", () => {
    const { slides, truncated } = assembleSlides([], 10);
    expect(slides).toHaveLength(0);
    expect(truncated).toBe(0);
  });

  const row = (over: Partial<PlayerGradeStat>): PlayerGradeStat =>
    ({
      id: 1,
      playerId: 1,
      surname: "Smith",
      givenName: "Jo",
      grade: "A Grade",
      season: null,
      games: 10,
      innings: null,
      notOuts: null,
      runs: null,
      batAvg: null,
      highScore: null,
      fifties: null,
      hundreds: null,
      wickets: null,
      runsConceded: null,
      bowlAvg: null,
      bestBowling: null,
      fiveWickets: null,
      catches: null,
      stumpings: null,
      runOuts: null,
      ...over,
    }) as PlayerGradeStat;

  it("reads the category value, treating null as 0", () => {
    expect(leaderValue(row({ runs: 420 }), "Runs")).toBe(420);
    expect(leaderValue(row({ wickets: 31 }), "Wickets")).toBe(31);
    expect(leaderValue(row({ runs: null }), "Runs")).toBe(0);
  });

  it("picks the top qualifying row and skips zero/negative categories", () => {
    const rows = [
      row({ givenName: "Low", runs: 100 }),
      row({ givenName: "High", runs: 500 }),
      row({ givenName: "Zero", runs: 0 }),
    ];
    expect(topLeaderRow(rows, "Runs")?.givenName).toBe("High");
    // No one has wickets → null.
    expect(topLeaderRow(rows, "Wickets")).toBeNull();
  });

  it("maps a leaderboard row to the exact gradeLeader ShareCardInput shape", () => {
    const inp = gradeLeaderInput(
      row({ givenName: "Jo", surname: "Smith", runs: 742 }),
      "B Grade",
      "Runs",
    );
    expect(inp).toEqual({
      kind: "gradeLeader",
      grade: "B Grade",
      category: "Runs",
      playerName: "Jo Smith",
      value: 742,
    });
  });

  it("exposes the app's fixed grade list as the default span", () => {
    expect(GENERATE_GRADES).toContain("A Grade");
    expect(GENERATE_GRADES).toContain("Colts");
  });
});
