import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  GradeDistribution,
  PlayerMatchLine,
  PlayerSeasonStat,
} from "@workspace/api-client-react";
import PlayerDetail from "@/pages/player-detail";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { ThemeProvider } from "@/lib/theme-context";
import { installApiMock } from "@/test/mock-api";
import { inn, match, season } from "@/lib/stats-analytics/test-fixtures";

/**
 * Player profile rebuild (plan 2026-09-24-002, U6). The page reads range and
 * discipline from the URL (`useStatsView`), so these tests route through a
 * recording memory location with its search hook, unlike the static
 * `renderAt` helper.
 */

const PLAYER = {
  id: 42,
  givenName: "Mitchell",
  surname: "Caine",
  deceased: false,
  gradesPlayed: "A Grade",
  imageUrl: null,
  premiershipsWon: 0,
  premierships: [],
  stats: [{ id: 1, playerId: 42, grade: "A Grade", games: 32, runs: 1000 }],
};

const SEASONS: PlayerSeasonStat[] = [2021, 2022, 2023, 2024].map((s, i) =>
  season({
    season: s,
    games: 8,
    innings: 8,
    notOuts: 1,
    runs: 200 + i * 20,
    highScore: `${60 + i}`,
    wickets: 0,
    runsConceded: 0,
    catches: 2,
  }),
);

/** Three batting innings a season, 2022–2024 (scorecards start after the 2021 debut). */
function battingMatches(p: Partial<PlayerMatchLine> = {}): PlayerMatchLine[] {
  const out: PlayerMatchLine[] = [];
  [2022, 2023, 2024].forEach((s) => {
    [12, 55, 30].forEach((runs, i) => {
      out.push(
        match({
          season: s,
          round: i + 1,
          opponent: i === 0 ? "Mandurah" : "Pinjarra",
          opponentClubId: i === 0 ? 5 : 6,
          battedFirst: i % 2 === 0,
          innings: [
            inn({
              runs,
              battingPos: 3,
              dismissalType: i === 1 ? "bowled" : "caught",
              dismissedBy: "nguyen",
            }),
          ],
          ...p,
        }),
      );
    });
  });
  return out;
}

function distribution(): GradeDistribution {
  const bat = (runs: number, average: number) => ({
    innings: 20,
    notOuts: 2,
    runs,
    average,
    highScore: 80,
    fifties: 2,
    hundreds: 0,
    ballsFaced: runs * 2,
    strikeRate: 50,
  });
  return {
    grade: "A Grade",
    fromSeason: 2020,
    toSeason: 2024,
    minInnings: 10,
    minOvers: 50,
    players: [
      {
        playerId: 42,
        givenName: "Mitchell",
        surname: "Caine",
        games: 32,
        catches: 8,
        batting: bat(900, 30),
        bowling: null,
      },
      {
        playerId: 7,
        givenName: "A",
        surname: "B",
        games: 30,
        catches: 4,
        batting: bat(600, 20),
        bowling: null,
      },
      {
        playerId: 8,
        givenName: "C",
        surname: "D",
        games: 30,
        catches: 12,
        batting: bat(1200, 40),
        bowling: null,
      },
    ],
    best: {
      games: 32,
      catches: 12,
      runs: 1200,
      battingAverage: 40,
      highScore: 80,
      fifties: 2,
      hundreds: 0,
      battingStrikeRate: 50,
      wickets: null,
      maidens: null,
      fiveWickets: null,
      bowlingAverage: null,
      economy: null,
      bowlingStrikeRate: null,
    },
  };
}

function renderProfile(path: string, overrides: Record<string, unknown> = {}) {
  const api = installApiMock({
    "/api/players/42/matches": battingMatches(),
    "/api/players/42/seasons": SEASONS,
    "/api/grades/A%20Grade/distribution": distribution(),
    "/api/grades/A Grade/distribution": distribution(),
    "/api/juniors/players/by-senior": [],
    "/api/social-settings": { settings: {} },
    "/api/caps": [],
    "/api/players/42": PLAYER,
    ...overrides,
  });
  const loc = memoryLocation({ path, record: true });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfirmProvider>
          <Router hook={loc.hook} searchHook={loc.searchHook}>
            <Route path="/players/:id" component={PlayerDetail} />
          </Router>
        </ConfirmProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  const params = () => new URLSearchParams(loc.history!.at(-1)!.split("?")[1] ?? "");
  return { ...utils, api, params };
}

/** Let Recharts' ResponsiveContainer measure a real box, and skip animation. */
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 600,
    height: 240,
    top: 0,
    left: 0,
    right: 600,
    bottom: 240,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("reduce"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const heroLabels = () =>
  Array.from(screen.getByTestId("hero-stats").querySelectorAll("dt")).map((d) => d.textContent);

describe("Player profile analytics (U6)", () => {
  it("shows section skeletons while the per-match and season queries load", async () => {
    const pending = new Promise<Response>(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/matches") || url.includes("/seasons")) return pending;
        const body = url.includes("/api/players/42") ? PLAYER : [];
        return new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const loc = memoryLocation({ path: "/players/42", record: true });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ThemeProvider>
          <ConfirmProvider>
            <Router hook={loc.hook} searchHook={loc.searchHook}>
              <Route path="/players/:id" component={PlayerDetail} />
            </Router>
          </ConfirmProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByTestId("chart-card-loading").length).toBeGreaterThanOrEqual(8);
  });

  it("switches the hero strip between batting and bowling labels with d", async () => {
    renderProfile("/players/42");
    await screen.findByTestId("hero-stats");
    expect(heroLabels()).toEqual([
      "Matches",
      "Runs",
      "Average",
      "High score",
      "Wickets",
      "Best",
      "Catches",
    ]);
    cleanup();
    vi.unstubAllGlobals();
    renderProfile("/players/42?d=bowl");
    await screen.findByTestId("hero-stats");
    expect(heroLabels()).toEqual([
      "Matches",
      "Wickets",
      "Average",
      "Economy",
      "Best",
      "5WI",
      "Maidens",
    ]);
  });

  it("the hero stat strip is range-aware (season rows in range only)", async () => {
    renderProfile("/players/42?from=2023&to=2024");
    await screen.findByTestId("hero-stats");
    const strip = screen.getByTestId("hero-stats");
    // 2023 (240) + 2024 (260) runs; 16 matches.
    expect(within(strip).getByText("500")).toBeTruthy();
    expect(within(strip).getByText("16")).toBeTruthy();
    expect(screen.getByTestId("hero-range").textContent).toBe("2023/24 to 2024/25");
  });

  it("in bowling mode a non-bowler gets the no-bowling empty state in the bowling charts", async () => {
    renderProfile("/players/42?d=bowl");
    await waitFor(() =>
      expect(
        screen.getAllByText("No bowling recorded in this range").length,
      ).toBeGreaterThanOrEqual(4),
    );
  });

  it("the career arc's Bowling tab sets d=bowl in the URL and the hero follows", async () => {
    const { params } = renderProfile("/players/42?from=2023");
    await screen.findByTestId("hero-stats");
    const arc = screen.getByRole("radiogroup", { name: "Career arc discipline" });
    fireEvent.click(within(arc).getByRole("radio", { name: "Bowling" }));
    expect(params().get("d")).toBe("bowl");
    expect(params().get("from")).toBe("2023");
    await waitFor(() => expect(heroLabels()).toContain("Economy"));
    expect(screen.getByTestId("hero-stats").getAttribute("data-discipline")).toBe("bowl");
  });

  it("fades career-arc seasons outside the range", async () => {
    renderProfile("/players/42?from=2023&to=2024");
    const arc = await screen.findByTestId("career-arc");
    await waitFor(() => expect(arc.querySelectorAll("[data-tone]").length).toBe(4));
    const tones = Array.from(arc.querySelectorAll("[data-tone]")).map((b) =>
      b.getAttribute("data-tone"),
    );
    // 2021 and 2022 are outside the range; 2024 (260 runs) is the best in range.
    expect(tones).toEqual(["faded", "faded", "base", "best"]);
  });

  it("shows the Scorecard era note when scorecards start after the debut", async () => {
    renderProfile("/players/42");
    await waitFor(() =>
      expect(screen.getAllByText("Scorecard era: from 2022/23").length).toBeGreaterThan(0),
    );
  });

  it("omits the note when scorecards cover the whole career", async () => {
    renderProfile("/players/42", {
      "/api/players/42/seasons": SEASONS.filter((s) => s.season !== 2021),
    });
    await screen.findByTestId("splits");
    expect(screen.queryByText(/Scorecard era/)).toBeNull();
  });

  it("hides home/away splits when every row's isHome is null, and shows them when known", async () => {
    renderProfile("/players/42");
    await screen.findByTestId("splits");
    expect(screen.queryByTestId("split-homeAway")).toBeNull();
    expect(screen.getByTestId("split-position")).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    renderProfile("/players/42", {
      "/api/players/42/matches": battingMatches({ isHome: true }),
    });
    expect(await screen.findByTestId("split-homeAway")).toBeTruthy();
  });

  it("renders the dismissal donut from typed dismissals", async () => {
    renderProfile("/players/42");
    const donut = await screen.findByTestId("donut");
    // 6 caught, 3 bowled → 67% / 33%.
    const pcts = within(donut)
      .getAllByTestId("donut-pct")
      .map((p) => p.textContent);
    expect(pcts).toEqual(["67%", "33%"]);
  });

  it("toggles ranks between radar and bars without refetching", async () => {
    const { api } = renderProfile("/players/42");
    const ranks = await screen.findByTestId("ranks");
    expect(ranks.getAttribute("data-view")).toBe("radar");
    const fetches = () => api.calls.filter((u) => u.includes("/distribution")).length;
    await waitFor(() => expect(fetches()).toBe(1));
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Ranks view" })).getByRole("radio", {
        name: "Bars",
      }),
    );
    expect(screen.getByTestId("ranks").getAttribute("data-view")).toBe("bars");
    expect(screen.getAllByTestId("percentile-bar").length).toBe(6);
    expect(fetches()).toBe(1);
  });

  it("asks the distribution for the most-played grade over the last five seasons", async () => {
    const { api } = renderProfile("/players/42");
    await screen.findByTestId("ranks");
    await waitFor(() => expect(api.calls.some((u) => u.includes("/distribution"))).toBe(true));
    const call = api.calls.find((u) => u.includes("/distribution"))!;
    expect(call).toMatch(/\/api\/grades\/A(%20| )Grade\/distribution/);
    expect(call).toContain("fromSeason=2020");
    expect(call).toContain("toSeason=2024");
  });

  it("derives milestone moments from firsts, tiers and premierships", async () => {
    renderProfile("/players/42", {
      "/api/players/42": {
        ...PLAYER,
        premiershipsWon: 1,
        premierships: [
          {
            id: 3,
            year: 2024,
            grade: "A Grade",
            competition: "A GRADE",
            matchDate: "2024-03-10",
            isCaptain: false,
          },
        ],
      },
    });
    const timeline = await screen.findByTestId("milestone-timeline");
    await waitFor(() =>
      expect(within(timeline).getAllByTestId("milestone-event").length).toBeGreaterThan(2),
    );
    const kinds = within(timeline)
      .getAllByTestId("milestone-event")
      .map((e) => e.getAttribute("data-kind"));
    expect(kinds).toContain("debut");
    expect(kinds).toContain("firstFifty");
    expect(kinds).toContain("premiership");
  });

  it("renders no Halls Head literal for another tenant's brand", async () => {
    renderProfile("/players/42");
    await screen.findByTestId("splits");
    expect(document.body.textContent).not.toMatch(/Halls Head|HHCC/i);
  });
});
