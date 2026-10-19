import { describe, expect, it } from "vitest";
import type { JuniorMatchDetail } from "@workspace/api-zod";
import { juniorMatchToSummaryInput } from "./match-summary-input";
import { DEFAULT_BRAND } from "./brand";

/**
 * R22: opposition juniors are never named on a junior result card, not even by
 * initials (junior PlayHQ sync review, security P2). Team totals stay; only the
 * featured performers of the opposition are left out.
 */
const bat = (playerName: string, runs: number, isHallsHead: boolean) => ({
  id: runs,
  playerName,
  isHallsHead,
  participantId: null,
  isPrivate: false,
  runs,
  balls: runs,
  fours: 0,
  sixes: 0,
  strikeRate: 100,
  dismissal: "b:",
});
const bowl = (playerName: string, wickets: number, isHallsHead: boolean) => ({
  id: 100 + wickets,
  playerName,
  isHallsHead,
  participantId: null,
  isPrivate: false,
  overs: 4,
  maidens: 0,
  runs: 20,
  wickets,
  economy: 5,
  wides: 0,
  noBalls: 0,
});

const match = {
  id: 1,
  ageGroup: "Year 9",
  round: "Round 3",
  season: "2026/27",
  opponentName: "Rockingham Rams",
  opponentClub: null,
  hhScore: "5/120",
  opponentScore: "8/100",
  hhResult: "Won",
  status: "COMPLETED",
  innings: [
    {
      innings: 1,
      battingTeam: "Halls Head Hawks",
      isHallsHead: true,
      batting: [bat("Ollie G", 64, true), bat("Sam T", 30, true)],
      bowling: [bowl("K. W.", 3, false), bowl("L. B.", 1, false)],
    },
    {
      innings: 2,
      battingTeam: "Rockingham Rams",
      isHallsHead: false,
      batting: [bat("K. W.", 40, false), bat("L. B.", 22, false)],
      bowling: [bowl("Mia B", 4, true), bowl("Sam T", 2, true)],
    },
  ],
  rosters: [],
} as unknown as JuniorMatchDetail;

describe("juniorMatchToSummaryInput opposition performers", () => {
  const input = juniorMatchToSummaryInput(match);
  if (input.kind !== "matchSummary") throw new Error("expected a match summary");
  const [club, opp] = input.innings;

  it("features only the club's batters and bowlers", () => {
    expect(club!.topBatters.map((b) => b.name)).toEqual(["Ollie G", "Sam T"]);
    // The club batted: its innings' bowlers are the opposition, so none are featured.
    expect(club!.topBowlers).toEqual([]);
    // The opposition batted: none of its batters are featured; the club's bowlers are.
    expect(opp!.topBatters).toEqual([]);
    expect(opp!.topBowlers.map((b) => b.name)).toEqual(["Mia B", "Sam T"]);
  });

  it("keeps both team totals", () => {
    expect(club).toMatchObject({ teamKey: "club", totalRuns: "120", wickets: "5" });
    expect(opp).toMatchObject({ teamKey: "opposition", totalRuns: "100", wickets: "8" });
  });

  it("never carries an opposition player's initials", () => {
    expect(JSON.stringify(input.innings)).not.toMatch(/K\. W\.|L\. B\./);
  });
});

describe("junior summary club crests", () => {
  const brand = {
    ...DEFAULT_BRAND, name: "Halls Head Cricket Club", shortName: "HHCC",
    logoUrl: "/halls-head.png", logoUrl128: "/halls-head-small.png",
    backgroundColour: "#112233", primaryColour: "#ffaa22",
  };
  const opponentClub = {
    id: 12, name: "South Mandurah Cricket Club", shortName: "SMCC",
    logoUrl: "/south-mandurah.png", logoUrl128: "/south-mandurah-small.png",
    backgroundColour: "#221144", primaryColour: "#eeeeee",
  };
  for (const innings of [match.innings, [], [...match.innings].reverse()]) {
    it(`keeps both resolved crests with ${innings.length} innings in either order`, () => {
      const source = { ...match, innings, opponentClub };
      const before = JSON.stringify(source);
      const input = juniorMatchToSummaryInput(source, brand);
      expect(input.club).toMatchObject({
        name: brand.name, shortName: "HHCC", logoUrl: "/halls-head-small.png",
      });
      expect(input.opposition).toMatchObject({
        name: opponentClub.name, shortName: "SMCC", logoUrl: "/south-mandurah-small.png",
      });
      expect(input.junior).toBe(true);
      expect(JSON.stringify(source)).toBe(before);
    });
  }
  it("retains the neutral fallback for an unresolved opponent", () => {
    expect(juniorMatchToSummaryInput({ ...match, innings: [], opponentClub: null }, brand)
      .opposition.logoUrl).toBeNull();
  });
});
