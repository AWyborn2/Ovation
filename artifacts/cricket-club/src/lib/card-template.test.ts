import { describe, it, expect } from "vitest";
import { CARD_KINDS } from "./share-card";
import { sampleCardInput } from "./sample-card-inputs";
import {
  CARD_FIELD_CATALOG,
  COMMON_FIELDS,
  resolveTextField,
  type TemplateContext,
} from "./card-template";

const CTX: TemplateContext = {
  clubName: "Sample Club",
  clubUrl: "club.example.com",
  hashtag: "#SampleClub",
};

/**
 * Pack A U2: the card-input model spans 18 kinds — the original 10 plus the
 * 8 new Pack A kinds — and every kind has a sample input and a field-catalog
 * entry whose scalar text fields all resolve against that sample.
 */
const NEW_KINDS = [
  "matchDay",
  "teamList",
  "weekendWrap",
  "ladder",
  "bigMoment",
  "newSigning",
  "countdown",
  "clubLeaderboard",
] as const;

const EXISTING_KINDS = [
  "milestone",
  "player",
  "record",
  "gradeLeader",
  "premiership",
  "debut",
  "newCap",
  "century",
  "fiveFor",
  "matchSummary",
] as const;

describe("card kind coverage", () => {
  it("CARD_KINDS covers all 18 kinds", () => {
    expect(CARD_KINDS).toHaveLength(18);
    for (const kind of [...EXISTING_KINDS, ...NEW_KINDS]) {
      expect(CARD_KINDS).toContain(kind);
    }
  });

  it("has a sample input for every kind", () => {
    for (const kind of CARD_KINDS) {
      expect(sampleCardInput(kind).kind, kind).toBe(kind);
    }
  });

  it("has a field-catalog entry for every kind", () => {
    for (const kind of CARD_KINDS) {
      expect(CARD_FIELD_CATALOG[kind], kind).toBeDefined();
      expect(CARD_FIELD_CATALOG[kind].length, kind).toBeGreaterThan(0);
    }
  });

  it("keeps the existing 10 kinds' sample shapes stable", () => {
    const shapes = Object.fromEntries(
      EXISTING_KINDS.map((k) => [k, Object.keys(sampleCardInput(k)).sort()]),
    );
    expect(shapes).toEqual({
      milestone: [
        "currentValue",
        "headline",
        "kind",
        "milestoneLabel",
        "playerName",
        "threshold",
        "tierIndex",
        "tierLabel",
      ],
      player: ["gradesPlayed", "headline", "kind", "playerName", "stats"],
      record: ["grade", "headline", "kind", "playerName", "title", "value"],
      gradeLeader: ["category", "grade", "headline", "kind", "playerName", "value"],
      premiership: ["competition", "grade", "headline", "kind", "mom", "result", "year"],
      debut: [
        "capNumber",
        "grade",
        "headline",
        "kind",
        "opponent",
        "playerName",
        "round",
        "season",
      ],
      newCap: ["capNumber", "category", "grade", "headline", "kind", "playerName"],
      century: [
        "balls",
        "grade",
        "headline",
        "kind",
        "notOut",
        "opponent",
        "playerName",
        "round",
        "runs",
      ],
      fiveFor: [
        "figures",
        "grade",
        "headline",
        "kind",
        "opponent",
        "overs",
        "playerName",
        "round",
        "runsConceded",
        "wickets",
      ],
      matchSummary: [
        "club",
        "date",
        "headline",
        "innings",
        "kind",
        "matchTitle",
        "matchType",
        "opposition",
        "result",
        "resultWinner",
        "venue",
      ],
    });
  });
});

describe("resolveTextField", () => {
  it("resolves every catalogued text field for every kind against its sample", () => {
    for (const kind of CARD_KINDS) {
      const input = sampleCardInput(kind);
      for (const field of [...COMMON_FIELDS, ...CARD_FIELD_CATALOG[kind]]) {
        if (field.type !== "text") continue;
        const value = resolveTextField(input, field.key, CTX);
        expect(typeof value, `${kind}.${field.key}`).toBe("string");
      }
    }
  });

  it("resolves catalogued per-kind text fields to non-empty values from the sample", () => {
    for (const kind of CARD_KINDS) {
      const input = sampleCardInput(kind);
      for (const field of CARD_FIELD_CATALOG[kind]) {
        if (field.type !== "text") continue;
        // The player sample carries three stats; the catalog's fourth slot
        // legitimately resolves to "".
        if (kind === "player" && /^stat4/.test(field.key)) continue;
        const value = resolveTextField(input, field.key, CTX);
        expect(value, `${kind}.${field.key}`).not.toBe("");
      }
    }
  });

  it("resolves the flattened clubLeaderboard leader fields", () => {
    const input = sampleCardInput("clubLeaderboard");
    expect(resolveTextField(input, "leader1Name", CTX)).toBe("Jack Manuel");
    expect(resolveTextField(input, "leader1Value", CTX)).toBe("428");
    expect(resolveTextField(input, "leader4Grade", CTX)).not.toBe("");
    // Beyond the sample's four leaders the slot degrades to "".
    expect(resolveTextField(input, "leader5Name", CTX)).toBe("");
  });

  it("returns \"\" for fields not present on a kind (multi-kind templates degrade)", () => {
    const input = sampleCardInput("countdown");
    expect(resolveTextField(input, "playerName", CTX)).toBe("");
    expect(resolveTextField(input, "rows", CTX)).toBe("");
  });
});
