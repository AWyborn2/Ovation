import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CAREER,
  baselineTotals,
  filterMatches,
  filterSeasonRows,
  inningsOf,
  matchTotals,
  scorecardCoverage,
  sortMatchesChronological,
} from "./range";
import { inn, match, season } from "./test-fixtures";

describe("range filter", () => {
  const seasons = [
    season({ season: null, runs: 900 }),
    season({ season: 2021, runs: 100 }),
    season({ season: 2022, runs: 200 }),
    season({ season: 2023, runs: 300 }),
    season({ season: 2024, runs: 400 }),
  ];

  it("keeps seasons from–to inclusive and drops the baseline", () => {
    const kept = filterSeasonRows(seasons, { from: 2022, to: 2023 });
    expect(kept.map((s) => s.season)).toEqual([2022, 2023]);
  });

  it("Career keeps every row, the baseline included", () => {
    expect(filterSeasonRows(seasons, CAREER)).toHaveLength(5);
  });

  it("open-ended ranges keep one side unbounded", () => {
    expect(filterSeasonRows(seasons, { from: 2023, to: null }).map((s) => s.season)).toEqual([
      2023, 2024,
    ]);
  });

  it("filters match rows the same way", () => {
    const rows = [2021, 2022, 2023, 2024].map((s) => match({ season: s }));
    expect(filterMatches(rows, { from: 2022, to: 2023 }).map((m) => m.season)).toEqual([
      2022, 2023,
    ]);
    expect(filterMatches(rows, CAREER)).toHaveLength(4);
  });
});

describe("ordering and flattening", () => {
  it("sorts oldest first with finals after regular rounds", () => {
    const gf = match({ season: 2023, round: null, stage: "Grand Final" });
    const r9 = match({ season: 2023, round: 9 });
    const r1 = match({ season: 2023, round: 1 });
    const old = match({ season: 2022, round: 12 });
    expect(sortMatchesChronological([gf, r9, r1, old]).map((m) => m.matchId)).toEqual([
      old.matchId,
      r1.matchId,
      r9.matchId,
      gf.matchId,
    ]);
  });

  it("expands a two-innings match into two innings in order", () => {
    const m = match({ innings: [inn({ runs: 12 }), inn({ runs: 40, notOut: true })] });
    const list = inningsOf([m]);
    expect(list.map((i) => [i.runs, i.inningsNo, i.notOut])).toEqual([
      [12, 1, false],
      [40, 2, true],
    ]);
  });

  it("totals count both innings of a two-innings match", () => {
    const t = matchTotals([
      match({ innings: [inn({ runs: 12, balls: 20 }), inn({ runs: 40, notOut: true })] }),
      match({
        innings: [inn({ runs: 5, balls: 9 })],
        bowled: true,
        wickets: 2,
        runsConceded: 30,
        overs: "6.3",
      }),
    ]);
    expect(t).toMatchObject({
      matches: 2,
      innings: 3,
      outs: 2,
      notOuts: 1,
      runs: 57,
      ballsFaced: 29,
      bowlingMatches: 1,
      wickets: 2,
      runsConceded: 30,
      ballsBowled: 39,
    });
  });
});

describe("coverage", () => {
  it("sums the baseline rows across grades", () => {
    const b = baselineTotals([
      season({ season: null, runs: 1500, games: 40 }),
      season({ season: null, grade: "B Grade", runs: 500, games: 10 }),
      season({ season: 2024, runs: 999, games: 9 }),
    ]);
    expect(b.runs).toBe(2000);
    expect(b.games).toBe(50);
  });

  it("notes the scorecard era when scorecards start after debut", () => {
    const c = scorecardCoverage(
      [season({ season: 2015 }), season({ season: 2020 })],
      [match({ season: 2020 })],
    );
    expect(c.partial).toBe(true);
    expect(c.note).toBe("Scorecard era: from 2020/21");
  });

  it("notes the scorecard era when a baseline exists", () => {
    const c = scorecardCoverage(
      [season({ season: null, games: 30 }), season({ season: 2020 })],
      [match({ season: 2020 })],
    );
    expect(c.hasBaseline).toBe(true);
    expect(c.note).toBe("Scorecard era: from 2020/21");
  });

  it("has no note when scorecards cover the whole career", () => {
    const c = scorecardCoverage([season({ season: 2020 })], [match({ season: 2020 })]);
    expect(c.partial).toBe(false);
    expect(c.note).toBeNull();
  });
});

describe("module purity", () => {
  it("has no React or fetch in its sources", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThan(5);
    for (const f of sources) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/from ["']react["']|from ["']@tanstack|\bfetch\(/);
      // Generated client imports are type-only (no hooks at runtime).
      expect(src, f).not.toMatch(/^import \{[^}]*\} from ["']@workspace\/api-client-react["']/m);
    }
  });
});
