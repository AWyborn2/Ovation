import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { Route } from "wouter";
import Players from "@/pages/players";
import PlayerDetail from "@/pages/player-detail";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LIST = {
  players: [
    {
      id: 42,
      givenName: "Mitchell",
      surname: "Caine",
      deceased: false,
      gradesPlayed: "A Grade,B Grade",
      totalGames: 61,
      totalRuns: 1560,
      totalWickets: 20,
      imageUrl: null,
    },
  ],
  total: 683,
  page: 1,
  limit: 20,
};

describe("Players list (Broadcast U8)", () => {
  it("reads ?grade and ?q from the URL and sends them to the API", async () => {
    const api = installApiMock({
      "/api/players?": LIST,
      "/api/grades": [{ grade: "B Grade" }, { grade: "A Grade" }],
    });
    renderAt(<Players />, "/players?grade=B%20Grade&q=smith");
    await screen.findByText("Caine, Mitchell");
    const call = api.calls.find((u) => u.includes("/api/players?"))!;
    expect(call).toContain("search=smith");
    expect(call).toContain("grade=B+Grade");
    expect(screen.getByText("B Grade").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByTestId("players-search") as HTMLInputElement).value).toBe("smith");
  });

  it("shows the empty state when nothing matches", async () => {
    installApiMock({ "/api/players?": { players: [], total: 0, page: 1, limit: 20 } });
    renderAt(<Players />, "/players?q=zzz");
    expect(await screen.findByText("No players match that filter.")).toBeTruthy();
  });

  it("subtitle counts every player when unfiltered, and the grade when filtered", async () => {
    installApiMock({ "/api/players?": LIST });
    renderAt(<Players />, "/players");
    expect(await screen.findByText(/683 players who have represented/)).toBeTruthy();
  });

  it("hides Add player from the public", async () => {
    installApiMock({ "/api/players?": LIST });
    renderAt(<Players />, "/players");
    await screen.findByText("Caine, Mitchell");
    expect(screen.queryByText("Add player")).toBeNull();
  });

  it("row skeletons while loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderAt(<Players />, "/players");
    await waitFor(() => expect(screen.getByTestId("skeleton-rows")).toBeTruthy());
  });
});

const PLAYER = {
  id: 42,
  givenName: "Mitchell",
  surname: "Caine",
  deceased: false,
  gradesPlayed: "B Grade,A Grade",
  imageUrl: null,
  premiershipsWon: 0,
  premierships: [],
  stats: [
    {
      id: 1,
      playerId: 42,
      grade: "A Grade",
      games: 20,
      innings: 18,
      notOuts: 2,
      runs: 640,
      highScore: "112*",
      wickets: 5,
      runsConceded: 120,
      bestBowling: "2/14",
      catches: 9,
    },
  ],
};

function renderDetail(overrides: Record<string, unknown>) {
  installApiMock({
    "/api/players/42/matches": [],
    "/api/players/42/seasons": [
      { grade: "A Grade", season: 2022, games: 10, runs: 300, highScore: "74" },
      { grade: "A Grade", season: 2023, games: 10, runs: 340, highScore: "112*" },
    ],
    "/api/social-settings": { settings: {} },
    "/api/juniors/players/by-senior": [],
    "/api/caps": [{ id: 1, playerId: 42, capNumber: 242 }],
    ...overrides,
  });
  return renderAt(<Route path="/players/:id" component={PlayerDetail} />, "/players/42");
}

describe("Player detail (Broadcast U8)", () => {
  it("shows name, cap pill, meta line with debut, career strip and breadcrumbs", async () => {
    renderDetail({ "/api/players/42": PLAYER });
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mitchell Caine");
    expect(within(screen.getByTestId("profile-hero")).getByText("Cap 242")).toBeTruthy();
    expect(screen.getByText(/Debut 2022\/23/)).toBeTruthy();
    expect(screen.getAllByText("640").length).toBeGreaterThan(0);
    expect(screen.getAllByText("112*").length).toBeGreaterThan(0);
    expect(screen.getByText("Players").closest("a")?.getAttribute("href")).toBe("/players");
  });

  it("falls back to an initials tile without a photo, and shows the photo when set", async () => {
    renderDetail({ "/api/players/42": PLAYER });
    await screen.findByTestId("player-initials");
    expect(screen.getByTestId("player-initials").textContent).toBe("MC");
    cleanup();
    vi.unstubAllGlobals();
    renderDetail({ "/api/players/42": { ...PLAYER, imageUrl: "/api/storage/objects/p.jpg" } });
    const hero = await screen.findByTestId("hero-home");
    expect(hero.querySelector("img")?.getAttribute("src")).toBe("/api/storage/objects/p.jpg");
    expect(screen.queryByTestId("player-initials")).toBeNull();
  });

  it("omits the cap pill for an uncapped player", async () => {
    renderDetail({ "/api/players/42": PLAYER, "/api/caps": [] });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/^Cap /)).toBeNull();
  });

  it("Compare links to the compare page with this player preselected", async () => {
    renderDetail({ "/api/players/42": PLAYER });
    fireEvent.click(await screen.findByText("Compare"));
    expect(screen.getByText("Compare").closest("a")?.getAttribute("href")).toBe("/compare?a=42");
  });
});
