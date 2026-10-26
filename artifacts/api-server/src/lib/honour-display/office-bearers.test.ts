import { describe, it, expect } from "vitest";
import { officeBearersBoard } from "./people";

const role = (role: string, season: number, name: string, grade: string | null = null) => ({
  role,
  season,
  name,
  playerId: null,
  grade,
});

describe("office bearers season grid (kiosk redesign C6)", () => {
  it("puts each office in its own column, in office order, newest season first", () => {
    const board = officeBearersBoard([
      role("Treasurer", 2023, "Tess"),
      role("Registrar", 2024, "Reg"),
      role("President", 2024, "Pam"),
      role("Secretary", 2024, "Sam"),
      role("President", 2023, "Paul"),
      role("Grade Captain", 2024, "Cap", "A Grade"),
    ])!;
    expect(board).toMatchObject({ id: "office_bearers", layout: "grid", title: "Office Bearers" });
    expect(board.grid!.columnHeadings).toEqual([
      "President",
      "Secretary",
      "Treasurer",
      "Registrar",
    ]);
    expect(board.grid!.rows.map((r) => r.heading)).toEqual(["2024/25", "2023/24"]);
    expect(board.grid!.rows[0]!.cells.map((c) => c.entries.map((e) => e.text))).toEqual([
      ["Pam"],
      ["Sam"],
      [],
      ["Reg"],
    ]);
  });

  it("has no board without office bearers", () => {
    expect(officeBearersBoard([role("Grade Captain", 2024, "Cap", "A Grade")])).toBeNull();
  });
});
