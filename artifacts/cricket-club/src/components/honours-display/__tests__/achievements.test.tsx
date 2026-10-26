import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BoardRenderer } from "../board-renderer";
import { sliceBoardRows } from "../player/pages";
import type { DisplayBoard, HonourBrand } from "../types";

afterEach(cleanup);

const brand = { name: "Test Club", monogram: "TC" } as HonourBrand;

const centuries = (n: number): DisplayBoard => ({
  id: "centuries",
  category: "centuries",
  layout: "achievements",
  title: "Centuries",
  figureLabel: "Score",
  tallyLabel: `${n} centuries`,
  entries: Array.from({ length: n }, (_, i) => ({
    season: "2024/25",
    primaryText: `Batter ${i + 1}`,
    detail: "134*",
    meta: { figure: "134*", grade: "A Grade", opponent: i === 0 ? "Mandurah" : null },
  })),
  display: { columns: 1, transition: "scroll", fit: false },
});

describe("achievement list layout (kiosk redesign C2)", () => {
  it("renders season, player, figure, grade and opponent with the tally", () => {
    const { container } = render(<BoardRenderer board={centuries(3)} brand={brand} kiosk />);
    expect([...container.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Season",
      "Player",
      "Score",
      "Grade",
      "Opponent",
    ]);
    const cells = [...container.querySelector("tbody tr.row")!.querySelectorAll("td")];
    expect(cells.map((td) => td.textContent)).toEqual([
      "2024/25",
      "Batter 1",
      "134*",
      expect.stringMatching(/A/),
      "v Mandurah",
    ]);
    expect(container.querySelector(".hb-tally")?.textContent).toBe("3 centuries");
  });

  it("keeps the whole list's tally on a page of it", () => {
    const page = sliceBoardRows(centuries(40), 0, 10, 1);
    const { container } = render(<BoardRenderer board={page} brand={brand} kiosk />);
    expect(container.querySelectorAll("tbody tr.row")).toHaveLength(10);
    expect(container.querySelector(".hb-tally")?.textContent).toBe("40 centuries");
  });
});
