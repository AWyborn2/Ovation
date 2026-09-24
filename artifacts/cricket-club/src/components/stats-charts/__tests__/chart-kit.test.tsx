import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DEFAULT_BRAND } from "@workspace/scorecard";
import { deriveThemeTokens, hexToHsl } from "@/lib/theme-tokens";
import {
  BarChart,
  ChartCard,
  Donut,
  HBarList,
  HeatCell,
  LineOverlay,
  Radar,
  StepLine,
  bestIndex,
  hbarWidths,
  heatAlpha,
  heatStep,
  largestRemainderPercents,
} from "..";

/**
 * Recharts draws line / area dots only once its entry animation finishes; with
 * `prefers-reduced-motion: reduce` the kit turns animation off, so marks are
 * present on first render. Line and step charts are asserted in that mode.
 */
function withReducedMotion() {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });
}

const SEASONS = [
  { season: "21/22", runs: 280, avg: 28 },
  { season: "22/23", runs: 401, avg: 36.5 },
  { season: "23/24", runs: 190, avg: 21.1 },
];

describe("ChartCard", () => {
  it("with two points renders the provided empty-state reason instead of the chart", () => {
    render(
      <ChartCard
        title="Career arc"
        points={2}
        emptyReason="No bowling recorded in this range"
        table={{ columns: ["Season", "Wickets"], rows: [["22/23", 3]] }}
      >
        <div data-testid="the-chart" />
      </ChartCard>,
    );
    expect(screen.getByText("No bowling recorded in this range")).toBeInTheDocument();
    expect(screen.queryByTestId("the-chart")).toBeNull();
    expect(screen.queryByTestId("chart-data-table")).toBeNull();
  });

  it("forced empty (detail not captured) shows its reason even with data", () => {
    render(
      <ChartCard
        title="How he gets out"
        points={40}
        empty
        emptyReason="Dismissal detail not recorded"
      >
        <div data-testid="the-chart" />
      </ChartCard>,
    );
    expect(screen.getByText("Dismissal detail not recorded")).toBeInTheDocument();
    expect(screen.queryByTestId("the-chart")).toBeNull();
  });

  it("while loading renders the skeleton, not the chart or an empty state", () => {
    render(
      <ChartCard title="Form guide" loading points={0} emptyReason="Nothing yet">
        <div data-testid="the-chart" />
      </ChartCard>,
    );
    expect(screen.getByTestId("chart-card-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("the-chart")).toBeNull();
    expect(screen.queryByText("Nothing yet")).toBeNull();
    expect(screen.getByRole("region", { name: "Form guide" })).toHaveAttribute("aria-busy", "true");
  });

  it("renders eyebrow, H2 and note, then the chart with a visually hidden data table", () => {
    render(
      <ChartCard
        eyebrow="Career arc · 3 seasons"
        title="Runs by season"
        note="Best season: 2022/23"
        points={3}
        table={{
          columns: ["Season", "Runs", "Average"],
          rows: SEASONS.map((s) => [s.season, s.runs, s.avg]),
        }}
      >
        <div data-testid="the-chart" />
      </ChartCard>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Runs by season" })).toBeInTheDocument();
    expect(screen.getByText("Career arc · 3 seasons")).toBeInTheDocument();
    expect(screen.getByText("Best season: 2022/23")).toBeInTheDocument();
    expect(screen.getByTestId("the-chart")).toBeInTheDocument();
    const table = screen.getByTestId("chart-data-table");
    expect(table).toHaveClass("sr-only");
    for (const s of SEASONS) {
      const row = within(table).getByRole("row", { name: new RegExp(s.season) });
      expect(row).toHaveTextContent(String(s.runs));
      expect(row).toHaveTextContent(String(s.avg));
    }
  });
});

describe("BarChart", () => {
  it("focusing a bar shows its tooltip text; every bar is a focusable mark", () => {
    render(
      <BarChart
        data={SEASONS}
        xKey="season"
        series={[{ key: "runs", name: "Runs" }]}
        tooltip={(r) => `20${r.season}: ${r.runs} runs at ${r.avg}`}
        tone={(r) => (r.runs === 401 ? "best" : "base")}
        valueLabels
        width={480}
        height={200}
      />,
    );
    const bars = screen.getAllByTestId("chart-bar");
    expect(bars).toHaveLength(3);
    bars.forEach((b) => expect(b).toHaveAttribute("tabindex", "0"));
    expect(bars[1]).toHaveAttribute("aria-label", "2022/23: 401 runs at 36.5");
    fireEvent.focus(bars[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("2022/23: 401 runs at 36.5");
    fireEvent.blur(bars[1]);
    expect(screen.queryByRole("tooltip")).toBeNull();
    // Best season solid accent; others at 38%.
    expect(bars[1].getAttribute("fill")).toBe("hsl(var(--chart-a))");
    expect(bars[0].getAttribute("fill")).toBe("hsl(var(--chart-a) / 0.38)");
  });

  it("grouped series use the A / B / C chart tokens", () => {
    const data = [
      { s: "24/25", a: 300, b: 220 },
      { s: "25/26", a: 180, b: 260 },
    ];
    render(
      <BarChart
        data={data}
        xKey="s"
        series={[
          { key: "a", name: "Player A" },
          { key: "b", name: "Player B" },
        ]}
        tooltip={(r, s) => `${s.name} ${r.s}: ${r[s.key as "a" | "b"]}`}
        width={480}
        height={200}
      />,
    );
    const fills = screen.getAllByTestId("chart-bar").map((b) => b.getAttribute("fill"));
    expect(fills).toContain("hsl(var(--chart-a))");
    expect(fills).toContain("hsl(var(--chart-b))");
  });
});

describe("LineOverlay (reduced motion)", () => {
  withReducedMotion();

  it("renders bars plus a focusable dot per line point", () => {
    render(
      <LineOverlay
        data={SEASONS}
        xKey="season"
        bars={{ key: "runs", name: "Runs" }}
        lines={[{ key: "avg", name: "Average" }]}
        tooltip={(r, k) =>
          k === "avg" ? `${r.season}: average ${r.avg}` : `${r.season}: ${r.runs}`
        }
        width={480}
        height={220}
      />,
    );
    expect(screen.getAllByTestId("chart-bar")).toHaveLength(3);
    const dots = screen.getAllByTestId("chart-dot");
    expect(dots).toHaveLength(3);
    fireEvent.focus(dots[2]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("23/24: average 21.1");
  });
});

describe("Radar", () => {
  it("draws focusable vertices for player polygons only", () => {
    const axes = [
      { key: "runs", label: "Runs" },
      { key: "avg", label: "Average" },
      { key: "sr", label: "Strike rate" },
    ];
    render(
      <Radar
        axes={axes}
        series={[
          { name: "Player", values: { runs: 80, avg: 64, sr: 71 } },
          { name: "Club median", values: { runs: 50, avg: 50, sr: 50 }, variant: "dashed" },
        ]}
        tooltip={(a, s, v) => `${s.name} ${a.label}: ${v}th percentile`}
        width={320}
        height={300}
      />,
    );
    const dots = screen.getAllByTestId("chart-dot");
    expect(dots).toHaveLength(3);
    fireEvent.focus(dots[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Player Average: 64th percentile");
  });
});

describe("Donut", () => {
  it("legend percentages sum to 100 after largest-remainder rounding", () => {
    const segments = [
      { label: "Caught", value: 1 },
      { label: "Bowled", value: 1 },
      { label: "LBW", value: 1 },
    ];
    render(<Donut segments={segments} centerValue="33%" centerLabel="caught" />);
    const pcts = screen.getAllByTestId("donut-pct").map((el) => parseInt(el.textContent!, 10));
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(pcts).toEqual([34, 33, 33]);
    const seg = screen.getAllByTestId("donut-segment");
    expect(seg).toHaveLength(3);
    fireEvent.focus(seg[0]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Caught: 1 (34%)");
  });

  it("largestRemainderPercents always totals 100 and gives leftovers to the largest remainders", () => {
    const cases = [
      [58, 17, 12, 6, 4, 3],
      [7, 7, 7, 7, 7, 7],
      [1, 2, 3],
      [98, 1, 1],
      [0, 5, 0],
    ];
    for (const c of cases) {
      expect(largestRemainderPercents(c).reduce((a, b) => a + b, 0)).toBe(100);
    }
    expect(largestRemainderPercents([1, 2, 3])).toEqual([17, 33, 50]);
    expect(largestRemainderPercents([0, 0])).toEqual([0, 0]);
  });
});

describe("HBarList", () => {
  const items = [
    { id: 1, label: "Allen", value: 17.8, tip: "Allen: average 17.8" },
    { id: 2, label: "Caine", value: 24.1, tip: "Caine: average 24.1" },
    { id: 3, label: "Adams", value: 35.6, tip: "Adams: average 35.6" },
  ];

  it("in lower-is-better mode gives the smallest value the longest bar", () => {
    render(<HBarList label="Bowling average" items={items} lowerIsBetter />);
    const widths = screen
      .getAllByTestId("hbar-fill")
      .map((el) => parseFloat((el as HTMLElement).style.width));
    expect(widths[0]).toBe(100);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
    expect(screen.getAllByTestId("hbar-row")[0]).toHaveAttribute("data-leader", "true");
  });

  it("higher-is-better scales to the max; rows are focusable with tooltips", () => {
    render(<HBarList label="Runs" items={items} />);
    const rows = screen.getAllByTestId("hbar-row");
    expect(rows[2]).toHaveAttribute("data-leader", "true");
    fireEvent.focus(rows[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Caine: average 24.1");
  });

  it("hbarWidths / bestIndex helpers", () => {
    expect(hbarWidths([10, 20, 40])).toEqual([0.25, 0.5, 1]);
    expect(hbarWidths([2, 4, null], true)).toEqual([1, 0.5, 0]);
    expect(bestIndex([3, 9, 1])).toBe(1);
    expect(bestIndex([3, 9, 1], true)).toBe(2);
    expect(bestIndex([null, undefined])).toBe(-1);
  });
});

describe("StepLine (reduced motion)", () => {
  withReducedMotion();

  it("marks each record with a focusable dot, the final one starred", () => {
    render(
      <StepLine
        points={[
          { x: "2004", value: 120, tip: "120 · A. Smith · 2004" },
          { x: "2011", value: 145, tip: "145 · B. Jones · 2011" },
          { x: "2020", value: 187, tip: "187* · B. Anderson · 2020" },
        ]}
        width={480}
        height={240}
      />,
    );
    const dots = screen.getAllByTestId("chart-dot");
    expect(dots).toHaveLength(3);
    expect(screen.getByText("187*")).toBeInTheDocument();
    fireEvent.focus(dots[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("145 · B. Jones · 2011");
  });
});

describe("HeatCell", () => {
  it("uses the 4-step scale for 0, 1, 2 and 3+", () => {
    render(
      <div>
        {[0, 1, 2, 5].map((n) => (
          <HeatCell key={n} step={heatStep(n)} tip={`${n} hundreds`}>
            {n}
          </HeatCell>
        ))}
      </div>,
    );
    const cells = screen.getAllByTestId("heat-cell");
    expect(cells.map((c) => c.getAttribute("data-step"))).toEqual(["0", "1", "2", "3"]);
    expect(cells[3]).toHaveStyle({ background: "hsl(var(--chart-a))" });
    expect(cells[1]).toHaveAttribute("aria-label", "1 hundreds");
    expect(cells[1]).toHaveAttribute("tabindex", "0");
  });

  it("heatAlpha maps into .06–.85 and inverts when lower is better", () => {
    expect(heatAlpha(18, 18, 50)).toBe(0.06);
    expect(heatAlpha(50, 18, 50)).toBe(0.85);
    expect(heatAlpha(18, 18, 50, true)).toBe(0.85);
    expect(heatAlpha(99, 18, 50)).toBe(0.85);
  });
});

describe("chart tokens (KTD7)", () => {
  it("a purple brand drives --chart-a / --donut-1 in both modes", () => {
    const purple = { ...DEFAULT_BRAND, primaryColour: "#7B6EF6" };
    const hue = hexToHsl(purple.primaryColour)!.h;
    for (const mode of ["light", "dark"] as const) {
      const t = deriveThemeTokens(purple, mode);
      expect(parseInt(t["--chart-a"], 10), mode).toBe(hue);
      expect(t["--donut-1"]).toBe(t["--chart-a"]);
    }
    expect(deriveThemeTokens(purple, "dark")["--chart-a"]).toBe(
      deriveThemeTokens(purple, "dark")["--primary"],
    );
  });

  it("follows a --primary theme override and keeps the kebab-case token set", () => {
    const t = deriveThemeTokens(
      { ...DEFAULT_BRAND, themeOverrides: { "--primary": "#15803D" } },
      "dark",
    );
    expect(t["--chart-a"]).toBe(t["--primary"]);
    for (const key of [
      "--chart-a",
      "--chart-b",
      "--chart-c",
      "--bar-mute",
      "--line-b",
      "--donut-1",
      "--donut-6",
    ]) {
      expect(t[key], key).toMatch(/^\d+ \d+% \d+%$/);
    }
    expect(t["--line-b"]).toBe(t["--foreground"]);
  });
});
