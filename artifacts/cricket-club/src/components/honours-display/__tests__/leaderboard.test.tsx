import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { resolveClubLook } from "@workspace/scorecard/kiosk-display";
import { BoardRenderer } from "../board-renderer";
import { boardItem } from "../player/rotation";
import type { DisplayBoard, HonourBrand } from "../types";

afterEach(cleanup);

const brand = { name: "Test Club", monogram: "TC" } as HonourBrand;

const leaderboard = (n: number): DisplayBoard => ({
  id: "most_runs",
  category: "most_runs",
  layout: "leaderboard",
  title: "Most Runs",
  figureLabel: "Runs",
  entries: Array.from({ length: n }, (_, i) => ({
    season: "",
    primaryText: `Player ${i + 1}`,
    detail: `${1000 - i} runs`,
    meta: { rank: i + 1, figure: String(1000 - i), seasonSpan: "2009–25" },
  })),
  display: { columns: 1, transition: "scroll", fit: false },
});

describe("leaderboard layout (kiosk redesign C1)", () => {
  it("renders rank, player, figure and seasons under headings", () => {
    const { container } = render(<BoardRenderer board={leaderboard(3)} brand={brand} kiosk />);
    const heads = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(heads).toEqual(["#", "Player", "Runs", "Seasons"]);
    const first = container.querySelector("tbody tr.row")!;
    expect([...first.querySelectorAll("td")].map((td) => td.textContent)).toEqual([
      "1",
      "Player 1",
      "1000",
      "2009–25",
    ]);
  });

  it("shows the board's Show top count on the TV", () => {
    const look = resolveClubLook(undefined);
    const board = leaderboard(50);
    const item = (top?: 10 | 20 | 50) =>
      boardItem(board, { boardConfigs: top ? { most_runs: { top } } : {} }, look, "k");
    const count = (i: ReturnType<typeof item>) => (i.kind === "board" ? i.board.entries.length : 0);
    expect(count(item())).toBe(20);
    expect(count(item(10))).toBe(10);
    expect(count(item(50))).toBe(50);
  });
});
