import { describe, expect, it } from "vitest";
import { centralClubWon } from "./match-result";

const CLUB = 113;
const match = (over: Partial<Parameters<typeof centralClubWon>[0]> = {}) => ({
  winnerClubId: null,
  homeClubId: CLUB,
  homeTeam: "Rockingham-Mandurah - 4s",
  awayTeam: "Claremont-Nedlands - 4s",
  resultText: null,
  ...over,
});

describe("centralClubWon", () => {
  it("uses the recorded winner over the result text", () => {
    expect(centralClubWon(match({ winnerClubId: CLUB, resultText: "Match drawn" }), CLUB)).toBe(
      true,
    );
    expect(centralClubWon(match({ winnerClubId: 102 }), CLUB)).toBe(false);
  });

  it("reads PlayHQ's result sentence when no winner is recorded", () => {
    expect(
      centralClubWon(match({ resultText: "Rockingham-Mandurah - 4s won by 6 wickets" }), CLUB),
    ).toBe(true);
    expect(
      centralClubWon(match({ resultText: "Claremont-Nedlands - 4s won by 106 runs" }), CLUB),
    ).toBe(false);
    // Away side too, case- and spacing-insensitive.
    expect(
      centralClubWon(
        match({
          homeClubId: 102,
          homeTeam: "Claremont-Nedlands - 4s",
          awayTeam: "Rockingham-Mandurah - 4s",
          resultText: "rockingham-mandurah  - 4s WON on first innings",
        }),
        CLUB,
      ),
    ).toBe(true);
  });

  it("is null for a draw, tie, no result, or a winner it can't place", () => {
    expect(centralClubWon(match({ resultText: "Match drawn" }), CLUB)).toBeNull();
    expect(centralClubWon(match({ resultText: "Match tied" }), CLUB)).toBeNull();
    expect(centralClubWon(match(), CLUB)).toBeNull();
    expect(centralClubWon(match({ resultText: "Someone Else won by 1 run" }), CLUB)).toBeNull();
  });
});
