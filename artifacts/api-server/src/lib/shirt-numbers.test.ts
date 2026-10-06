import { describe, it, expect } from "vitest";
import {
  applyCarriedNumber,
  duplicateEntryIds,
  duplicateWarning,
  duplicatesOf,
  planSeasonStart,
  samePerson,
  seasonLabel,
  type RegisterEntryLike,
} from "./shirt-numbers";

/**
 * Pure register rules for season shirt numbers (plan U3): duplicate detection,
 * carried-number policy and season-start planning. No database.
 */

const entry = (
  id: number,
  name: string,
  number: string | null,
  who: { playerId?: number | null; participantId?: string | null } = {},
): RegisterEntryLike => ({
  id,
  name,
  number,
  playerId: who.playerId ?? null,
  participantId: who.participantId ?? null,
});

describe("seasonLabel", () => {
  it("names a season by its start and two-digit end year", () => {
    expect(seasonLabel(2026)).toBe("2026/27");
    expect(seasonLabel(2099)).toBe("2099/00");
    expect(seasonLabel(2008)).toBe("2008/09");
  });
});

describe("duplicatesOf", () => {
  const season = [
    entry(1, "Alice", "7"),
    entry(2, "Bea", "07"),
    entry(3, "Cy", null),
    entry(4, "Dee", "7"),
  ];

  it("matches the exact string only: 7 and 07 are different numbers", () => {
    expect(duplicatesOf(season, "7").map((e) => e.id)).toEqual([1, 4]);
    expect(duplicatesOf(season, "07").map((e) => e.id)).toEqual([2]);
  });

  it("excludes the entry being saved", () => {
    expect(duplicatesOf(season, "7", 1).map((e) => e.id)).toEqual([4]);
  });

  it("an unnumbered entry never duplicates", () => {
    expect(duplicatesOf(season, null)).toEqual([]);
  });
});

describe("duplicateEntryIds", () => {
  it("flags every entry sharing a number with another, never unnumbered ones", () => {
    const ids = duplicateEntryIds([
      entry(1, "A", "7"),
      entry(2, "B", "7"),
      entry(3, "C", "8"),
      entry(4, "D", null),
      entry(5, "E", null),
    ]);
    expect([...ids].sort()).toEqual([1, 2]);
  });
});

describe("duplicateWarning", () => {
  it("names the other entries and their ids", () => {
    const w = duplicateWarning(2026, "7", [entry(4, "Dee Long", "7")]);
    expect(w).toEqual({
      kind: "duplicate",
      season: 2026,
      number: "7",
      entryIds: [4],
      names: ["Dee Long"],
      message: "#7 is also worn by Dee Long in 2026/27.",
    });
  });

  it("lists several holders", () => {
    const w = duplicateWarning(2026, "7", [entry(4, "Dee", "7"), entry(5, "Eve", "7")]);
    expect(w.message).toBe("#7 is also worn by Dee and Eve in 2026/27.");
  });
});

describe("samePerson", () => {
  it("matches on player id or participant id, never on two nulls", () => {
    expect(
      samePerson({ playerId: 5, participantId: null }, { playerId: 5, participantId: null }),
    ).toBe(true);
    expect(
      samePerson({ playerId: null, participantId: "g" }, { playerId: 9, participantId: "g" }),
    ).toBe(true);
    expect(
      samePerson({ playerId: null, participantId: null }, { playerId: null, participantId: null }),
    ).toBe(false);
    expect(
      samePerson({ playerId: 5, participantId: "a" }, { playerId: 6, participantId: "b" }),
    ).toBe(false);
  });
});

describe("applyCarriedNumber", () => {
  const season = [entry(1, "Alice", "12")];

  it("keeps a carried number that nobody wears", () => {
    expect(applyCarriedNumber("4", season, "block")).toEqual({ number: "4", blockedBy: [] });
  });

  it("under warn keeps a carried duplicate", () => {
    expect(applyCarriedNumber("12", season, "warn")).toEqual({ number: "12", blockedBy: [] });
  });

  it("under block leaves a carried duplicate off and says who holds it", () => {
    const r = applyCarriedNumber("12", season, "block");
    expect(r.number).toBeNull();
    expect(r.blockedBy.map((e) => e.id)).toEqual([1]);
  });

  it("no carried number stays unnumbered", () => {
    expect(applyCarriedNumber(null, season, "block")).toEqual({ number: null, blockedBy: [] });
  });
});

describe("planSeasonStart", () => {
  const previous = [
    entry(1, "Alice", "12", { playerId: 100 }),
    entry(2, "Bea", "7", { participantId: "guid-b" }),
    entry(3, "Cy", null, { playerId: 102 }),
    entry(4, "Dee", "9", { playerId: 103, participantId: "guid-d" }),
  ];

  it("under carry copies every previous entry, numbers included, as rollover entries", () => {
    const plan = planSeasonStart({
      previous,
      current: [],
      rolloverPolicy: "carry",
      duplicatePolicy: "warn",
    });
    expect(plan.skipped).toBe(0);
    expect(plan.blocked).toEqual([]);
    expect(plan.create).toEqual([
      { name: "Alice", playerId: 100, participantId: null, number: "12", source: "rollover" },
      { name: "Bea", playerId: null, participantId: "guid-b", number: "7", source: "rollover" },
      { name: "Cy", playerId: 102, participantId: null, number: null, source: "rollover" },
      { name: "Dee", playerId: 103, participantId: "guid-d", number: "9", source: "rollover" },
    ]);
  });

  it("is idempotent: people already on the new register are skipped", () => {
    const first = planSeasonStart({
      previous,
      current: [],
      rolloverPolicy: "carry",
      duplicatePolicy: "warn",
    });
    const current = first.create.map((c, i) => ({ id: 50 + i, ...c }));
    const second = planSeasonStart({
      previous,
      current,
      rolloverPolicy: "carry",
      duplicatePolicy: "warn",
    });
    expect(second.create).toEqual([]);
    expect(second.skipped).toBe(4);
  });

  it("skips a person matched by participant id alone", () => {
    const plan = planSeasonStart({
      previous,
      current: [entry(60, "Dee (new)", "1", { participantId: "guid-d" })],
      rolloverPolicy: "carry",
      duplicatePolicy: "warn",
    });
    expect(plan.create.map((c) => c.name)).toEqual(["Alice", "Bea", "Cy"]);
    expect(plan.skipped).toBe(1);
  });

  it("under blank creates nothing", () => {
    const plan = planSeasonStart({
      previous,
      current: [],
      rolloverPolicy: "blank",
      duplicatePolicy: "warn",
    });
    expect(plan).toEqual({ create: [], skipped: 0, blocked: [] });
  });

  it("under block a carried number already worn this season is left off", () => {
    const plan = planSeasonStart({
      previous,
      current: [entry(70, "Newcomer", "12", { playerId: 200 })],
      rolloverPolicy: "carry",
      duplicatePolicy: "block",
    });
    const alice = plan.create.find((c) => c.name === "Alice");
    expect(alice?.number).toBeNull();
    expect(plan.blocked).toEqual([{ name: "Alice", number: "12" }]);
  });

  it("under block two previous holders of one number: the first keeps it", () => {
    const plan = planSeasonStart({
      previous: [
        entry(1, "Alice", "7", { playerId: 100 }),
        entry(2, "Bea", "7", { playerId: 101 }),
      ],
      current: [],
      rolloverPolicy: "carry",
      duplicatePolicy: "block",
    });
    expect(plan.create.map((c) => [c.name, c.number])).toEqual([
      ["Alice", "7"],
      ["Bea", null],
    ]);
    expect(plan.blocked).toEqual([{ name: "Bea", number: "7" }]);
  });

  it("under warn a carried duplicate is kept", () => {
    const plan = planSeasonStart({
      previous,
      current: [entry(70, "Newcomer", "12", { playerId: 200 })],
      rolloverPolicy: "carry",
      duplicatePolicy: "warn",
    });
    expect(plan.create.find((c) => c.name === "Alice")?.number).toBe("12");
    expect(plan.blocked).toEqual([]);
  });

  it("a previous entry with no identity at all is still copied once by name", () => {
    const plan = planSeasonStart({
      previous: [entry(1, "Nobody Known", "3")],
      current: [],
      rolloverPolicy: "carry",
      duplicatePolicy: "warn",
    });
    expect(plan.create).toHaveLength(1);
    const again = planSeasonStart({
      previous: [entry(1, "Nobody Known", "3")],
      current: [entry(9, "Nobody Known", "3")],
      rolloverPolicy: "carry",
      duplicatePolicy: "warn",
    });
    expect(again.create).toHaveLength(0);
    expect(again.skipped).toBe(1);
  });
});
