import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { MatchSummary } from "@workspace/api-client-react";
import Home, { latestMatch, shortMatchDate, tickerItems } from "@/pages/home";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const match = (over: Partial<MatchSummary>): MatchSummary => ({
  id: 1,
  grade: "A Grade",
  season: 2025,
  abandoned: false,
  playerCount: 11,
  ...over,
});

const OVERVIEW = {
  availableSeasons: [{ season: 2025, label: "2025/26" }],
  latestSeason: 2025,
  latestSeasonLabel: "2025/26",
  totals: { players: 683, games: 28792, runs: 387861, wickets: 20612, grades: 10 },
  recentMatches: [
    match({
      id: 11,
      grade: "B Grade",
      matchDate: "2026-03-07",
      round: 14,
      opponent: "Baldivis",
      clubScore: "142",
      opponentScore: "5/143",
      result: "Lost",
    }),
    match({
      id: 10,
      grade: "A Grade",
      matchDate: "2026-03-07",
      round: 14,
      opponent: "Mandurah",
      clubScore: "6/214",
      opponentScore: "188",
      result: "Won",
    }),
  ],
  topRunScorers: [],
  topWicketTakers: [],
};

const TOP = {
  season: 2025,
  seasonLabel: "2025/26",
  availableGrades: ["A Grade", "B Grade"],
  topRunScorers: [
    { playerId: 1, givenName: "Mitchell", surname: "Caine", value: 428 },
    { playerId: 2, givenName: "Ben", surname: "Finlay", value: 214 },
  ],
  topWicketTakers: [{ playerId: 3, givenName: "Joe", surname: "Phillips", value: 31 }],
};

describe("home helpers", () => {
  it("tickerItems orders by grade seniority and builds score lines", () => {
    const items = tickerItems(OVERVIEW.recentMatches, "HHCC");
    expect(items.map((i) => i.grade)).toEqual(["A", "B"]);
    expect(items[0].line).toBe("HHCC 6/214 v MAN 188");
    expect(items[0].href).toBe("/matches/10");
  });

  it("tickerItems skips abandoned and unscored matches", () => {
    expect(
      tickerItems([match({ abandoned: true, clubScore: "1" }), match({ id: 2 })], "HHCC"),
    ).toEqual([]);
  });

  it("latestMatch picks the newest date, then the highest id", () => {
    expect(latestMatch(OVERVIEW.recentMatches)?.id).toBe(11);
    expect(latestMatch([])).toBeNull();
  });

  it("shortMatchDate formats ISO dates and rejects junk", () => {
    expect(shortMatchDate("2026-03-07")).toMatch(/Sat/);
    expect(shortMatchDate("7 March")).toBeNull();
  });
});

describe("Home page (Broadcast U7)", () => {
  it("renders stat tiles, results, the ticker and the latest-scorecard CTA", async () => {
    installApiMock({ "/overview/top-performers": TOP, "/overview": OVERVIEW });
    renderAt(<Home />, "/");
    expect(await screen.findByText("28,792")).toBeTruthy();
    expect(screen.getByText("vs Mandurah")).toBeTruthy();
    expect(screen.getByTestId("results-ticker")).toBeTruthy();
    expect(screen.getByText("Latest scorecard").closest("a")?.getAttribute("href")).toBe(
      "/matches/11",
    );
    expect(screen.getByText("2025/26 season · Round 14")).toBeTruthy();
  });

  it("switches the leaderboard between runs and wickets", async () => {
    installApiMock({ "/overview/top-performers": TOP, "/overview": OVERVIEW });
    renderAt(<Home />, "/");
    await screen.findByText("Mitchell Caine");
    const bars = screen.getAllByTestId("leader-bar");
    expect(bars[0].style.width).toBe("100%");
    expect(bars[1].style.width).toBe("50%");
    fireEvent.click(screen.getByRole("radio", { name: "Wickets" }));
    await screen.findByText("Joe Phillips");
    expect(screen.queryByText("Mitchell Caine")).toBeNull();
  });

  it("with no recent matches: no ticker or CTA, hero still renders (AE5 gradient)", async () => {
    installApiMock({
      "/overview/top-performers": TOP,
      "/overview": { ...OVERVIEW, recentMatches: [] },
    });
    renderAt(<Home />, "/");
    await screen.findByText("No results yet this season.");
    expect(screen.queryByTestId("results-ticker")).toBeNull();
    expect(screen.queryByText("Latest scorecard")).toBeNull();
    const hero = screen.getByTestId("hero-home");
    expect(hero.querySelector("img")).toBeNull();
  });

  it("shows tile skeletons while the overview loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderAt(<Home />, "/");
    await waitFor(() => expect(screen.getByTestId("skeleton-tiles")).toBeTruthy());
  });
});
