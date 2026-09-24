import { describe, expect, it } from "vitest";
import type {
  Fixture,
  FixturesResultsPage,
  GradeDistributionBest,
  PlayhqFixture,
  PlayhqLadder,
} from "@workspace/api-client-react";
import { CAREER, careerRace, oppositionTable } from "@/lib/stats-analytics";
import { bowl, inn, match, season } from "@/lib/stats-analytics/test-fixtures";
import {
  applySlots,
  coverageNotes,
  effectiveOppMetric,
  helperBatters,
  helperBowlers,
  helperSlotFor,
  ladderPosition,
  lastResultVs,
  mostPlayedGrade,
  oppositionMatrix,
  ordinal,
  parseSlots,
  raceChartRows,
  radarValues,
  seasonBars,
  seasonTotals,
  swapFirstTwo,
  taleOfTheTape,
  upcomingFixtures,
  verdict,
  verdictText,
  vsClubParams,
} from "./compare-data";

describe("player slots in the URL", () => {
  it("parses a, b, c and ignores junk", () => {
    expect(parseSlots("a=12&b=x&c=0")).toEqual({ a: 12, b: null, c: null });
  });

  it("swap exchanges a and b and keeps from/to/d", () => {
    const search = "a=1&b=2&from=2022&to=2024&d=bowl";
    const qs = new URLSearchParams(applySlots(search, swapFirstTwo(parseSlots(search))));
    expect(qs.get("a")).toBe("2");
    expect(qs.get("b")).toBe("1");
    expect(qs.get("from")).toBe("2022");
    expect(qs.get("to")).toBe("2024");
    expect(qs.get("d")).toBe("bowl");
  });

  it("removing C drops the param only", () => {
    const qs = new URLSearchParams(applySlots("a=1&b=2&c=3&d=bowl", { c: null }));
    expect(qs.has("c")).toBe(false);
    expect(qs.get("d")).toBe("bowl");
  });

  it("the helper fills the empty third slot, replaces B when full, and skips a player already in", () => {
    expect(helperSlotFor({ a: 1, b: 2, c: null }, 9)).toBe("c");
    expect(helperSlotFor({ a: 1, b: 2, c: 3 }, 9)).toBe("b");
    expect(helperSlotFor({ a: 1, b: 2, c: 3 }, 3)).toBeNull();
    expect(helperSlotFor({ a: 1, b: null, c: null }, 9)).toBe("b");
  });
});

describe("season totals", () => {
  it("sums rows, parses HS / best figures, and only rates balls where balls are recorded", () => {
    const t = seasonTotals([
      season({ season: null, games: 20, innings: 20, notOuts: 0, runs: 400, highScore: "88" }),
      season({
        season: 2024,
        games: 10,
        innings: 10,
        notOuts: 2,
        runs: 300,
        highScore: "104*",
        ballsFaced: 250,
        wickets: 6,
        runsConceded: 150,
        ballsBowled: 180,
        bestBowling: "3/20",
        maidens: 4,
      }),
      season({ season: 2023, wickets: 4, runsConceded: 100, bestBowling: "3/15" }),
    ]);
    expect(t.games).toBe(30);
    expect(t.outs).toBe(28);
    expect(t.battingAverage).toBeCloseTo(700 / 28);
    expect(t.highScore).toEqual({ runs: 104, notOut: true });
    // Strike rate over the scorecard row only: 300 off 250.
    expect(t.strikeRate).toBeCloseTo(120);
    expect(t.bestBowling).toEqual({ wickets: 3, runs: 15 });
    expect(t.bowlingAverage).toBeCloseTo(25);
    // Economy over the row with balls only: 150 off 30 overs.
    expect(t.economy).toBeCloseTo(5);
    expect(t.maidens).toBe(4);
  });
});

describe("tale of the tape and verdict", () => {
  const strong = seasonTotals([
    season({ season: 2024, games: 10, innings: 10, runs: 500, wickets: 10, runsConceded: 200 }),
  ]);
  const weak = seasonTotals([
    season({ season: 2024, games: 8, innings: 8, runs: 200, wickets: 10, runsConceded: 300 }),
  ]);

  it("the lower bowling average leads and gets the longest bar", () => {
    const row = taleOfTheTape([weak, strong], "bowl").find((r) => r.key === "bowlingAverage")!;
    expect(row.lowerIsBetter).toBe(true);
    expect(row.leader).toBe(1);
    expect(row.widths[1]).toBe(1);
    expect(row.widths[0]).toBeCloseTo(20 / 30);
  });

  it("counts category wins and reports the leader", () => {
    const rows = taleOfTheTape([strong, weak], "bat");
    const v = verdict(rows, 2);
    expect(v.wins[0]).toBeGreaterThan(v.wins[1]);
    expect(verdictText(v, ["Ann Lee", "Bo Diaz"])).toMatch(/^Ann Lee leads \d+ of \d+ categories$/);
  });

  it("reports 'Level at the top' on a tie", () => {
    const v = verdict(taleOfTheTape([strong, strong], "bat"), 2);
    expect(v.leader).toBeNull();
    expect(verdictText(v, ["A", "B"])).toMatch(/^Level at the top across \d+ categories$/);
  });

  it("uses the bowling rows in bowling mode", () => {
    expect(taleOfTheTape([strong], "bowl").map((r) => r.label)).toEqual([
      "Matches",
      "Wickets",
      "Bowling avg",
      "Economy",
      "Strike rate",
      "Best figures",
      "5-wkt hauls",
      "Maidens",
      "Catches",
    ]);
  });
});

describe("radar", () => {
  const best: GradeDistributionBest = {
    games: 100,
    catches: 40,
    runs: 1000,
    battingAverage: 50,
    highScore: 150,
    fifties: 10,
    hundreds: 0,
    battingStrikeRate: 100,
    wickets: 50,
    maidens: 20,
    fiveWickets: 4,
    bowlingAverage: 15,
    economy: 3,
    bowlingStrikeRate: 30,
  };

  it("scales to the club best and inverts lower-is-better", () => {
    const t = seasonTotals([
      season({ season: 2024, runs: 500, innings: 10, wickets: 10, runsConceded: 300 }),
    ]);
    const v = radarValues(t, best, ["runs", "bowlingAverage", "hundreds"]);
    expect(v.runs).toBe(50);
    expect(v.bowlingAverage).toBe(50); // best 15 ÷ own 30
    expect(v.hundreds).toBeNull(); // a club best of 0 gives no scale
  });

  it("picks the compared players' most-played grade in range", () => {
    const a = [
      season({ season: 2024, grade: "B Grade", games: 12 }),
      season({ season: 2020, grade: "A Grade", games: 30 }),
    ];
    const b = [season({ season: 2024, grade: "A Grade", games: 5 })];
    expect(mostPlayedGrade([a, b], CAREER)).toBe("A Grade");
    expect(mostPlayedGrade([a, b], { from: 2023, to: 2024 })).toBe("B Grade");
  });
});

describe("opposition matrix", () => {
  const p1 = [
    match({ opponentClubId: 7, opponent: "Rovers", innings: [inn({ runs: 10 })] }),
    match({ opponentClubId: 7, opponent: "Rovers", innings: [inn({ runs: 30 })] }),
    match({ opponentClubId: 8, opponent: "Ports", innings: [inn({ runs: 50 })] }),
  ];
  const p2 = [
    match({ opponentClubId: 7, opponent: "Rovers", innings: [inn({ runs: 80, notOut: true })] }),
    match({ opponentClubId: 8, opponent: "Ports", innings: [inn({ runs: 5 })], ...bowl(3, 20) }),
  ];

  it("rows sum back to each player's per-match totals", () => {
    const tables = [oppositionTable(p1), oppositionTable(p2)];
    const rows = oppositionMatrix(tables, ["One", "Two"], "runs");
    const sum = (col: number) => rows.reduce((s, r) => s + (r.cells[col].value ?? 0), 0);
    expect(sum(0)).toBe(90);
    expect(sum(1)).toBe(85);
    expect(rows[0].opponent).toBe("Rovers");
  });

  it("times dismissed shades, per player, the club that dismissed them most", () => {
    const rows = oppositionMatrix(
      [oppositionTable(p1), oppositionTable(p2)],
      ["One", "Two"],
      "outs",
    );
    const rovers = rows.find((r) => r.opponent === "Rovers")!;
    expect(rovers.cells[0].display).toBe("2");
    expect(rovers.cells[0].sub).toBe("in 2");
    expect(rovers.cells[0].shaded).toBe(true);
    expect(rovers.cells[0].tip).toBe("One v Rovers: out 2 times in 2 innings · 40 runs at 20.0");
    const ports = rows.find((r) => r.opponent === "Ports")!;
    expect(ports.cells[1].shaded).toBe(true); // Two was only ever out to Ports
  });

  it("the opposition metric resets when the discipline flips", () => {
    expect(effectiveOppMetric({ d: "bowl", metric: "econ" }, "bat")).toBe("outs");
    expect(effectiveOppMetric({ d: "bowl", metric: "econ" }, "bowl")).toBe("econ");
    expect(effectiveOppMetric({ d: "bat", metric: "runs" }, "bowl")).toBe("wk");
    expect(effectiveOppMetric(null, "bowl")).toBe("wk");
  });
});

describe("race and season bars", () => {
  it("race rows are keyed by games played and end at the final totals", () => {
    const race = careerRace(
      [
        {
          key: "a",
          matches: [
            match({ innings: [inn({ runs: 10 })] }),
            match({ innings: [inn({ runs: 20 })] }),
          ],
          seasons: [],
        },
        { key: "b", matches: [match({ innings: [inn({ runs: 5 })] })], seasons: [] },
      ],
      "bat",
      CAREER,
    );
    expect(race.ok).toBe(true);
    if (!race.ok) return;
    const rows = raceChartRows(race.data);
    expect(rows.map((r) => r.games)).toEqual([0, 1, 2]);
    expect(rows[2].p0).toBe(30);
    expect(rows[2].p1).toBeNull();
    expect(rows[1].p1).toBe(5);
  });

  it("season bars cover the latest six seasons in range, null where a player didn't play", () => {
    const a = [2018, 2019, 2020, 2021, 2022, 2023, 2024].map((y) =>
      season({ season: y, runs: y - 2000 }),
    );
    const b = [
      season({ season: 2024, runs: 99 }),
      season({ season: 2024, grade: "B Grade", runs: 1 }),
    ];
    const rows = seasonBars([a, b], "bat", CAREER);
    expect(rows.map((r) => r.year)).toEqual([2019, 2020, 2021, 2022, 2023, 2024]);
    expect(rows[0].p1).toBeNull();
    expect(rows[5].p1).toBe(100);
    expect(rows[5].season).toBe("2024/25");
  });

  it("notes pre-scorecard careers", () => {
    const note = coverageNotes(
      ["Ann Lee", "Bo Diaz"],
      [
        [season({ season: null, games: 40 }), season({ season: 2022, games: 5 })],
        [season({ season: 2022 })],
      ],
      [[match({ season: 2022 })], [match({ season: 2022 })]],
    );
    expect(note).toBe("Scorecard era · Ann Lee: scorecards from 2022/23");
  });
});

describe("selection helper", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const phq = (p: Partial<PlayhqFixture>): PlayhqFixture => ({
    playhqMatchId: "m1",
    gradeId: "g1",
    grade: "A Grade",
    gradeName: "A Grade",
    status: "UPCOMING",
    isHome: true,
    startAt: "2026-10-10T03:00:00Z",
    opponent: { orgId: "org-rov", name: "Rovers Cricket Club" },
    ...p,
  });
  const fixture = (p: Partial<Fixture>): Fixture => ({
    id: 1,
    grade: "A Grade",
    opponentName: "Rovers",
    startAt: "2026-10-10T03:00:00Z",
    isHome: true,
    source: "manual",
    createdAt: "2026-01-01T00:00:00Z",
    ...p,
  });

  it("takes the next three fixtures, joining PlayHQ by match id and topping up from PlayHQ", () => {
    const page: FixturesResultsPage = {
      linked: true,
      seasons: [],
      latestSeason: null,
      grades: [],
      matches: [
        phq({ playhqMatchId: "m1" }),
        phq({
          playhqMatchId: "m2",
          startAt: "2026-10-17T03:00:00Z",
          opponent: { orgId: "org-p", name: "Ports" },
        }),
        phq({
          playhqMatchId: "done",
          status: "COMPLETED",
          outcome: "won",
          startAt: "2026-09-01T03:00:00Z",
        }),
      ],
    };
    const list = upcomingFixtures(
      [
        fixture({ id: 1, playhqMatchId: "m1", opponentClubId: 44 }),
        fixture({ id: 2, startAt: "2026-10-24T03:00:00Z", opponentName: "Bays" }),
        fixture({ id: 3, startAt: "2026-10-31T03:00:00Z", opponentName: "Later" }),
      ],
      page,
      now,
    );
    expect(list.map((f) => f.opponentName)).toEqual(["Rovers", "Ports", "Bays"]);
    expect(list[0].opponentOrgId).toBe("org-rov");
    expect(list[0].gradeId).toBe("g1");
    expect(vsClubParams(list[0])).toEqual({ opponentAppClubId: 44, minInnings: 3 });
    expect(vsClubParams(list[1])).toEqual({ opponentOrgId: "org-p", minInnings: 3 });
    expect(vsClubParams(list[2])).toBeNull();
  });

  it("finds the opponent's ladder position and the last meeting", () => {
    const f = upcomingFixtures(
      [],
      {
        linked: true,
        seasons: [],
        latestSeason: null,
        grades: [],
        matches: [phq({})],
      },
      now,
    )[0];
    const ladder: PlayhqLadder = {
      gradeId: "g1",
      gradeName: "A Grade",
      season: null,
      ladders: [
        {
          name: "Ladder",
          teams: [
            { teamId: "t1", teamName: "Us", isClub: true, rank: 1 },
            { teamId: "t2", teamName: "Rovers", orgId: "org-rov", isClub: false, rank: 3 },
          ],
        },
      ],
    };
    expect(ladderPosition(ladder, f)).toEqual({ rank: 3, of: 2 });
    const page: FixturesResultsPage = {
      linked: true,
      seasons: [],
      latestSeason: null,
      grades: [],
      matches: [
        phq({
          playhqMatchId: "x1",
          status: "COMPLETED",
          outcome: "lost",
          startAt: "2025-11-01T00:00:00Z",
        }),
        phq({
          playhqMatchId: "x2",
          status: "COMPLETED",
          outcome: "won",
          startAt: "2026-01-01T00:00:00Z",
        }),
      ],
    };
    expect(lastResultVs(page, f)?.playhqMatchId).toBe("x2");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(22)).toBe("22nd");
  });

  it("ranks batters by average and bowlers by wickets then average", () => {
    const data = {
      resolved: true,
      opponentClubId: 7,
      opponentName: "Rovers",
      minInnings: 3,
      batting: [
        {
          playerId: 1,
          givenName: "A",
          surname: "One",
          matches: 4,
          innings: 4,
          notOuts: 0,
          outs: 4,
          runs: 100,
          average: 25,
          highScore: 50,
          highScoreNotOut: false,
        },
        {
          playerId: 2,
          givenName: "B",
          surname: "Two",
          matches: 4,
          innings: 4,
          notOuts: 4,
          outs: 0,
          runs: 90,
          average: null,
          highScore: 40,
          highScoreNotOut: true,
        },
        {
          playerId: 3,
          givenName: "C",
          surname: "Three",
          matches: 4,
          innings: 4,
          notOuts: 0,
          outs: 2,
          runs: 100,
          average: 50,
          highScore: 60,
          highScoreNotOut: false,
        },
      ],
      bowling: [
        {
          playerId: 1,
          givenName: "A",
          surname: "One",
          matches: 3,
          wickets: 6,
          runsConceded: 120,
          balls: 180,
          average: 20,
          bestWickets: 3,
          bestRuns: 20,
        },
        {
          playerId: 3,
          givenName: "C",
          surname: "Three",
          matches: 3,
          wickets: 6,
          runsConceded: 90,
          balls: 180,
          average: 15,
          bestWickets: 4,
          bestRuns: 10,
        },
        {
          playerId: 4,
          givenName: "D",
          surname: "Four",
          matches: 3,
          wickets: 0,
          runsConceded: 40,
          balls: 60,
          average: null,
          bestWickets: 0,
          bestRuns: 40,
        },
      ],
    };
    expect(helperBatters(data).map((b) => b.playerId)).toEqual([3, 1, 2]);
    expect(helperBowlers(data).map((b) => b.playerId)).toEqual([3, 1]);
  });
});
