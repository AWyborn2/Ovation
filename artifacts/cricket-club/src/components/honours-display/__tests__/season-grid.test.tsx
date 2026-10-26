import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { BoardRenderer } from "../board-renderer";
import type { DisplayBoard, HonourBrand } from "../types";

afterEach(cleanup);

const CSS = readFileSync(
  join(__dirname, "..", "..", "..", "styles", "honour-boards.css"),
  "utf8",
).replace(/\r\n/g, "\n");

const brand = { name: "Test Club", monogram: "TC" } as HonourBrand;
const display = { columns: 1, transition: "scroll" as const, fit: false };

const composite = (headings: string[]): DisplayBoard => ({
  id: "captains",
  category: "captains",
  layout: "columns",
  title: "Captains",
  entries: [],
  columns: headings.map((h) => ({
    heading: h,
    entries: [{ primaryText: "x", season: "2024/25" }],
  })),
  display,
});

describe("season grid on the TV (kiosk redesign A4)", () => {
  it("marks a season-aligned composite so the kiosk keeps its Season column narrow", () => {
    const { container } = render(
      <BoardRenderer
        board={composite(["Season", "First Grade", "Second Grade"])}
        brand={brand}
        kiosk
      />,
    );
    const cols = container.querySelector<HTMLElement>(".hb-cols")!;
    expect(cols.hasAttribute("data-season-lead")).toBe(true);
    expect(cols.style.getPropertyValue("--hb-cols-n")).toBe("2");
  });

  it("leaves a composite without a Season column alone", () => {
    const { container } = render(
      <BoardRenderer board={composite(["First Grade", "Second Grade"])} brand={brand} kiosk />,
    );
    expect(container.querySelector(".hb-cols")!.hasAttribute("data-season-lead")).toBe(false);
  });

  it("keeps notes inside the name they belong to", () => {
    const board: DisplayBoard = {
      id: "champions",
      category: "awards",
      layout: "grid",
      title: "Club Champions",
      entries: [],
      grid: {
        rowHeading: "Season",
        columnHeadings: ["First Grade"],
        rows: [
          {
            heading: "2024/25",
            cells: [{ entries: [{ text: "A Player" }, { text: "B Player", note: "Joint" }] }],
          },
        ],
      },
      display,
    };
    const { container } = render(<BoardRenderer board={board} brand={brand} kiosk />);
    const names = container.querySelectorAll(".hb-grid-name");
    expect(names).toHaveLength(2);
    expect(names[1]!.querySelector(".hb-grid-note")?.textContent).toBe("Joint");
  });

  it("lays grids out with a fixed season column and one-line names on the TV", () => {
    expect(CSS).toMatch(/\.hb-kiosk \.hb-grid-table \{\s*table-layout: fixed;/);
    expect(CSS).toMatch(
      /\.hb-kiosk \.hb-grid-table \.hb-grid-rowhead \{\s*width: var\(--hb-season-w\);/,
    );
    expect(CSS).toMatch(/\.hb-kiosk \.hb-grid-note \{\s*display: block;/);
  });
});
