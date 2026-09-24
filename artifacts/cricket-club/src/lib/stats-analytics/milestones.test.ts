import { describe, expect, it } from "vitest";
import {
  careerFirsts,
  DEFAULT_MILESTONE_TIERS,
  milestoneEta,
  milestoneTiers,
  nextMilestones,
  tierCrossings,
} from "./milestones";
import { bowl, inn, match, season } from "./test-fixtures";

describe("milestone tiers", () => {
  it("uses the board's ladders, sorted, falling back to the defaults", () => {
    expect(milestoneTiers({ runsTiers: [2000, 500], gamesTiers: [] })).toEqual({
      games: DEFAULT_MILESTONE_TIERS.games,
      runs: [500, 2000],
      wickets: DEFAULT_MILESTONE_TIERS.wickets,
    });
    expect(milestoneTiers(null)).toEqual(DEFAULT_MILESTONE_TIERS);
  });
});

describe("tier crossings", () => {
  it("2,000 baseline runs + 300 scorecard runs: 2,000 crossed pre-scorecard, no new 1,000", () => {
    const seasons = [season({ season: null, runs: 2000, games: 60 }), season({ season: 2024 })];
    const matches = [100, 100, 100].map((r, i) =>
      match({ season: 2024, round: i + 1, innings: [inn({ runs: r })] }),
    );
    const runs = tierCrossings(matches, seasons).filter((c) => c.stat === "runs");
    expect(runs.map((c) => [c.tier, c.preScorecard])).toEqual([
      [1000, true],
      [2000, true],
    ]);
    expect(runs.some((c) => !c.preScorecard)).toBe(false);
  });

  it("dates a crossing to the match that passes it, seeded by the baseline", () => {
    const seasons = [season({ season: null, runs: 2950 })];
    const m1 = match({ season: 2024, round: 1, innings: [inn({ runs: 30 })] });
    const m2 = match({
      season: 2024,
      round: 2,
      opponent: "Pinjarra",
      innings: [inn({ runs: 15 }), inn({ runs: 10 })],
    });
    const crossing = tierCrossings([m2, m1], seasons).find(
      (c) => c.stat === "runs" && c.tier === 3000,
    );
    expect(crossing).toMatchObject({ preScorecard: false, matchId: m2.matchId, value: 3005 });
  });

  it("uses custom ladders", () => {
    const matches = Array.from({ length: 5 }, (_, i) => match({ round: i + 1 }));
    const games = tierCrossings(matches, [], { games: [3, 5], runs: [], wickets: [] });
    expect(games.map((c) => c.tier)).toEqual([3, 5]);
  });
});

describe("career firsts", () => {
  it("dates firsts to scorecard matches when there is no baseline", () => {
    const m1 = match({ round: 1, innings: [inn({ runs: 12 })] });
    const m2 = match({ round: 2, innings: [inn({ runs: 55, notOut: true })], ...bowl(5, 30) });
    const f = careerFirsts([m2, m1], [season({ season: 2024 })]);
    expect(f.map((x) => [x.kind, x.matchId])).toEqual([
      ["debut", m1.matchId],
      ["firstFifty", m2.matchId],
      ["firstFiveFor", m2.matchId],
    ]);
  });

  it("leaves pre-scorecard firsts undated", () => {
    const f = careerFirsts(
      [match({ innings: [inn({ runs: 70 })] })],
      [season({ season: null, games: 20, fifties: 2 })],
    );
    expect(f.map((x) => [x.kind, x.preScorecard])).toEqual([
      ["debut", true],
      ["firstFifty", true],
    ]);
  });
});

describe("next milestone + ETA", () => {
  it("480 runs needed at 40 a match and 12 matches a season is 1 season", () => {
    expect(milestoneEta(480, 40, 12)?.label).toBe("1 season");
    const seasons = [season({ season: null, runs: 2040 })];
    const matches = Array.from({ length: 12 }, (_, i) =>
      match({ season: 2024, round: i + 1, innings: [inn({ runs: 40 })] }),
    );
    const runs = nextMilestones(matches, seasons).find((m) => m.stat === "runs")!;
    expect(runs).toMatchObject({ current: 2520, target: 3000, remaining: 480, perMatch: 40 });
    expect(runs.eta).toMatchObject({ matches: 12, seasons: 1, label: "1 season" });
    expect(runs.progress).toBeCloseTo(0.52);
  });

  it("labels short and fractional ETAs", () => {
    expect(milestoneEta(30, 40, 12)?.label).toBe("Next match");
    expect(milestoneEta(200, 40, 12)?.label).toBe("About 5 matches");
    expect(milestoneEta(720, 40, 12)?.label).toBe("1.5 seasons");
    expect(milestoneEta(700, 40, 12)?.label).toBe("About 1.5 seasons");
    expect(milestoneEta(100, 0, 12)).toBeNull();
  });

  it("omits a stat that is past the top of its ladder", () => {
    const next = nextMilestones([], [season({ season: null, games: 400 })]);
    expect(next.some((m) => m.stat === "games")).toBe(false);
  });
});
