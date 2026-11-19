/**
 * Card 1023 (retest 9): a game PlayHQ files as abandoned but records as
 * "Match drawn" reads as a draw on its card, as the round picker said; a
 * game that really was abandoned still says so. No-play innings ("0/0")
 * never print, and real scores always do.
 */
import { describe, expect, it } from "vitest";
import type { MatchDetail } from "@workspace/api-zod";
import { inningsWasPlayed, matchToSummaryInput, readsAsAbandoned } from "./match-summary-input";

const line = (over: Record<string, unknown>) => ({
  playerId: 1,
  playerName: "A Smith",
  batted: true,
  battingPos: 1,
  runs: null,
  balls: null,
  fours: null,
  sixes: null,
  notOut: false,
  dismissal: null,
  bowled: false,
  overs: null,
  maidens: null,
  runsConceded: null,
  wickets: null,
  wides: null,
  noBalls: null,
  ...over,
});

const match = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 1023,
    season: 2026,
    grade: "A Grade",
    round: 5,
    stage: null,
    matchDate: "2026-11-14",
    venue: "Oval",
    opponent: "Mariners",
    opponentClub: null,
    club: null,
    competition: "One Day",
    clubScore: "0/0",
    opponentScore: "0/0",
    clubBattedFirst: true,
    result: "Match drawn",
    clubWon: null,
    abandoned: true,
    lines: [line({ playerName: "A Smith" })],
    oppositionLines: [line({ playerName: "B Jones" })],
    ...over,
  }) as unknown as MatchDetail;

describe("readsAsAbandoned", () => {
  it("keeps a recorded draw or tie over the abandoned flag", () => {
    expect(readsAsAbandoned({ abandoned: true, result: "Match drawn" })).toBe(false);
    expect(readsAsAbandoned({ abandoned: true, result: "Draw" })).toBe(false);
    expect(readsAsAbandoned({ abandoned: true, result: "Match tied" })).toBe(false);
  });

  it("is abandoned when the line says so, says nothing, or names a winner", () => {
    expect(readsAsAbandoned({ abandoned: true, result: "Match abandoned" })).toBe(true);
    expect(readsAsAbandoned({ abandoned: true, result: "Abandoned, match drawn" })).toBe(true);
    expect(readsAsAbandoned({ abandoned: true, result: "No result" })).toBe(true);
    expect(readsAsAbandoned({ abandoned: true, result: null })).toBe(true);
    expect(readsAsAbandoned({ abandoned: true, result: "Lost by 5 wickets" })).toBe(true);
  });

  it("is never abandoned without the flag, whatever the line", () => {
    expect(readsAsAbandoned({ abandoned: false, result: "Match abandoned" })).toBe(false);
    expect(readsAsAbandoned({ result: "Match drawn" })).toBe(false);
  });
});

describe("inningsWasPlayed", () => {
  const inn = (totalRuns: number | null, wickets: number | null, batsmen = [] as never[]) => ({
    totalRuns,
    wickets,
    batsmen,
  });
  it("leaves out no score and 0/0 with nobody scoring or facing a ball", () => {
    expect(inningsWasPlayed(inn(null, null))).toBe(false);
    expect(inningsWasPlayed(inn(0, 0))).toBe(false);
    expect(
      inningsWasPlayed({ totalRuns: null, wickets: null, batsmen: [{ runs: null, balls: null }] }),
    ).toBe(false);
  });
  it("keeps any real score or a batter who faced a ball", () => {
    expect(inningsWasPlayed(inn(87, 4))).toBe(true);
    expect(inningsWasPlayed(inn(0, 1))).toBe(true);
    expect(
      inningsWasPlayed({ totalRuns: null, wickets: null, batsmen: [{ runs: 0, balls: 3 }] }),
    ).toBe(true);
  });
});

describe("matchToSummaryInput: abandoned or drawn", () => {
  it("prints a recorded draw as a draw, with no 0/0 placeholder scores", () => {
    const input = matchToSummaryInput(match());
    expect(input.result).toBe("Match drawn");
    expect(input.resultWinner).toBe("draw");
    expect(input.innings).toEqual([]);
  });

  it("still prints an abandoned game as abandoned, with no 0/0 scores", () => {
    for (const result of ["Match abandoned", null]) {
      const input = matchToSummaryInput(match({ result }));
      expect(input.result).toBe("Match abandoned");
      expect(input.resultWinner).toBe("draw");
      expect(input.innings).toEqual([]);
    }
  });

  it("keeps the real scores of a game abandoned part way through", () => {
    const input = matchToSummaryInput(
      match({
        result: "Match abandoned",
        clubScore: "87/4",
        opponentScore: null,
        lines: [line({ runs: 40, balls: 52 })],
      }),
    );
    expect(input.result).toBe("Match abandoned");
    expect(input.innings).toHaveLength(1);
    expect(input.innings[0]).toMatchObject({ teamKey: "club", totalRuns: "87", wickets: "4" });
  });

  it("keeps both scores of a drawn game", () => {
    const input = matchToSummaryInput(
      match({
        abandoned: false,
        clubScore: "201/6",
        opponentScore: "180/9",
        lines: [line({ runs: 71, balls: 90 })],
        oppositionLines: [line({ playerName: "B Jones", runs: 50, balls: 60 })],
      }),
    );
    expect(input.result).toBe("Match drawn");
    expect(input.innings.map((i) => `${i.wickets}/${i.totalRuns}`)).toEqual(["6/201", "9/180"]);
  });
});
