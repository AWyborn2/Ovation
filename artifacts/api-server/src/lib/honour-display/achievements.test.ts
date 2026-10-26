import { describe, it, expect } from "vitest";
import { achievementBoard, type AchievementRow } from "./records";

const row = (over: Partial<AchievementRow>): AchievementRow => ({
  name: "A Player",
  playerId: null,
  grade: "A Grade",
  figure: "100",
  season: "2020/21",
  opponent: null,
  ...over,
});

describe("honour display achievement lists (kiosk redesign C2)", () => {
  it("lists newest season first, senior grade first within a season", () => {
    const board = achievementBoard("centuries", [
      row({ name: "Old", season: "2010/11" }),
      row({ name: "New B", season: "2024/25", grade: "B Grade" }),
      row({ name: "New A", season: "2024/25", grade: "A Grade" }),
    ])!;
    expect(board.entries.map((e) => e.primaryText)).toEqual(["New A", "New B", "Old"]);
    expect(board).toMatchObject({
      id: "centuries",
      layout: "achievements",
      figureLabel: "Score",
      tallyLabel: "3 centuries",
    });
  });

  it("carries figure, grade and opponent, and counts one in the singular", () => {
    const board = achievementBoard("five_wicket_hauls", [
      row({ name: "Bowler", figure: "6/23", opponent: "v Mandurah", playerId: 7 }),
    ])!;
    expect(board.tallyLabel).toBe("1 five-wicket haul");
    expect(board.entries[0]).toEqual({
      season: "2020/21",
      primaryText: "Bowler",
      detail: "6/23",
      playerId: 7,
      meta: { grade: "A Grade", figure: "6/23", opponent: "Mandurah" },
    });
  });

  it("drops unnamed rows and has no board without any", () => {
    expect(achievementBoard("hat_tricks", [row({ name: "  " })])).toBeNull();
    expect(achievementBoard("hat_tricks", [])).toBeNull();
  });
});
