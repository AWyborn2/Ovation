import { describe, it, expect } from "vitest";
import type { Stat } from "@workspace/api-zod";
import {
  BOARDS,
  DEFAULT_BOARDS,
  DEFAULT_MILESTONE_THRESHOLDS,
  HONOUR_TIER_CONFIG,
  MILESTONE_BOARDS,
  aggregateCareer,
  buildTiers,
  computeBoard,
  getApproachingMilestones,
  getAvailableSeasons,
  getMilestoneStatus,
  getPlayerSeasonCrossings,
  getRecentPromotions,
  getSeasonCrossings,
  getSeasonPromotions,
  mergeBoardsMeta,
  statToAggregated,
  type AggregatedPlayer,
} from "./honour-boards";

let nextId = 1;
const mkStat = (over: Partial<Stat> & { playerId: number }): Stat => ({
  id: nextId++,
  surname: `P${over.playerId}`,
  givenName: "Test",
  grade: "A Grade",
  ...over,
});

const mkPlayer = (over: Partial<AggregatedPlayer> & { playerId: number }): AggregatedPlayer => ({
  surname: `P${over.playerId}`,
  givenName: "Test",
  grades: new Set(["A Grade"]),
  games: 0,
  innings: 0,
  notOuts: 0,
  runs: 0,
  highScore: 0,
  highScoreDisplay: "-",
  hundreds: 0,
  fifties: 0,
  wickets: 0,
  runsConceded: 0,
  bestBowlingWkts: 0,
  bestBowlingRuns: 0,
  bestBowling: "-",
  fiveWickets: 0,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  ...over,
});

// ---------------------------------------------------------------------------
// Board metadata — the web copy is canonical
// ---------------------------------------------------------------------------

describe("DEFAULT_BOARDS", () => {
  it("lists the eight boards in display order and BOARDS aliases it", () => {
    expect(DEFAULT_BOARDS.map((b) => b.key)).toEqual([
      "games",
      "runs",
      "wickets",
      "dismissals",
      "highscores",
      "bestbowling",
      "centurions",
      "fivefers",
    ]);
    expect(BOARDS).toBe(DEFAULT_BOARDS);
  });

  it("keeps the web wording where the mobile fork had drifted", () => {
    const byKey = new Map(DEFAULT_BOARDS.map((b) => [b.key, b]));
    expect(byKey.get("dismissals")).toMatchObject({
      headlineLabel: "Dismissals",
      subtitle: "Catches, stumpings and run outs combined",
    });
    expect(byKey.get("highscores")?.subtitle).toBe("Best single-innings batting performances");
    expect(byKey.get("bestbowling")?.supportingLabel).toBe("Wickets");
  });
});

describe("mergeBoardsMeta", () => {
  it("returns the defaults themselves when there is nothing to merge", () => {
    expect(mergeBoardsMeta(undefined)).toBe(DEFAULT_BOARDS);
    expect(mergeBoardsMeta([])).toBe(DEFAULT_BOARDS);
  });

  it("overlays non-null fields per key and ignores unknown keys", () => {
    const merged = mergeBoardsMeta([
      { key: "runs", label: "Run Machines", subtitle: null },
      { key: "not-a-board", label: "???" },
    ]);
    expect(merged).toHaveLength(DEFAULT_BOARDS.length);
    expect(merged[1]).toEqual({ ...DEFAULT_BOARDS[1], label: "Run Machines" });
    expect(merged[0]).toBe(DEFAULT_BOARDS[0]);
  });
});

// ---------------------------------------------------------------------------
// Tier policy
// ---------------------------------------------------------------------------

describe("HONOUR_TIER_CONFIG / buildTiers", () => {
  it("has a policy entry for every board", () => {
    expect(Object.keys(HONOUR_TIER_CONFIG).sort()).toEqual(DEFAULT_BOARDS.map((b) => b.key).sort());
    expect(HONOUR_TIER_CONFIG.games).toMatchObject({
      kind: "extendable",
      step: 50,
      anchorMin: 350,
    });
    expect(HONOUR_TIER_CONFIG.runs).toMatchObject({
      kind: "extendable",
      step: 500,
      anchorMin: 10000,
    });
    expect(HONOUR_TIER_CONFIG.wickets).toMatchObject({
      kind: "extendable",
      step: 50,
      anchorMin: 500,
    });
    expect(HONOUR_TIER_CONFIG.dismissals).toMatchObject({
      kind: "extendable",
      step: 25,
      anchorMin: 100,
    });
  });

  it("returns static tiers verbatim", () => {
    const tiers = buildTiers("highscores", []);
    expect(tiers.map((t) => t.label)).toEqual([
      "Double Century Club (200+)",
      "150 Run Club",
      "Century Club (100+)",
      "75 Run Club",
      "Half Century Club (50+)",
    ]);
    expect(tiers[0].max).toBeUndefined();
    expect(buildTiers("bestbowling", [])).toHaveLength(4);
    expect(buildTiers("centurions", [])).toEqual([{ label: "Century Club", min: 100 }]);
    expect(buildTiers("fivefers", [])).toEqual([{ label: "Five-Wicket Haul Club", min: 1 }]);
  });

  it("extendable boards use the anchor as an open top band until someone passes anchor + step", () => {
    const tiers = buildTiers("games", [mkPlayer({ playerId: 1, games: 120 })]);
    expect(tiers.map((t) => t.min)).toEqual([350, 300, 250, 200, 150, 100, 50]);
    expect(tiers[0]).toEqual({ label: "350 Games Club", min: 350 });
    expect(tiers[1]).toEqual({ label: "300 Games Club", min: 300, max: 349 });
    // Exactly anchor + step grows one band.
    expect(buildTiers("games", [mkPlayer({ playerId: 1, games: 400 })]).map((t) => t.min)).toEqual([
      400, 350, 300, 250, 200, 150, 100, 50,
    ]);
  });

  it("extendable boards grow to cover the record holder in whole steps", () => {
    const tiers = buildTiers("games", [
      mkPlayer({ playerId: 1, games: 460 }),
      mkPlayer({ playerId: 2, games: 10 }),
    ]);
    expect(tiers.slice(0, 3)).toEqual([
      { label: "450 Games Club", min: 450 },
      { label: "400 Games Club", min: 400, max: 449 },
      { label: "350 Games Club", min: 350, max: 399 },
    ]);
    expect(tiers).toHaveLength(9);
  });
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

describe("aggregateCareer", () => {
  it("sums a player's rows across grades and tracks best high score / bowling", () => {
    const [p] = aggregateCareer([
      mkStat({
        playerId: 7,
        grade: "A Grade",
        games: 10,
        innings: 9,
        notOuts: 1,
        runs: 300,
        highScore: "45*",
        bestBowling: "3/20",
        catches: 2,
      }),
      mkStat({
        playerId: 7,
        grade: "B Grade",
        games: 5,
        innings: 5,
        runs: 200,
        highScore: "112",
        bestBowling: "5/60",
        hundreds: 1,
        stumpings: 1,
        runOuts: 1,
      }),
      mkStat({
        playerId: 7,
        grade: "C Grade",
        games: 1,
        bestBowling: "5/30",
        wickets: 5,
        runsConceded: 30,
      }),
    ]);
    expect(p.games).toBe(16);
    expect(p.innings).toBe(14);
    expect(p.notOuts).toBe(1);
    expect(p.runs).toBe(500);
    expect(p.hundreds).toBe(1);
    expect(p.highScore).toBe(112);
    expect(p.highScoreDisplay).toBe("112");
    // 5/30 beats 5/60 (fewer runs) which beats 3/20 (more wickets).
    expect(p.bestBowling).toBe("5/30");
    expect(p.bestBowlingWkts).toBe(5);
    expect(p.bestBowlingRuns).toBe(30);
    expect(p.catches + p.stumpings + p.runOuts).toBe(4);
    expect([...p.grades].sort()).toEqual(["A Grade", "B Grade", "C Grade"]);
  });

  it("keeps players separate and treats missing numbers as zero", () => {
    const out = aggregateCareer([mkStat({ playerId: 1, games: 3 }), mkStat({ playerId: 2 })]);
    expect(out.map((p) => [p.playerId, p.games, p.highScoreDisplay, p.bestBowling])).toEqual([
      [1, 3, "-", "-"],
      [2, 0, "-", "-"],
    ]);
  });

  it("statToAggregated mirrors a single row", () => {
    const p = statToAggregated(
      mkStat({ playerId: 3, grade: "B Grade", runs: 50, highScore: "50*", bestBowling: "2/9" }),
    );
    expect(p).toMatchObject({
      playerId: 3,
      runs: 50,
      highScore: 50,
      highScoreDisplay: "50*",
      bestBowlingWkts: 2,
      bestBowlingRuns: 9,
    });
    expect([...p.grades]).toEqual(["B Grade"]);
  });
});

describe("getAvailableSeasons", () => {
  it("dedupes, drops nulls and sorts newest first", () => {
    const stats = [
      mkStat({ playerId: 1, season: 2022 }),
      mkStat({ playerId: 1, season: 2024 }),
      mkStat({ playerId: 2, season: 2022 }),
      mkStat({ playerId: 2, season: null }),
    ];
    expect(getAvailableSeasons(stats)).toEqual([2024, 2022]);
  });
});

// ---------------------------------------------------------------------------
// Board membership
// ---------------------------------------------------------------------------

describe("computeBoard", () => {
  it("places players in bands, ranks across bands and re-indexes populated tiers", () => {
    const players = [
      mkPlayer({
        playerId: 1,
        surname: "Zed",
        games: 120,
        runs: 900,
        grades: new Set(["A Grade", "CLUB TOTAL"]),
      }),
      mkPlayer({ playerId: 2, surname: "Bee", games: 55 }),
      mkPlayer({ playerId: 3, surname: "Ay", games: 130 }),
      mkPlayer({ playerId: 4, surname: "None", games: 0 }),
    ];
    const board = computeBoard(players, "games");
    expect(
      board.map((t) => [t.label, t.startRank, t.tierIndex, t.rows.map((r) => r.playerId)]),
    ).toEqual([
      ["100 Games Club", 1, 0, [3, 1]],
      ["50 Games Club", 3, 1, [2]],
    ]);
    const zed = board[0].rows[1];
    expect(zed).toMatchObject({
      headline: "120",
      supporting: "900",
      sortValue: 120,
      gradesPlayed: ["A Grade"],
    });
  });

  it("ties on value fall back to surname order", () => {
    const board = computeBoard(
      [
        mkPlayer({ playerId: 1, surname: "Smith", games: 100 }),
        mkPlayer({ playerId: 2, surname: "Jones", games: 100 }),
      ],
      "games",
    );
    expect(board[0].rows.map((r) => r.surname)).toEqual(["Jones", "Smith"]);
  });

  it("best bowling sorts by wickets then fewest runs", () => {
    const players = [
      mkPlayer({
        playerId: 1,
        surname: "A",
        bestBowlingWkts: 5,
        bestBowlingRuns: 30,
        bestBowling: "5/30",
      }),
      mkPlayer({
        playerId: 2,
        surname: "B",
        bestBowlingWkts: 5,
        bestBowlingRuns: 20,
        bestBowling: "5/20",
      }),
      mkPlayer({
        playerId: 3,
        surname: "C",
        bestBowlingWkts: 7,
        bestBowlingRuns: 45,
        bestBowling: "7/45",
      }),
      mkPlayer({
        playerId: 4,
        surname: "D",
        bestBowlingWkts: 4,
        bestBowlingRuns: 10,
        bestBowling: "4/10",
      }),
    ];
    const board = computeBoard(players, "bestbowling");
    expect(board.map((t) => [t.label, t.rows.map((r) => r.headline)])).toEqual([
      ["7 Wicket Haul Club", ["7/45"]],
      ["5 Wicket Haul Club", ["5/20", "5/30"]],
    ]);
    expect(board[1].rows[0].supporting).toBe("5 wkts");
  });

  it("runs / wickets boards carry averages as supporting text", () => {
    const players = [
      mkPlayer({ playerId: 1, runs: 600, innings: 12, notOuts: 2, wickets: 30, runsConceded: 600 }),
    ];
    expect(computeBoard(players, "runs")[0].rows[0].supporting).toBe("60.00");
    expect(computeBoard(players, "wickets")[0].rows[0].supporting).toBe("20.00");
    expect(computeBoard([mkPlayer({ playerId: 2, runs: 600 })], "runs")[0].rows[0].supporting).toBe(
      "-",
    );
  });
});

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

describe("getMilestoneStatus", () => {
  it("reports the current band and the next one up", () => {
    const s = getMilestoneStatus(mkPlayer({ playerId: 1, games: 120 }), "games");
    expect(s).toMatchObject({
      boardLabel: "Games",
      currentValue: 120,
      currentTierLabel: "100 Games Club",
      nextTierLabel: "150 Games Club",
      nextTierThreshold: 150,
      gap: 30,
    });
  });

  it("synthesises the next band above the open top of an extendable board", () => {
    const s = getMilestoneStatus(mkPlayer({ playerId: 1, games: 360 }), "games");
    expect(s.currentTierLabel).toBe("350 Games Club");
    expect(s.nextTierLabel).toBe("400 Games Club");
    expect(s.gap).toBe(40);
  });

  it("points a player below every band at the lowest one", () => {
    const s = getMilestoneStatus(mkPlayer({ playerId: 1, games: 20 }), "games");
    expect(s.currentTierIndex).toBeNull();
    expect(s.currentTierLabel).toBeNull();
    expect(s.nextTierLabel).toBe("50 Games Club");
    expect(s.gap).toBe(30);
  });

  it("has nothing further to chase at the top of a static board", () => {
    const s = getMilestoneStatus(mkPlayer({ playerId: 1, catches: 120 }), "dismissals");
    expect(s.currentTierLabel).toBe("100 Dismissals Club");
    expect(s.nextTierLabel).toBe("125 Dismissals Club");
    const hs = getMilestoneStatus(mkPlayer({ playerId: 1, highScore: 250 }), "highscores");
    expect(hs.currentValue).toBe(0); // highscores is not a milestone board
  });
});

describe("getSeasonCrossings", () => {
  it("only reports bands at or above the configured significance threshold", () => {
    const before = mkPlayer({ playerId: 1, games: 95, wickets: 45 });
    const after = mkPlayer({ playerId: 1, games: 105, wickets: 55 });
    const out = getSeasonCrossings(before, after);
    expect(out.map((c) => [c.key, c.tierLabel, c.threshold, c.beforeValue, c.afterValue])).toEqual([
      ["games", "100 Games Club", 100, 95, 105],
    ]);
    const relaxed = getSeasonCrossings(before, after, {
      ...DEFAULT_MILESTONE_THRESHOLDS,
      wickets: 50,
    });
    expect(relaxed.map((c) => c.tierLabel)).toEqual(["100 Games Club", "50 Wickets Club"]);
  });

  it("ignores dismissals (no significance threshold) and sorts by threshold descending", () => {
    const before = mkPlayer({ playerId: 1, games: 95, runs: 990, catches: 9 });
    const after = mkPlayer({ playerId: 1, games: 150, runs: 1010, catches: 12 });
    const out = getSeasonCrossings(before, after);
    expect(out.map((c) => c.threshold)).toEqual([1000, 150, 100]);
    expect(MILESTONE_BOARDS).toContain("dismissals");
  });
});

describe("getSeasonPromotions / getPlayerSeasonCrossings", () => {
  const stats = [
    mkStat({ playerId: 1, surname: "Old", season: 2023, games: 95 }),
    mkStat({ playerId: 1, surname: "Old", season: 2024, games: 10 }),
    mkStat({ playerId: 2, surname: "New", season: 2024, games: 100 }),
    mkStat({ playerId: 3, surname: "Nope", season: 2024, games: 40 }),
  ];

  it("ranks the season's crossings by how narrowly they were reached", () => {
    const out = getSeasonPromotions(stats, 2024);
    expect(
      out.map((e) => [e.surname, e.tierLabel, e.currentValue, e.excess, e.recencyScore]),
    ).toEqual([
      ["New", "100 Games Club", 100, 0, 0],
      ["Old", "100 Games Club", 105, 5, 0.05],
    ]);
    expect(getSeasonPromotions(stats, 2024, 1)).toHaveLength(1);
    expect(getSeasonPromotions(stats, 2023)).toEqual([]);
  });

  it("getPlayerSeasonCrossings works from a single player's rows", () => {
    const mine = stats.filter((s) => s.playerId === 1);
    expect(getPlayerSeasonCrossings(mine, 2024).map((c) => c.tierLabel)).toEqual([
      "100 Games Club",
    ]);
    expect(getPlayerSeasonCrossings(mine, 2023)).toEqual([]);
    expect(getPlayerSeasonCrossings([], 2024)).toEqual([]);
  });
});

describe("getRecentPromotions", () => {
  it("lists players just over a significant band, smallest overshoot first", () => {
    const players = [
      mkPlayer({ playerId: 1, surname: "Far", games: 160 }),
      mkPlayer({ playerId: 2, surname: "Near", games: 102 }),
      mkPlayer({ playerId: 3, surname: "Minor", games: 60 }),
    ];
    const out = getRecentPromotions(players);
    expect(out.map((e) => [e.surname, e.tierLabel, e.excess])).toEqual([
      ["Near", "100 Games Club", 2],
      ["Far", "150 Games Club", 10],
    ]);
    expect(getRecentPromotions(players, 1)).toHaveLength(1);
  });
});

describe("getApproachingMilestones", () => {
  it("finds the nearest significant band each player has not reached, smallest gap first", () => {
    const players = [
      mkPlayer({ playerId: 1, surname: "A", games: 95 }),
      mkPlayer({ playerId: 2, surname: "B", games: 140 }),
      mkPlayer({ playerId: 3, surname: "C", games: 20 }),
      mkPlayer({ playerId: 4, surname: "D", games: 0 }),
    ];
    const out = getApproachingMilestones(players);
    expect(out.map((e) => [e.surname, e.tierLabel, e.currentValue, e.threshold, e.gap])).toEqual([
      ["A", "100 Games Club", 95, 100, 5],
      ["B", "150 Games Club", 140, 150, 10],
      ["C", "100 Games Club", 20, 100, 80],
    ]);
  });

  it("has nothing for a player already in the open top band", () => {
    expect(getApproachingMilestones([mkPlayer({ playerId: 1, games: 360 })])).toEqual([]);
  });

  it("respects custom thresholds and the limit", () => {
    const players = [mkPlayer({ playerId: 1, games: 45 }), mkPlayer({ playerId: 2, games: 48 })];
    const out = getApproachingMilestones(players, 1, { games: 50, runs: 1000, wickets: 100 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ playerId: 2, tierLabel: "50 Games Club", gap: 2 });
  });
});
