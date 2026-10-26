import { describe, it, expect } from "vitest";
import { gradeRecordPanels, type GradeRecords } from "./records";

const derived: GradeRecords[] = [
  {
    grade: "B Grade",
    lines: [{ label: "Most Runs", value: "2100", holder: "Bea Batter", playerId: 2 }],
  },
  {
    grade: "A Grade",
    lines: [
      { label: "Most Runs", value: "4321", holder: "Ann Allrounder", playerId: 1 },
      { label: "Best Bowling", value: "7/20", holder: "Ann Allrounder", playerId: 1 },
    ],
  },
];

describe("grade record panels (kiosk redesign C3)", () => {
  it("makes one panel per grade, senior grade first", () => {
    const board = gradeRecordPanels(derived, [])!;
    expect(board).toMatchObject({ id: "grade_records", layout: "recordPanels" });
    expect(board.entries.map((e) => e.primaryText)).toEqual(["A Grade", "B Grade"]);
    expect(board.entries[0]!.lines).toEqual(derived[1]!.lines);
  });

  it("lets a curated record replace the derived one it names, and adds the rest", () => {
    const board = gradeRecordPanels(derived, [
      { recordType: "MOST RUNS", grade: "A Grade", detail: "5012 — Old Timer (1968–89)" },
      { recordType: "Highest team total", grade: "A Grade", detail: "412/6 v Mandurah" },
      { recordType: "Most Wickets", grade: "C Grade", detail: "312 — Cee Bowler" },
      { recordType: "Ignored", grade: null, detail: "no grade" },
      { recordType: "Blank", grade: "A Grade", detail: " " },
    ])!;
    const a = board.entries.find((e) => e.primaryText === "A Grade")!;
    expect(a.lines!.map((l) => [l.label, l.value, l.holder])).toEqual([
      ["MOST RUNS", "5012 — Old Timer (1968–89)", null],
      ["Best Bowling", "7/20", "Ann Allrounder"],
      ["Highest team total", "412/6 v Mandurah", null],
    ]);
    // A curated-only grade gets its own panel.
    expect(board.entries.map((e) => e.primaryText)).toEqual(["A Grade", "B Grade", "C Grade"]);
  });

  it("has no board without any records", () => {
    expect(gradeRecordPanels([], [])).toBeNull();
    expect(gradeRecordPanels([{ grade: "A Grade", lines: [] }], [])).toBeNull();
  });
});
