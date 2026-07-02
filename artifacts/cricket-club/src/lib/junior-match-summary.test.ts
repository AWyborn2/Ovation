import { describe, it, expect } from "vitest";
import { juniorMatchToSummaryInput } from "./junior-match-summary";
import type { JuniorMatchDetail } from "@workspace/api-client-react";
import type { ShareCardInput } from "./share-card";

/**
 * Phase 4 U4 regression: a junior match whose free-text score field is
 * unparseable must not render a misleading "0/0" total when real batting
 * lines are recorded — the total should be derived from the batting data.
 */
function baseMatch(overrides: Partial<JuniorMatchDetail>): JuniorMatchDetail {
  return {
    id: "m1",
    ageGroup: "U12",
    round: "Round 1",
    competition: "Summer",
    season: "2025/26",
    matchDate: "2026-01-10",
    venue: "Test Oval",
    opponentName: "Opponent CC",
    opponentClub: null,
    hhScore: "rain",
    opponentScore: "80/6",
    hhResult: "Won",
    status: "Complete",
    innings: [
      {
        isHallsHead: true,
        batting: [
          { playerName: "Alice", runs: 24, balls: 20, fours: 2, sixes: 0, strikeRate: 120, dismissal: "c Smith b Jones" },
          { playerName: "Bella", runs: 18, balls: 15, fours: 1, sixes: 1, strikeRate: 120, dismissal: null },
        ],
        bowling: [],
      },
    ],
    ...overrides,
  } as unknown as JuniorMatchDetail;
}

function inningsOf(input: ShareCardInput) {
  if (input.kind !== "matchSummary") throw new Error("expected matchSummary");
  return input.innings;
}

describe("juniorMatchToSummaryInput: score correctness (Phase 4 U4)", () => {
  it("derives the total from batting data when the free-text score is unparseable, never a bare 0/0", () => {
    const input = juniorMatchToSummaryInput(baseMatch({}));
    const clubInnings = inningsOf(input).find((i) => i.teamKey === "club");
    expect(clubInnings).toBeDefined();
    // 24 + 18 = 42 runs from the recorded batting lines; Alice is out, Bella is not.
    expect(clubInnings?.totalRuns).toBe("42");
    expect(clubInnings?.wickets).toBe("1");
  });

  it("omits the innings entirely rather than showing a bare 0/0 when there is truly no data", () => {
    const input = juniorMatchToSummaryInput(
      baseMatch({
        innings: [{ isHallsHead: true, batting: [], bowling: [] }],
      } as unknown as Partial<JuniorMatchDetail>),
    );
    const clubInnings = inningsOf(input).find((i) => i.teamKey === "club");
    expect(clubInnings).toBeUndefined();
  });

  it("uses the parsed score directly when it parses cleanly", () => {
    const input = juniorMatchToSummaryInput(baseMatch({ hhScore: "42/1" }));
    const clubInnings = inningsOf(input).find((i) => i.teamKey === "club");
    expect(clubInnings?.totalRuns).toBe("42");
    expect(clubInnings?.wickets).toBe("1");
  });
});
