import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import JuniorsDashboard from "@/pages/juniors-dashboard";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OVERVIEW = {
  latestSeason: "2025/26",
  totals: { matches: 1828, players: 688, premierships: 15, seasons: 12, ageGroups: 8 },
  recentMatches: [
    {
      id: 5,
      ageGroup: "Under 15",
      teamName: "Halls Head U15",
      round: "Round 10",
      matchDate: "2026-02-01",
      opponentName: "Mandurah",
      hhScore: "6/120",
      opponentScore: "118",
      hhResult: "Won",
      isHallsHead: true,
    },
  ],
};

const TOP = {
  season: "2025/26",
  availableAgeGroups: ["Under 15"],
  topRunScorers: [{ participantId: "p1", displayName: "Sam Smith", runs: 310 }],
  topWicketTakers: [],
};

const PREMS = [
  {
    id: 1,
    season: "2024/25",
    teamName: "Halls Head U15",
    players: [{ id: 1, playerName: "Ava Jones", isCaptain: true }],
  },
];

function mockJuniors(overrides: Record<string, unknown> = {}) {
  return installApiMock({
    "/api/juniors/top-performers": TOP,
    "/api/juniors/overview": OVERVIEW,
    "/api/juniors/premierships": PREMS,
    "/api/juniors/filters": { seasons: ["2025/26"], ageGroups: ["Under 15"] },
    ...overrides,
  });
}

describe("Juniors home (Broadcast U11)", () => {
  it("renders tiles, a brown-tile result row, premierships and leaders", async () => {
    mockJuniors();
    renderAt(<JuniorsDashboard />, "/juniors");
    expect(await screen.findByText("1,828")).toBeTruthy();
    expect(screen.getByText("vs Mandurah")).toBeTruthy();
    expect(screen.getByText("U15")).toBeTruthy();
    expect(screen.getByText("Captain Ava Jones")).toBeTruthy();
    expect(await screen.findByText("Sam Smith")).toBeTruthy();
  });

  it("reads only /api/juniors/* endpoints (juniors isolation, AE4)", async () => {
    const api = mockJuniors();
    renderAt(<JuniorsDashboard />, "/juniors");
    await screen.findByText("vs Mandurah");
    const dataCalls = api.calls.filter((u) => u.includes("/api/") && !u.includes("/nav-items"));
    expect(dataCalls.length).toBeGreaterThan(0);
    expect(dataCalls.every((u) => u.includes("/api/juniors/"))).toBe(true);
  });

  it("the hero sits on the tenant juniors colour with no photo (AE5)", () => {
    mockJuniors();
    renderAt(<JuniorsDashboard />, "/juniors");
    const hero = screen.getByTestId("hero-juniors");
    expect(hero.querySelector("img")).toBeNull();
    expect(hero.style.background).toContain("--juniors-accent");
  });

  it("shows empty states when there are no results or premierships", async () => {
    mockJuniors({
      "/api/juniors/overview": { ...OVERVIEW, recentMatches: [] },
      "/api/juniors/premierships": [],
    });
    renderAt(<JuniorsDashboard />, "/juniors");
    expect(await screen.findByText("No junior results yet.")).toBeTruthy();
    expect(screen.getByText("No junior premierships recorded yet.")).toBeTruthy();
  });

  it("shows tile skeletons while loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderAt(<JuniorsDashboard />, "/juniors");
    await waitFor(() => expect(screen.getByTestId("skeleton-tiles")).toBeTruthy());
  });
});
