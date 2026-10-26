import { describe, it, expect } from "vitest";
import { LEADERBOARDS, leaderboardBoard, seasonSpan } from "./records";

const games = LEADERBOARDS.find((d) => d.metric === "games")!;
const runs = LEADERBOARDS.find((d) => d.metric === "runs")!;

describe("honour display leaderboards (kiosk redesign C1)", () => {
  it("formats a player's seasons for the club", () => {
    expect(seasonSpan(2009, 2024)).toBe("2009–25");
    expect(seasonSpan(1998, 1999)).toBe("1998–00");
    expect(seasonSpan(2024, 2024)).toBe("2024/25");
    expect(seasonSpan(null, 2024)).toBe("");
  });

  it("ranks the top 50 with ties sharing a rank", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      name: `Player ${i + 1}`,
      value: i < 3 ? 300 : 300 - i,
      playerId: i + 1,
      firstSeason: 2010,
      lastSeason: 2020,
    }));
    const board = leaderboardBoard(games, rows)!;
    expect(board).toMatchObject({ id: "most_games", layout: "leaderboard", figureLabel: "Games" });
    expect(board.entries).toHaveLength(50);
    expect(board.entries.slice(0, 4).map((e) => e.meta?.rank)).toEqual([1, 1, 1, 4]);
    expect(board.entries[0]).toMatchObject({
      primaryText: "Player 1",
      detail: "300 games",
      playerId: 1,
      meta: { figure: "300", seasonSpan: "2010–21" },
    });
  });

  it("groups thousands in the figure and leaves an unknown span empty", () => {
    const board = leaderboardBoard(runs, [{ name: "A Batter", value: 9840, playerId: null }])!;
    expect(board.entries[0]).toMatchObject({
      detail: "9840 runs",
      meta: { figure: "9,840", seasonSpan: null },
    });
  });

  it("has no board without rows", () => {
    expect(leaderboardBoard(runs, [])).toBeNull();
  });
});
