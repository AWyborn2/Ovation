import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Route } from "wouter";
import MatchDetail from "@/pages/match-detail";
import { teamLabel } from "@/components/scorecard/broadcast-scorecard";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const line = (over: Record<string, unknown>) => ({
  batted: false,
  notOut: false,
  bowled: false,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  ...over,
});

const MATCH = {
  id: 7,
  grade: "A Grade",
  season: 1991,
  stage: "Grand Final",
  matchDate: "1992-03-21",
  venue: "Rushton Park",
  result: "Won by 6 wickets",
  opponent: "Rockingham",
  clubScore: "4/191",
  opponentScore: "185",
  abandoned: false,
  clubBattedFirst: false,
  opponentClub: { id: 3, name: "Rockingham Cricket Club", shortName: null, logoUrl: null },
  lines: [
    line({
      id: 1,
      playerId: 5,
      givenName: "Peter",
      surname: "Wyllie",
      batted: true,
      battingPos: 1,
      runs: 88,
      balls: 120,
      fours: 9,
      sixes: 1,
      dismissal: "c Smith b Jones",
    }),
    line({
      id: 2,
      playerId: 6,
      givenName: "Joe",
      surname: "Phillips",
      bowled: true,
      overs: "10",
      maidens: 2,
      runsConceded: 31,
      wickets: 4,
    }),
  ],
  oppositionLines: [
    line({
      id: 10,
      name: "A Smith",
      batted: true,
      battingPos: 1,
      runs: 60,
      balls: 90,
      notOut: false,
      dismissal: "b Phillips",
    }),
    line({
      id: 11,
      name: "B Jones",
      bowled: true,
      overs: "9",
      maidens: 0,
      runsConceded: 50,
      wickets: 1,
    }),
  ],
  hatTrickPlayerIds: [],
};

function renderMatch(match: Record<string, unknown>) {
  installApiMock({ "/api/matches/7": match });
  return renderAt(<Route path="/matches/:id" component={MatchDetail} />, "/matches/7");
}

describe("Match scorecard (Broadcast U9)", () => {
  it("renders the score hero with the finals pill, result, verb and opposition initial disc", async () => {
    renderMatch(MATCH);
    expect(await screen.findByTestId("match-hero")).toBeTruthy();
    expect(screen.getByText("Grand Final")).toBeTruthy();
    expect(screen.getByTestId("match-verb").textContent).toBe("def");
    expect(screen.getByText("Won by 6 wickets")).toBeTruthy();
    expect(screen.getByText("4/191")).toBeTruthy();
    // Opposition has no logo → initial disc "R".
    expect(within(screen.getByTestId("match-hero")).getByText("R")).toBeTruthy();
  });

  it.each([
    ["Lost by 20 runs", "lost to"],
    ["Tie", "tied"],
    ["No result", "v"],
  ])("result %s → verb %s", async (result, verb) => {
    renderMatch({ ...MATCH, result });
    expect((await screen.findByTestId("match-verb")).textContent).toBe(verb);
  });

  it("innings tabs switch both cards (opposition batted first)", async () => {
    renderMatch(MATCH);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs[0].textContent).toBe("Rockingham innings");
    expect(screen.getByText("A Smith")).toBeTruthy();
    expect(screen.getByText("Joe Phillips")).toBeTruthy();
    fireEvent.click(tabs[1]);
    expect(screen.getByText("Peter Wyllie")).toBeTruthy();
    expect(screen.getByText("B Jones")).toBeTruthy();
    expect(screen.queryByText("A Smith")).toBeNull();
  });

  it("a regular-round match has no finals pill", async () => {
    renderMatch({ ...MATCH, stage: null, round: 14 });
    await screen.findByTestId("match-hero");
    expect(screen.queryByText("Grand Final")).toBeNull();
    expect(screen.getByText(/Rd 14|Round 14/)).toBeTruthy();
  });

  it("an empty scorecard shows the no-scorecard message", async () => {
    renderMatch({ ...MATCH, lines: [], oppositionLines: [] });
    expect(await screen.findByText("No scorecard recorded for this match.")).toBeTruthy();
  });
});

describe("teamLabel", () => {
  it("prefers the short name and strips 'Cricket Club'", () => {
    expect(teamLabel({ name: "Rockingham Cricket Club", shortName: null })).toBe("Rockingham");
    expect(teamLabel({ name: "Halls Head CC", shortName: null })).toBe("Halls Head");
    expect(teamLabel({ name: "X", shortName: "HHCC" })).toBe("HHCC");
  });
});
