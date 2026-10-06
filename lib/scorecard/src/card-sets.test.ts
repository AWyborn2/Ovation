import { describe, it, expect } from "vitest";
import { planCardSet, type SetInput } from "./card-sets";

const team = (grade: string, extra: Record<string, unknown> = {}) => ({
  grade,
  gradeRound: `${grade} · Round 4`,
  competitionLine: "PCA",
  venueDateTime: "Sat 1:00pm",
  players: [{ order: 1, surname: "SMITH", shirtNumber: "23" }],
  ...extra,
});

describe("teamListRound slides", () => {
  it("carries shirt numbering onto each team-list slide", () => {
    const input = {
      kind: "teamListRound",
      teams: [team("A Grade", { numbering: "shirt" }), team("B Grade")],
    } as unknown as SetInput;
    const slides = planCardSet(input);
    const byGrade = new Map(
      slides
        .filter((s) => s.input.kind === "teamList")
        .map((s) => [(s.input as { gradeRound: string }).gradeRound, s.input]),
    );
    expect(byGrade.get("A Grade · Round 4")).toMatchObject({ numbering: "shirt" });
    expect(byGrade.get("B Grade · Round 4")).not.toHaveProperty("numbering");
  });
});
