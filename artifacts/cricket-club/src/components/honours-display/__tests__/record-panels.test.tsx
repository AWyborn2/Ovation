import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BoardRenderer } from "../board-renderer";
import { boardRowCount, sliceBoardRows } from "../player/pages";
import type { DisplayBoard, HonourBrand } from "../types";

afterEach(cleanup);

const brand = { name: "Test Club", monogram: "TC" } as HonourBrand;

const panels = (grades: string[]): DisplayBoard => ({
  id: "grade_records",
  category: "grade_records",
  layout: "recordPanels",
  title: "Grade Records",
  entries: grades.map((g) => ({
    season: "",
    primaryText: g,
    lines: [
      { label: "Most Runs", value: "4321", holder: "Ann Allrounder", playerId: null },
      { label: "Highest team total", value: "412/6 v Mandurah", holder: null },
    ],
  })),
  display: { columns: 1, transition: "scroll", fit: false },
});

describe("record panels layout (kiosk redesign C3)", () => {
  it("renders a panel per grade with its record lines", () => {
    const { container } = render(
      <BoardRenderer board={panels(["A Grade", "B Grade"])} brand={brand} kiosk />,
    );
    const ps = container.querySelectorAll(".hb-panel");
    expect(ps).toHaveLength(2);
    expect(ps[0]!.querySelector(".hb-panel-title")?.textContent).toBe("A Grade");
    const lines = [...ps[0]!.querySelectorAll(".hb-panel-line")].map((l) => [
      l.querySelector("dt")?.textContent,
      l.querySelector("dd")?.textContent,
    ]);
    expect(lines).toEqual([
      ["Most Runs", "4321 Ann Allrounder"],
      ["Highest team total", "412/6 v Mandurah "],
    ]);
  });

  it("pages whole rows of panels, panels-across at a time", () => {
    const board = panels(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
    expect(boardRowCount(board, 4)).toBe(3);
    expect(sliceBoardRows(board, 1, 2, 4).entries.map((e) => e.primaryText)).toEqual([
      "E",
      "F",
      "G",
      "H",
    ]);
  });
});
