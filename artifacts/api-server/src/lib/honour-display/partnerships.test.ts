import { describe, it, expect } from "vitest";
import { partnershipBoards, wicketNumber, type PartnershipRow } from "./records";

const row = (over: Partial<PartnershipRow>): PartnershipRow => ({
  grade: "A Grade",
  wicket: 1,
  runs: 100,
  batters: "Ann & Bea",
  season: "2020/21",
  opponent: null,
  source: "derived",
  ...over,
});

describe("partnership records tables (kiosk redesign C4)", () => {
  it("reads the wicket number from the curated text", () => {
    expect(wicketNumber("1st")).toBe(1);
    expect(wicketNumber("10th Wkt")).toBe(10);
    expect(wicketNumber("3")).toBe(3);
    expect(wicketNumber("11th")).toBeNull();
    expect(wicketNumber("Opening")).toBeNull();
  });

  it("keeps the highest stand per wicket, the club's own on a tie, one board per grade", () => {
    const boards = partnershipBoards([
      row({ wicket: 2, runs: 80, batters: "Derived Two" }),
      row({ wicket: 1, runs: 150, batters: "Derived One", opponent: "Mandurah" }),
      row({ wicket: 1, runs: 212, batters: "Curated One", source: "curated", season: "1988/89" }),
      row({ wicket: 2, runs: 80, batters: "Curated Two", source: "curated" }),
      row({ grade: "B Grade", wicket: 5, runs: 64, batters: "B Stand" }),
    ]);
    expect(boards.map((b) => [b.id, b.layout, b.title])).toEqual([
      ["partnerships_grade:A Grade", "recordsTable", "A Grade Partnerships"],
      ["partnerships_grade:B Grade", "recordsTable", "B Grade Partnerships"],
    ]);
    expect(boards[0]!.entries.map((e) => [e.meta?.wicket, e.meta?.figure, e.primaryText])).toEqual([
      [1, "212", "Curated One"],
      [2, "80", "Curated Two"],
    ]);
    expect(boards[0]!.entries[0]).toMatchObject({
      season: "1988/89",
      detail: "212 runs · 1 wkt",
    });
  });

  it("has no boards without partnerships", () => {
    expect(partnershipBoards([])).toEqual([]);
  });
});
