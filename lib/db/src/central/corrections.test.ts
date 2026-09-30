import { describe, expect, it } from "vitest";
import { correctionMatchFromRow, correctionSearchWords } from "./corrections";

/** Pure helpers behind the corrections admin screen (hybrid stats plan U16). */

const row = {
  matchId: 5,
  playhqMatchId: "phq-5",
  season: "Summer 2024/25",
  grade: "A Grade",
  round: "Round 3",
  matchDate: "2024-11-02",
  homeClubId: 1,
  homeTeam: "Home CC",
  awayTeam: "Away CC",
  homeScore: "5/150",
  awayScore: "10/120",
};

describe("correctionMatchFromRow", () => {
  it("shapes the match from the club's side, home or away", () => {
    expect(correctionMatchFromRow(row, 1)).toEqual({
      matchId: 5,
      playhqMatchId: "phq-5",
      season: 2024,
      grade: "A Grade",
      round: "Round 3",
      matchDate: "2024-11-02",
      opponent: "Away CC",
      clubScore: "5/150",
      opponentScore: "10/120",
    });
    expect(correctionMatchFromRow(row, 2)).toMatchObject({
      opponent: "Home CC",
      clubScore: "10/120",
      opponentScore: "5/150",
    });
  });

  it("gives a junior grade a null app grade, so it's never offered (juniors isolation)", () => {
    expect(correctionMatchFromRow({ ...row, grade: "Under 15 Boys" }, 1).grade).toBeNull();
  });
});

describe("correctionSearchWords", () => {
  it("splits on whitespace, drops blanks and caps the word count", () => {
    expect(correctionSearchWords(undefined)).toEqual([]);
    expect(correctionSearchWords("   ")).toEqual([]);
    expect(correctionSearchWords(" opp  2024 ")).toEqual(["opp", "2024"]);
    expect(correctionSearchWords("a b c d e f g h")).toHaveLength(6);
  });
});
