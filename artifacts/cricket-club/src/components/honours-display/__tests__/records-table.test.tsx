import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BoardRenderer } from "../board-renderer";
import type { DisplayBoard, HonourBrand } from "../types";

afterEach(cleanup);

const brand = { name: "Test Club", monogram: "TC" } as HonourBrand;

describe("records table layout (kiosk redesign C4)", () => {
  it("lists each wicket's partnership: wicket, runs, partners, season, opponent", () => {
    const board: DisplayBoard = {
      id: "partnerships_grade:A Grade",
      category: "partnership_records",
      layout: "recordsTable",
      title: "A Grade Partnerships",
      figureLabel: "Runs",
      entries: [1, 2, 3, 11].map((w) => ({
        season: "2024/25",
        primaryText: `Pair ${w}`,
        meta: { wicket: w, figure: String(200 - w), opponent: w === 1 ? "Mandurah" : null },
      })),
      display: { columns: 1, transition: "scroll", fit: false },
    };
    const { container } = render(<BoardRenderer board={board} brand={brand} kiosk />);
    expect([...container.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Wkt",
      "Runs",
      "Partners",
      "Season",
      "Opponent",
    ]);
    const rows = [...container.querySelectorAll("tbody tr.row")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent),
    );
    expect(rows[0]).toEqual(["1st", "199", "Pair 1", "2024/25", "v Mandurah"]);
    expect(rows.map((r) => r[0])).toEqual(["1st", "2nd", "3rd", "11th"]);
  });
});
