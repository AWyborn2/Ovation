import { describe, it, expect } from "vitest";
import { isSetInput, landscapeSummary, planCardSet, type SetInput } from "./card-sets";
import { clubLeaderboardCarousel, clubLeaderboardInput } from "./club-leaderboard-input";
import { LADDER_ROWS, ladderCarousel, ladderInput } from "./ladder-input";

const grade = (gradeLabel: string, runs: number | null) => ({
  gradeLabel,
  topRunScorer: runs == null ? null : { playerName: `${gradeLabel} bat`, value: runs },
  topWicketTaker: null,
  topCatches: null,
  topDismissals: null,
});

describe("club leaderboard inputs", () => {
  it("builds the card the Studio prefill always built", () => {
    expect(
      clubLeaderboardInput(2025, "Runs", [grade("A Grade", 400), grade("B Grade", null)]),
    ).toEqual({
      kind: "clubLeaderboard",
      title: "CLUB RUN SCORERS",
      subtitle: "Leading run scorer in each grade",
      season: "2025/26",
      category: "Runs",
      leaders: [
        { gradeLabel: "A GRADE", playerName: "A Grade bat", value: "400" },
        { gradeLabel: "B GRADE", playerName: "", value: "" },
      ],
    });
  });

  it("the carousel keeps only categories with a leader", () => {
    const c = clubLeaderboardCarousel(2025, [grade("A Grade", 400)])!;
    expect(c.carousel.map((s) => s.category)).toEqual(["Runs"]);
    expect(clubLeaderboardCarousel(2025, [grade("A Grade", null)])).toBeNull();
  });
});

describe("ladder inputs", () => {
  const teams = Array.from({ length: 12 }, (_, i) => ({
    rank: i + 1,
    teamName: `Team ${i + 1}`,
    played: 5,
    won: 3,
    lost: 2,
    points: 18,
    isClub: i === 11,
  }));

  it("keeps ten rows and always shows the club", () => {
    const card = ladderInput({ grade: "A Grade", asOfLabel: "AFTER ROUND 5", teams });
    expect(card.rows).toHaveLength(LADDER_ROWS);
    expect(card.rows[LADDER_ROWS - 1]).toMatchObject({ team: "Team 12", pos: 12, isClub: true });
  });

  it("names the table when a grade publishes several", () => {
    const card = ladderInput({ grade: "A Grade", tableName: "One Day", asOfLabel: "", teams });
    expect(card.competitionName).toBe("A GRADE · ONE DAY");
  });
});

describe("round carousels as card sets", () => {
  const a = ladderInput({ grade: "A Grade", asOfLabel: "R5", teams: [] });
  const b = ladderInput({ grade: "B Grade", asOfLabel: "R5", teams: [] });

  it("post their slides in order with page numbers, no cover", () => {
    const input = ladderCarousel([a, b]) as unknown as SetInput;
    expect(isSetInput(input)).toBe(true);
    const slides = planCardSet(input);
    expect(slides.map((s) => [s.role, s.page, s.of])).toEqual([
      ["detail", 1, 2],
      ["detail", 2, 2],
    ]);
    expect(slides[1].input).toMatchObject({ gradeLabel: "B GRADE", setPage: "2/2" });
  });

  it("a one-slide carousel is a single card", () => {
    const slides = planCardSet(ladderCarousel([a]) as unknown as SetInput);
    expect(slides).toHaveLength(1);
    expect(slides[0].role).toBe("single");
  });

  it("landscape exports the first slide", () => {
    expect(landscapeSummary(ladderCarousel([a, b]) as unknown as SetInput)).toEqual(a);
  });
});
