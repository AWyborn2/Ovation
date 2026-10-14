import { describe, expect, it } from "vitest";
import {
  battingFigure,
  bestBatters,
  bestBowlers,
  bowlingFigure,
  pickTeamOfWeek,
  roundDateLabel,
  teamOfWeekFigure,
  type RoundPerformance,
} from "./round-results";

const perf = (over: Partial<RoundPerformance>): RoundPerformance => ({
  participantId: "p",
  matchId: 1,
  grade: "A Grade",
  runs: null,
  balls: null,
  notOut: false,
  batted: false,
  wickets: null,
  runsConceded: null,
  overs: null,
  ...over,
});

describe("round results figures", () => {
  it("formats a batting figure with not out and balls", () => {
    expect(battingFigure({ runs: 32, balls: 34, notOut: true })).toBe("32* (34)");
    expect(battingFigure({ runs: 26, balls: null, notOut: false })).toBe("26");
  });

  it("formats a bowling figure with overs", () => {
    expect(bowlingFigure({ wickets: 3, runsConceded: 28, overs: 10 })).toBe("3/28 (10)");
    expect(bowlingFigure({ wickets: 2, runsConceded: 4, overs: null })).toBe("2/4");
  });

  it("picks the two best batters and bowlers who did something", () => {
    const lines = [
      perf({ participantId: "a", batted: true, runs: 12, balls: 20 }),
      perf({ participantId: "b", batted: true, runs: 40, balls: 50 }),
      perf({ participantId: "c", batted: true, runs: 40, balls: 30 }),
      perf({ participantId: "d", batted: true, runs: 0 }),
      perf({ participantId: "e", wickets: 2, runsConceded: 30 }),
      perf({ participantId: "f", wickets: 2, runsConceded: 12 }),
      perf({ participantId: "g", wickets: 0, runsConceded: 5 }),
    ];
    expect(bestBatters(lines).map((p) => p.participantId)).toEqual(["c", "b"]);
    expect(bestBowlers(lines).map((p) => p.participantId)).toEqual(["f", "e"]);
  });
});

describe("team of the week", () => {
  it("names all-round days by the bigger part first", () => {
    expect(teamOfWeekFigure(perf({ wickets: 4, runsConceded: 21, batted: true, runs: 16 }))).toBe(
      "4/21 & 16",
    );
    expect(
      teamOfWeekFigure(perf({ wickets: 1, runsConceded: 9, batted: true, runs: 58, notOut: true })),
    ).toBe("58* & 1/9");
    expect(teamOfWeekFigure(perf({ batted: true, runs: 110, notOut: true }))).toBe("110*");
    expect(teamOfWeekFigure(perf({ wickets: 5, runsConceded: 28, batted: true, runs: 3 }))).toBe(
      "5/28",
    );
  });

  it("ranks players by their best match, one entry each, higher grade on a tie", () => {
    const picked = pickTeamOfWeek(
      [
        perf({ participantId: "x", batted: true, runs: 50, grade: "B Grade" }),
        perf({ participantId: "x", matchId: 2, batted: true, runs: 80, grade: "C Grade" }),
        perf({ participantId: "y", wickets: 2, runsConceded: 20, grade: "C Grade" }),
        perf({ participantId: "z", wickets: 2, runsConceded: 20, grade: "A Grade" }),
        perf({ participantId: "w", batted: true, runs: 0 }),
      ],
      ["A Grade", "B Grade", "C Grade"],
    );
    expect(picked.map((p) => p.participantId)).toEqual(["x", "z", "y"]);
    expect(picked[0]?.runs).toBe(80);
  });
});

describe("roundDateLabel", () => {
  it("spells out the day with its ordinal", () => {
    expect(roundDateLabel("2026-10-10")).toBe("SATURDAY 10TH OCTOBER 2026");
    expect(roundDateLabel("2026-11-01")).toBe("SUNDAY 1ST NOVEMBER 2026");
    expect(roundDateLabel("2026-11-22")).toBe("SUNDAY 22ND NOVEMBER 2026");
    expect(roundDateLabel(null)).toBe("");
  });
});
