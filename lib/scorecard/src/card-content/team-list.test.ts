/** Round 3 retest: junior team list slides print the grade as the heading. */
import { describe, expect, it } from "vitest";
import { teamListContent, teamListSlideInput } from "./team-list";

describe("junior team list slide heading (round 3 retest)", () => {
  it("prints the competition as the small line and the grade as the heading", () => {
    const c = teamListContent(
      {
        id: 1,
        grade: "Year 9",
        roundLabel: null,
        opponentName: "Kardinya",
        venue: "Peelwood Reserve",
        startAt: null,
      },
      { kind: "teamList", junior: true, players: [] } as never,
      { junior: true, gradeLabel: "Year 9 GOLD", gradeLine: "YEAR 9 BOYS SOUTH WEST" },
    );
    const input = teamListSlideInput(c, new Set(["team.round"]));
    expect(input.gradeRound).toBe("YEAR 9 BOYS SOUTH WEST");
    expect(input.gradeHeading).toBe("Year 9 GOLD");
    expect(String(input.gradeRound)).not.toContain("GOLD");
  });

  it("leaves a senior list as it was", () => {
    const c = teamListContent(
      {
        id: 2,
        grade: "A Grade",
        roundLabel: "Round 6",
        opponentName: "Waroona",
        venue: "",
        startAt: null,
      },
      { kind: "teamList", players: [] } as never,
    );
    const input = teamListSlideInput(c, new Set(["team.round"]));
    expect(input.gradeRound).toBe("A GRADE — ROUND 6");
    expect(input.gradeHeading).toBeUndefined();
  });
});
