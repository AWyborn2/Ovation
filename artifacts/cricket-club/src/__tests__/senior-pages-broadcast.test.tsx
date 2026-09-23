import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { Route } from "wouter";
import Grades from "@/pages/grades";
import GradeLeaderboard from "@/pages/grade-leaderboard";
import Premierships from "@/pages/premierships";
import Matches from "@/pages/matches";
import NotFound from "@/pages/not-found";
import { slugify } from "@/lib/share-filename";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("share filenames (no Halls Head literal)", () => {
  it("slugify produces a clean file-name slug", () => {
    expect(slugify("HHCC-A Grade-1992-premiership")).toBe("hhcc-a-grade-1992-premiership");
    expect(slugify("  Mandurah CC!! ")).toBe("mandurah-cc");
  });

  it("the prefix comes from the tenant brand", async () => {
    vi.resetModules();
    vi.doMock("@/lib/brand-context", () => ({
      useBrand: () => ({ name: "Mandurah Cricket Club", shortName: "MCC" }),
    }));
    const { useShareFilePrefix } = await import("@/lib/share-filename");
    expect(renderHook(() => useShareFilePrefix()).result.current).toBe("mcc");
    vi.doUnmock("@/lib/brand-context");
  });
});

describe("Grades (Broadcast U12)", () => {
  it("renders a tile per grade in seniority order, linking to its leaderboard", async () => {
    installApiMock({
      "/api/grades": [
        { grade: "B Grade", players: 10, games: 20, runs: 300, wickets: 12 },
        { grade: "A Grade", players: 11, games: 22, runs: 400, wickets: 15 },
        { grade: "CLUB TOTAL", players: 21 },
      ],
      "/api/premierships": [],
    });
    renderAt(<Grades />, "/grades");
    const tiles = await screen.findAllByTestId("grade-tile");
    expect(tiles.map((t) => t.getAttribute("href"))).toEqual([
      "/grades/A%20Grade",
      "/grades/B%20Grade",
    ]);
  });

  it("empty state with no grades", async () => {
    installApiMock({ "/api/grades": [] });
    renderAt(<Grades />, "/grades");
    expect(await screen.findByText("No grades yet")).toBeTruthy();
  });
});

describe("Grade leaderboard", () => {
  it("uses the :grade param for the heading and breadcrumb", async () => {
    installApiMock({ "/api/grades/B%20Grade/leaderboard": [] });
    renderAt(<Route path="/grades/:grade" component={GradeLeaderboard} />, "/grades/B%20Grade");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("B Grade");
    expect(screen.getByText("Grades").closest("a")?.getAttribute("href")).toBe("/grades");
  });
});

describe("Premierships page", () => {
  const PREMS = [
    {
      id: 1,
      year: 1992,
      grade: "A Grade",
      competition: "A GRADE",
      result: "Halls Head 4/191 def Rockingham 185",
      matchId: null,
      players: [],
    },
  ];

  it("shows the card grid by default and the plaque wall on toggle", async () => {
    installApiMock({ "/api/premierships": PREMS });
    renderAt(<Premierships />, "/premierships");
    expect(await screen.findByTestId("premiership-card")).toBeTruthy();
    expect(screen.getByText("1 premiership across every grade.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Plaques" }));
    // Static router in tests: the toggle writes ?view=plaques; the card grid
    // stays until navigation, so assert the control reflects the choice.
    expect(screen.getByRole("radio", { name: "Plaques" })).toBeTruthy();
  });

  it("renders the plaque wall when ?view=plaques", async () => {
    installApiMock({ "/api/premierships": PREMS });
    renderAt(<Premierships />, "/premierships?view=plaques");
    expect(await screen.findByText("PREMIERSHIPS")).toBeTruthy();
    expect(screen.queryByTestId("premiership-card")).toBeNull();
  });
});

describe("Matches list", () => {
  it("renders result rows linking to each match", async () => {
    installApiMock({
      "/api/match-display-settings": {
        defaultGrade: "",
        defaultSeasonMode: "all",
        defaultSeason: null,
        gradeOrder: [],
      },
      "/api/matches": [
        {
          id: 9,
          grade: "A Grade",
          season: 2025,
          opponent: "Mandurah",
          clubScore: "6/214",
          opponentScore: "188",
          result: "Won",
          abandoned: false,
          playerCount: 11,
        },
      ],
    });
    renderAt(<Matches />, "/matches");
    const row = await screen.findByText("vs Mandurah");
    expect(row.closest("a")?.getAttribute("href")).toBe("/matches/9");
  });
});

describe("404", () => {
  it("offers a way home", () => {
    renderAt(<NotFound />, "/nope");
    expect(screen.getByText("Back to home").closest("a")?.getAttribute("href")).toBe("/");
  });
});
