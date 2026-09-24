import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme-context";
import { installApiMock } from "../test/mock-api";
import Compare from "@/pages/compare";

/**
 * Compare rebuild (plan 2026-09-24-002, U7): URL-held players, verdict, tape,
 * selection helper, opposition metric reset and the career race tabs, against
 * a mocked API.
 */

const NAMES: Record<number, [string, string]> = {
  1: ["Ann", "Lee"],
  2: ["Bo", "Diaz"],
  3: ["Cy", "Ng"],
  4: ["Dee", "Fox"],
  5: ["Eve", "Lee"],
};

function player(id: number) {
  const [givenName, surname] = NAMES[id];
  return {
    id,
    givenName,
    surname,
    gradesPlayed: "A Grade",
    deceased: false,
    debutSeason: 2023,
    stats: [],
  };
}

/** Season rows: player 2 bowls cheaper than player 1. Player 5 copies player 1. */
function seasons(id: number) {
  const src = id === 5 ? 1 : id;
  const cheap = src === 2;
  return [2023, 2024].map((year) => ({
    grade: "A Grade",
    season: year,
    games: 10,
    innings: 10,
    notOuts: 1,
    runs: 300 + src * 10,
    highScore: "88",
    fifties: 2,
    hundreds: 0,
    wickets: 8,
    runsConceded: cheap ? 120 : 240,
    bestBowling: "3/20",
    fiveWickets: 0,
    catches: 3,
    ballsFaced: 400,
    ballsBowled: 360,
    maidens: 2,
  }));
}

function inning(runs: number, bowler: string | null) {
  return {
    runs,
    balls: runs + 5,
    notOut: bowler == null,
    dismissalType: bowler == null ? "notOut" : "bowled",
    dismissedBy: bowler,
    battingPos: 3,
  };
}

function matches(id: number) {
  const src = id === 5 ? 1 : id;
  return Array.from({ length: 6 }, (_, i) => ({
    matchId: src * 100 + i,
    grade: "A Grade",
    season: 2023 + (i % 2),
    round: i + 1,
    opponent: i % 2 ? "Ports" : "Rovers",
    opponentClubId: i % 2 ? 8 : 7,
    batted: true,
    bowled: true,
    overs: "6",
    wickets: 1,
    runsConceded: src === 2 ? 15 : 30,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    isHome: null,
    battedFirst: null,
    innings: [inning(20 + src, i % 3 === 0 ? null : "nguyen")],
  }));
}

const VS_CLUB = {
  resolved: true,
  opponentClubId: 44,
  opponentName: "Rovers",
  minInnings: 3,
  batting: [
    {
      playerId: 4,
      givenName: "Dee",
      surname: "Fox",
      matches: 5,
      innings: 5,
      notOuts: 0,
      outs: 5,
      runs: 250,
      average: 50,
      highScore: 90,
      highScoreNotOut: false,
    },
    {
      playerId: 1,
      givenName: "Ann",
      surname: "Lee",
      matches: 4,
      innings: 4,
      notOuts: 0,
      outs: 4,
      runs: 120,
      average: 30,
      highScore: 60,
      highScoreNotOut: false,
    },
  ],
  bowling: [],
};

const BEST = {
  games: 20,
  catches: 6,
  runs: 700,
  battingAverage: 40,
  highScore: 120,
  fifties: 4,
  hundreds: 1,
  battingStrikeRate: 90,
  wickets: 20,
  maidens: 5,
  fiveWickets: 1,
  bowlingAverage: 12,
  economy: 3,
  bowlingStrikeRate: 30,
};

function mocks(vsClub: unknown = VS_CLUB) {
  const m: Record<string, unknown> = {
    "/players/vs-club": vsClub,
  };
  for (const id of [1, 2, 3, 4, 5]) {
    m[`/players/${id}/seasons`] = seasons(id);
    m[`/players/${id}/matches`] = matches(id);
    m[`/players/${id}`] = player(id);
  }
  m["/players?"] = { players: [1, 2, 3, 4].map(player), total: 4, page: 1, limit: 20 };
  m["/grades/A%20Grade/distribution"] = {
    grade: "A Grade",
    fromSeason: null,
    toSeason: null,
    minInnings: 10,
    minOvers: 50,
    players: [],
    best: BEST,
  };
  m["/fixtures?"] = [
    {
      id: 9,
      grade: "A Grade",
      roundLabel: "Round 3",
      opponentName: "Rovers",
      opponentClubId: 44,
      venue: "Home Oval",
      startAt: "2099-10-10T03:00:00.000Z",
      isHome: true,
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  m["/fixtures-results/ladder"] = { gradeId: "g", gradeName: "A", season: null, ladders: [] };
  m["/fixtures-results"] = {
    linked: false,
    seasons: [],
    latestSeason: null,
    grades: [],
    matches: [],
  };
  return m;
}

function renderCompare(path: string, vsClub?: unknown) {
  const api = installApiMock(mocks(vsClub));
  const loc = memoryLocation({ path, record: true });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router hook={loc.hook} searchHook={loc.searchHook}>
          <Compare />
        </Router>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  const params = () => new URLSearchParams(loc.history!.at(-1)!.split("?")[1] ?? "");
  return { ...utils, api, params };
}

const loaded = () => screen.findByTestId("compare-verdict", {}, { timeout: 3000 });

describe("Compare analytics (U7)", () => {
  it("renders the player cards, verdict and tale of the tape from the URL players", async () => {
    renderCompare("/compare?a=1&b=2");
    await loaded();
    expect(await screen.findByRole("heading", { name: "Ann Lee" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Bo Diaz" })).toBeInTheDocument();
    expect(screen.getByTestId("compare-verdict").textContent).toMatch(
      /leads \d+ of \d+ categories/,
    );
    expect(screen.getAllByTestId("tape-row").length).toBe(10);
  });

  it("swap exchanges a and b in the URL and keeps from/to/d", async () => {
    const { params } = renderCompare("/compare?a=1&b=2&from=2023&to=2024&d=bowl");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Swap first two/ }));
    expect(params().get("a")).toBe("2");
    expect(params().get("b")).toBe("1");
    expect(params().get("from")).toBe("2023");
    expect(params().get("to")).toBe("2024");
    expect(params().get("d")).toBe("bowl");
  });

  it("card 3 starts as 'Add a third player', and × removes a third player", async () => {
    renderCompare("/compare?a=1&b=2");
    await loaded();
    expect(
      within(screen.getByTestId("player-card-c")).getByText("Add a third player"),
    ).toBeInTheDocument();

    const { params } = renderCompare("/compare?a=1&b=2&c=3&d=bowl");
    fireEvent.click(await screen.findByRole("button", { name: "Remove Cy Ng" }));
    expect(params().has("c")).toBe(false);
    expect(params().get("d")).toBe("bowl");
  });

  it("the selection helper fills the empty third slot and marks players already in", async () => {
    const { params } = renderCompare("/compare?a=1&b=2");
    const add = await screen.findByRole("button", { name: "Compare Dee Fox" }, { timeout: 3000 });
    const rows = screen.getAllByTestId("helper-row");
    expect(within(rows[1]).getByText("Comparing")).toBeInTheDocument();
    fireEvent.click(add);
    expect(params().get("c")).toBe("4");
    expect(params().get("a")).toBe("1");
  });

  it("with three players the selection helper replaces B", async () => {
    const { params } = renderCompare("/compare?a=1&b=2&c=3");
    fireEvent.click(
      await screen.findByRole("button", { name: "Compare Dee Fox" }, { timeout: 3000 }),
    );
    expect(params().get("b")).toBe("4");
    expect(params().get("c")).toBe("3");
  });

  it("an opponent the stats can't map shows that honestly", async () => {
    renderCompare("/compare?a=1&b=2", {
      resolved: false,
      opponentClubId: null,
      opponentName: null,
      minInnings: 3,
      batting: [],
      bowling: [],
    });
    expect(
      await screen.findByText("No stats match for this opponent", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("helper-row")).toHaveLength(0);
  });

  it("reports 'Level at the top' when the players tie", async () => {
    renderCompare("/compare?a=1&b=5");
    await waitFor(() =>
      expect(screen.getByTestId("compare-verdict").textContent).toMatch(/Level at the top/),
    );
  });

  it("for bowling average the lower value leads and gets the longest bar", async () => {
    renderCompare("/compare?a=1&b=2&d=bowl");
    await loaded();
    const row = await waitFor(() => {
      const r = screen
        .getAllByTestId("tape-row")
        .find((el) => el.getAttribute("data-metric") === "bowlingAverage");
      expect(r).toBeTruthy();
      return r!;
    });
    await waitFor(() => {
      const bars = within(row).getAllByTestId("tape-bar");
      expect(bars[1]).toHaveAttribute("data-leader", "true");
      expect(bars[0]).not.toHaveAttribute("data-leader");
      expect(parseFloat(within(bars[1]).getByTestId("tape-fill").style.width)).toBe(100);
    });
  });

  it("the race is by games played with final totals, and its Wickets tab sets d=bowl", async () => {
    const { params } = renderCompare("/compare?a=1&b=2");
    await loaded();
    const race = await screen.findByRole("heading", { name: "Runs race" });
    const card = race.closest("section")!;
    const table = await within(card).findByTestId("chart-data-table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Player", "Games", "Runs"]);
    // Six games each; Ann scores 21 an innings, Bo 22.
    expect(
      within(table).getByRole("rowheader", { name: "Ann Lee" }).parentElement!.textContent,
    ).toBe("Ann Lee6126");
    fireEvent.click(within(card).getByRole("radio", { name: "Wickets" }));
    expect(params().get("d")).toBe("bowl");
  });

  it("switching discipline resets the opposition metric (econ → outs → wk)", async () => {
    renderCompare("/compare?a=1&b=2&d=bowl");
    await loaded();
    const metric = await screen.findByRole("radiogroup", { name: "Opposition metric" });
    fireEvent.click(within(metric).getByRole("radio", { name: "Economy" }));
    expect(within(metric).getByRole("radio", { name: "Economy" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const disc = screen.getByRole("radiogroup", { name: "Opposition discipline" });
    fireEvent.click(within(disc).getByRole("radio", { name: "Batting" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("radiogroup", { name: "Opposition metric" })).getByRole("radio", {
          name: "Times dismissed",
        }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Opposition discipline" })).getByRole("radio", {
        name: "Bowling",
      }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("radiogroup", { name: "Opposition metric" })).getByRole("radio", {
          name: "Wickets",
        }),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("a player chosen on one card is disabled on the others", async () => {
    renderCompare("/compare?a=1&b=2");
    await loaded();
    fireEvent.click(screen.getByRole("combobox", { name: "Choose Player C" }));
    const options = await screen.findAllByRole("option");
    const ann = options.find((o) => o.textContent?.includes("Lee, Ann"))!;
    const cy = options.find((o) => o.textContent?.includes("Ng, Cy"))!;
    expect(ann).toHaveAttribute("aria-disabled", "true");
    expect(cy).not.toHaveAttribute("aria-disabled", "true");
  });

  it("prompts for two players until two are chosen", async () => {
    renderCompare("/compare?a=1");
    expect(await screen.findByText("Pick two players to compare")).toBeInTheDocument();
    expect(screen.queryByTestId("compare-verdict")).toBeNull();
  });
});
