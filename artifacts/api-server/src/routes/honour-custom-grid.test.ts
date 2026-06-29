import { describe, it, expect } from "vitest";
import {
  composeCustomGrid,
  normalizeCustomKioskToken,
  kioskTokenMatches,
} from "./honour-display";

describe("composeCustomGrid", () => {
  const cols = [
    { key: "pres", label: "President" },
    { key: "sec", label: "Secretary" },
  ];

  it("orders rows newest→oldest and drops names into the right cells", () => {
    const grid = composeCustomGrid(
      cols,
      [
        { seasonLabel: "2023/24", startYear: 2023, colKey: "pres", text: "A. Smith" },
        { seasonLabel: "2024/25", startYear: 2024, colKey: "pres", text: "B. Jones" },
        { seasonLabel: "2024/25", startYear: 2024, colKey: "sec", text: "C. Lee" },
      ],
      {},
    );
    expect(grid.rowHeading).toBe("Season");
    expect(grid.columnHeadings).toEqual(["President", "Secretary"]);
    expect(grid.rows.map((r) => r.heading)).toEqual(["2024/25", "2023/24"]);
    expect(grid.rows[0]!.cells[0]!.entries[0]!.text).toBe("B. Jones");
    expect(grid.rows[0]!.cells[1]!.entries[0]!.text).toBe("C. Lee");
    // 2023/24 has no secretary → empty cell.
    expect(grid.rows[1]!.cells[1]!.entries).toHaveLength(0);
  });

  it("spans an explicit season range, pre-listing blank future seasons", () => {
    const grid = composeCustomGrid(
      cols,
      [{ seasonLabel: "2024/25", startYear: 2024, colKey: "pres", text: "B. Jones" }],
      { from: 2022, to: 2026 },
    );
    expect(grid.rows.map((r) => r.heading)).toEqual([
      "2026/27",
      "2025/26",
      "2024/25",
      "2023/24",
      "2022/23",
    ]);
    // Future seasons are present but empty.
    expect(grid.rows[0]!.cells[0]!.entries).toHaveLength(0);
    expect(grid.rows[2]!.cells[0]!.entries[0]!.text).toBe("B. Jones");
  });

  it("keeps joint holders and per-cell notes", () => {
    const grid = composeCustomGrid(
      [{ key: "a", label: "A Grade" }],
      [
        { seasonLabel: "2024/25", startYear: 2024, colKey: "a", text: "Won", note: "Premiers" },
        { seasonLabel: "2024/25", startYear: 2024, colKey: "a", text: "Shared" },
      ],
      {},
    );
    const cell = grid.rows[0]!.cells[0]!;
    expect(cell.entries).toHaveLength(2);
    expect(cell.entries[0]!.note).toBe("Premiers");
    expect(cell.entries[1]!.note).toBeNull();
  });
});

describe("kiosk token", () => {
  it("accepts valid custom codes and rejects bad ones", () => {
    expect(normalizeCustomKioskToken("clubroom-tv")).toBe("clubroom-tv");
    expect(normalizeCustomKioskToken("  Main-TV-2026 ")).toBe("Main-TV-2026");
    expect(normalizeCustomKioskToken("ab")).toBeNull(); // too short
    expect(normalizeCustomKioskToken("-leadinghyphen")).toBeNull();
    expect(normalizeCustomKioskToken("has space")).toBeNull();
    expect(normalizeCustomKioskToken("emoji✨here")).toBeNull();
    expect(normalizeCustomKioskToken(123)).toBeNull();
  });

  it("matches custom codes case-insensitively and rejects mismatches", () => {
    expect(kioskTokenMatches("clubroom-tv", "CLUBROOM-TV")).toBe(true);
    expect(kioskTokenMatches("clubroom-tv", "  clubroom-tv  ")).toBe(true);
    expect(kioskTokenMatches("clubroom-tv", "other")).toBe(false);
    expect(kioskTokenMatches(null, "anything")).toBe(false);
    expect(kioskTokenMatches("ABCD2345", "abcd2345")).toBe(true); // auto code
  });
});
