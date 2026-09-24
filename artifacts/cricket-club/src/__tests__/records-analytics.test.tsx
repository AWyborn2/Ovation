import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme-context";
import { installApiMock } from "../test/mock-api";
import Records from "@/pages/records";
import {
  bestStandPerWicket,
  buildRecordWatch,
  centuriesHeatmap,
  defaultGradeTab,
  fiveForsTimeline,
} from "@/pages/records/model";
import { sortGradesBySeniority } from "@/components/grade-badge";
import type { RecordLeaderRow } from "@workspace/api-client-react";

/**
 * Records rebuild (stats plan U10): chart-led sections driven by the grade tabs
 * and the season bar. Pure derivations are tested directly; the page is
 * rendered against the canned API to check loading, empty and refetch
 * behaviour.
 */

/** Like test/render's renderAt, but navigable (grade tabs / season bar write the URL). */
function renderAt(ui: React.ReactNode, path: string) {
  const { hook, searchHook } = memoryLocation({ path });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <Router hook={hook} searchHook={searchHook}>
          {ui}
        </Router>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const leader = (
  rank: number,
  playerId: number,
  name: string,
  value: number,
  lastSeason: number | null,
): RecordLeaderRow => {
  const [givenName, surname] = name.split(" ");
  return { rank, playerId, givenName, surname, value, lastSeason };
};

const RUNS = [
  leader(1, 1, "Alan Top", 5812, 2019),
  leader(2, 2, "Clint Adams", 4120, 2016),
  leader(3, 3, "Rylan Arms", 3905, 2025), // active, 5.2% behind Adams → watch
  leader(4, 4, "Craig Wylie", 3740, 2012), // retired, within 10% of Arms → never
  leader(5, 5, "Mitch Caine", 2000, 2025), // active but far behind
];

const GRADES = [{ grade: "A Grade" }, { grade: "B Grade" }];

function mockPage(overrides: Record<string, unknown> = {}) {
  return installApiMock({
    "/records-display-settings": {
      defaultTab: "total",
      byGradeDefaultGrade: "",
      partnershipsDefaultGrade: "",
      centuriesSort: "season-desc",
      fiveForSort: "season-desc",
    },
    "/records/leaders?metric=runs": { metric: "runs", entries: RUNS },
    "/records/leaders": { metric: "wickets", entries: [] },
    "/records/progression": { kind: "highScore", points: [] },
    "/api/records": {},
    "/api/grades": GRADES,
    ...overrides,
  });
}

describe("record watch rules", () => {
  it("includes an active player within 10% of the next place, never a retired one", () => {
    const items = buildRecordWatch({ runs: RUNS }, 2025);
    const names = items.map((w) => w.name);
    expect(names).toContain("Rylan Arms");
    expect(names).not.toContain("Craig Wylie");
    expect(names).not.toContain("Mitch Caine");
    const arms = items.find((w) => w.name === "Rylan Arms")!;
    expect(arms.target).toBe("Pass Clint Adams for 2nd on career runs");
    expect(arms.need).toBe("216 runs");
    expect(arms.goal).toBe(4121);
  });

  it("flags a round-number club first and the games record", () => {
    const items = buildRecordWatch(
      {
        wickets: [leader(1, 7, "Blake Allen", 388, 2025)],
        games: [leader(1, 7, "Blake Allen", 172, 2010), leader(2, 8, "Ben Anders", 164, 2024)],
      },
      2025,
    );
    expect(items.map((w) => w.target)).toEqual(
      expect.arrayContaining(["First player to 400 wickets", "Pass Blake Allen for most games"]),
    );
    // One card per (player, target) even though two rules match the games pass.
    expect(items.filter((w) => w.target === "Pass Blake Allen for most games")).toHaveLength(1);
  });
});

describe("records derivations", () => {
  it("lands on the display settings' default grade tab", () => {
    const grades = ["A Grade", "B Grade"];
    expect(defaultGradeTab(null, grades)).toBe("all");
    expect(
      defaultGradeTab(
        { defaultTab: "by-grade", byGradeDefaultGrade: "B Grade", partnershipsDefaultGrade: "" },
        grades,
      ),
    ).toBe("B Grade");
    expect(
      defaultGradeTab(
        { defaultTab: "by-grade", byGradeDefaultGrade: "Gone", partnershipsDefaultGrade: "" },
        grades,
      ),
    ).toBe("A Grade");
    expect(
      defaultGradeTab(
        { defaultTab: "centuries", byGradeDefaultGrade: "B Grade", partnershipsDefaultGrade: "" },
        grades,
      ),
    ).toBe("all");
  });

  it("builds the heatmap per grade and season, filtered by range", () => {
    const cents = [
      { id: 1, grade: "A Grade", batsman: "x", season: "2019/20" },
      { id: 2, grade: "A Grade", batsman: "x", season: "2019/20" },
      { id: 3, grade: "B Grade", batsman: "x", season: "2021-22" },
      { id: 4, grade: "A Grade", batsman: "x", season: "2010/11" },
      { id: 5, grade: "A Grade", batsman: "x", season: null },
    ];
    const m = centuriesHeatmap(cents, "all", { from: 2019, to: 2021 }, sortGradesBySeniority);
    expect(m.seasons).toEqual([2019, 2020, 2021]);
    expect(m.counts.get("A Grade")?.get(2019)).toBe(2);
    expect(m.counts.get("B Grade")?.get(2021)).toBe(1);
    expect(m.total).toBe(3);
    const a = centuriesHeatmap(cents, "B Grade", { from: null, to: null }, sortGradesBySeniority);
    expect(a.grades).toEqual(["B Grade"]);
  });

  it("keeps the best stand per wicket in the grade and range", () => {
    const pool = [
      { id: 1, grade: "A Grade", wicket: "1st", runs: 120, batsmen: "A / B", season: "2002/03" },
      { id: 2, grade: "A Grade", wicket: "1st", runs: 90, batsmen: "C / D", season: "2020/21" },
      { id: 3, grade: "B Grade", wicket: "2nd", runs: 150, batsmen: "E / F", season: "2020/21" },
    ];
    expect(bestStandPerWicket(pool, "all", { from: null, to: null }).map((p) => p.id)).toEqual([
      1, 3,
    ]);
    expect(bestStandPerWicket(pool, "A Grade", { from: 2015, to: null }).map((p) => p.id)).toEqual([
      2,
    ]);
  });
});

describe("Records page", () => {
  beforeEach(() => {
    mockPage();
  });

  it("shows skeletons while queries load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderAt(<Records />, "/records");
    expect(await screen.findAllByTestId("chart-card-loading")).not.toHaveLength(0);
    expect(screen.queryByTestId("record-cards")).toBeNull();
  });

  it("renders record watch from the leaders data", async () => {
    renderAt(<Records />, "/records");
    const watch = await screen.findByTestId("record-watch");
    expect(within(watch).getByText("Rylan Arms")).toBeTruthy();
    expect(within(watch).queryByText("Craig Wylie")).toBeNull();
  });

  it("paints heatmap cells on the 4-step scale", async () => {
    mockPage({
      "/centuries": [
        { id: 1, grade: "A Grade", batsman: "a", season: "2020/21" },
        { id: 2, grade: "A Grade", batsman: "a", season: "2021/22" },
        { id: 3, grade: "A Grade", batsman: "a", season: "2021/22" },
        ...[4, 5, 6, 7].map((id) => ({ id, grade: "A Grade", batsman: "a", season: "2023/24" })),
      ],
    });
    renderAt(<Records />, "/records");
    const map = await screen.findByTestId("hundreds-heatmap");
    const steps = within(map)
      .getAllByTestId("heat-cell")
      .map((c) => c.getAttribute("data-step"));
    // 2020: 1, 2021: 2, 2022: 0, 2023: 4 → 3+.
    expect(steps).toEqual(["1", "2", "0", "3"]);
  });

  it("renders 7+ five-fors solid and 5–6 ringed", async () => {
    mockPage({
      "/five-wicket-hauls": [
        { id: 1, grade: "A Grade", bowler: "a", figures: "7/23", season: "2020/21" },
        { id: 2, grade: "A Grade", bowler: "b", figures: "5/40", season: "2020/21" },
        { id: 3, grade: "B Grade", bowler: "c", figures: "6/12", season: "2022/23" },
      ],
    });
    renderAt(<Records />, "/records");
    const dots = await screen.findAllByTestId("haul-dot");
    expect(dots.map((d) => d.getAttribute("data-haul")).sort()).toEqual(["ring", "ring", "solid"]);
    expect(fiveForsTimeline([], "all", { from: null, to: null }).total).toBe(0);
  });

  it("shows the partnerships empty state for a central tenant", async () => {
    mockPage({ "/partnerships": { records: [], fiftyPlus: [] } });
    renderAt(<Records />, "/records");
    expect(await screen.findByText("No partnerships recorded")).toBeTruthy();
  });

  it("refetches every records request with the grade param on a grade tab", async () => {
    const mock = mockPage();
    renderAt(<Records />, "/records");
    const tabs = await screen.findByTestId("records-grade-tabs");
    const tab = await within(tabs).findByRole("button", { name: "A Grade" });
    fireEvent.click(tab);
    await waitFor(() => {
      const graded = mock.calls.filter((u) => u.includes("grade=A+Grade"));
      expect(graded.some((u) => /\/api\/records\?/.test(u))).toBe(true);
      expect(graded.some((u) => u.includes("/api/records/leaders"))).toBe(true);
      expect(graded.some((u) => u.includes("/api/records/progression"))).toBe(true);
    });
  });
});
