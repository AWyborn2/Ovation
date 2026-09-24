/**
 * GET /grades/:grade/distribution (stats analytics KTD4) — both read paths
 * with the databases mocked, so it runs without Postgres:
 *   - native: fill-ins excluded (in SQL and in shaping), span bound into both
 *     the season-row and line queries, career span unbounded;
 *   - central: GUIDs resolved through the tenant crosswalk (none left at 0),
 *     WA grade labels passed through, curated names applied;
 *   - shaping: the batting/bowling qualifiers, economy and strike rate from
 *     BALLS (never decimal overs), and "best" as the min for lower-is-better.
 * The central grade/junior/span rules themselves are pinned in
 * lib/db/src/central/grade-distribution.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type * as DbModule from "@workspace/db";

const h = vi.hoisted(() => ({
  source: { kind: "native", tenantId: 1 } as
    { kind: "native"; tenantId: number } | { kind: "central"; tenantId: number; clubId: number },
  seasonRows: [] as Record<string, unknown>[],
  lineRows: [] as Record<string, unknown>[],
  mapRows: [] as { participantId: string; playerId: number }[],
  curationRows: [] as Record<string, unknown>[],
  centralRows: [] as Record<string, unknown>[],
  executed: [] as unknown[],
  centralCalls: [] as unknown[][],
}));

vi.mock("../lib/tenant", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  dataSource: async () => h.source,
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  const fakeDb = {
    execute: async (q: unknown) => {
      h.executed.push(q);
      const text = new PgDialect().sqlToQuery(q as SQL).sql;
      return {
        rows: text.includes("player_grade_season_stats") ? h.seasonRows : h.lineRows,
      };
    },
    select: () => ({
      from: (table: unknown) => ({
        where: async () =>
          table === actual.playerIdMapTable
            ? h.mapRows
            : table === actual.playerCurationTable
              ? h.curationRows
              : [],
      }),
    }),
  };
  return { ...actual, db: fakeDb };
});

vi.mock("@workspace/db/central-queries", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  centralGradeDistribution: async (...args: unknown[]) => {
    h.centralCalls.push(args);
    return h.centralRows;
  },
}));

import gradesRouter from "./grades";
import { buildGradeDistribution, type DistributionRawRow } from "../lib/grade-distribution";

const app = express();
app.use("/api", gradesRouter);

const sqlText = (q: unknown) => new PgDialect().sqlToQuery(q as SQL);

function seasonRow(playerId: number, over: Record<string, unknown> = {}) {
  return {
    playerId,
    givenName: `Given${playerId}`,
    surname: `Surname${playerId}`,
    games: 12,
    innings: 12,
    notOuts: 2,
    runs: 400,
    highScore: 88,
    fifties: 3,
    hundreds: 0,
    wickets: 0,
    runsConceded: 0,
    fiveWickets: 0,
    catches: 4,
    ...over,
  };
}

function raw(playerId: number, over: Partial<DistributionRawRow> = {}): DistributionRawRow {
  return {
    playerId,
    givenName: "G",
    surname: `S${playerId}`,
    games: 10,
    innings: 12,
    notOuts: 2,
    runs: 300,
    highScore: 70,
    fifties: 2,
    hundreds: 0,
    wickets: 0,
    runsConceded: 0,
    fiveWickets: 0,
    catches: 1,
    ballsFaced: 400,
    runsOffBallsFaced: 300,
    ballsBowled: null,
    runsOffBallsBowled: null,
    maidens: null,
    ...over,
  };
}

const OPTS = { minInnings: 10, minOvers: 50 };

beforeEach(() => {
  h.source = { kind: "native", tenantId: 1 };
  h.seasonRows = [];
  h.lineRows = [];
  h.mapRows = [];
  h.curationRows = [];
  h.centralRows = [];
  h.executed = [];
  h.centralCalls = [];
});

describe("GET /grades/:grade/distribution — native", () => {
  it("excludes fill-ins in SQL and never returns one", async () => {
    h.seasonRows = [seasonRow(7), seasonRow(90001)];
    const res = await request(app).get("/api/grades/A%20Grade/distribution").expect(200);
    expect(res.body.players.map((p: { playerId: number }) => p.playerId)).toEqual([7]);
    for (const q of h.executed) {
      const { sql, params } = sqlText(q);
      expect(sql).toMatch(/player_id < \$\d+/);
      expect(params).toContain(90000);
      expect(params).toContain("A Grade");
    }
  });

  it("drops a player below 10 innings from batting but keeps them for 50+ overs", async () => {
    h.seasonRows = [seasonRow(3, { innings: 6, notOuts: 1, runs: 90, wickets: 20 })];
    h.lineRows = [
      { playerId: 3, ballsBowled: 330, runsOffBallsBowled: 250, maidens: 6, ballsFaced: 80 },
    ];
    h.seasonRows[0]!.runsConceded = 260;
    const res = await request(app).get("/api/grades/A%20Grade/distribution").expect(200);
    expect(res.body.players).toHaveLength(1);
    const [p] = res.body.players;
    expect(p.batting).toBeNull();
    expect(p.bowling).toMatchObject({
      overs: "55",
      ballsBowled: 330,
      maidens: 6,
      wickets: 20,
      runsConceded: 260,
      average: 13,
      strikeRate: 16.5,
    });
    // Economy from the scorecard spells, per six BALLS: 250 / 330 * 6.
    expect(p.bowling.economy).toBeCloseTo(4.55, 2);
  });

  it("binds the span into both queries, and leaves a career span unbounded", async () => {
    await request(app)
      .get("/api/grades/A%20Grade/distribution?fromSeason=2020&toSeason=2023")
      .expect(200);
    expect(h.executed).toHaveLength(2);
    const [seasons, lines] = h.executed.map(sqlText);
    expect(seasons!.sql).toContain("s.season is not null");
    expect(seasons!.sql).toContain("s.season >=");
    expect(seasons!.sql).toContain("s.season <=");
    expect(lines!.sql).toContain("m.season >=");
    for (const q of [seasons!, lines!]) {
      expect(q.params).toContain(2020);
      expect(q.params).toContain(2023);
    }

    h.executed = [];
    const res = await request(app).get("/api/grades/A%20Grade/distribution").expect(200);
    expect(res.body).toMatchObject({ fromSeason: null, toSeason: null, minInnings: 10 });
    for (const q of h.executed.map(sqlText)) expect(q.sql).not.toMatch(/season >=|season <=/);
  });

  it("rejects fromSeason after toSeason", async () => {
    await request(app)
      .get("/api/grades/A%20Grade/distribution?fromSeason=2024&toSeason=2020")
      .expect(400);
    expect(h.executed).toHaveLength(0);
  });

  it("honours custom qualifiers", async () => {
    h.seasonRows = [seasonRow(5, { innings: 3, notOuts: 0, runs: 60 })];
    const res = await request(app)
      .get("/api/grades/A%20Grade/distribution?minInnings=2&minOvers=0")
      .expect(200);
    expect(res.body.minInnings).toBe(2);
    expect(res.body.players[0].batting).toMatchObject({ innings: 3, runs: 60, average: 20 });
  });
});

describe("GET /grades/:grade/distribution — central", () => {
  const centralRow = (participantId: string, over: Record<string, unknown> = {}) => ({
    participantId,
    displayName: "J Smith",
    games: 11,
    innings: 11,
    notOuts: 1,
    runs: 350,
    highScore: 101,
    fifties: 1,
    hundreds: 1,
    ballsFaced: 500,
    runsOffBallsFaced: 350,
    wickets: 0,
    runsConceded: 0,
    fiveWickets: 0,
    ballsBowled: null,
    runsOffBallsBowled: null,
    maidens: 0,
    catches: 3,
    ...over,
  });

  beforeEach(() => {
    h.source = { kind: "central", tenantId: 9, clubId: 101 };
  });

  it("returns crosswalked app ids and drops GUIDs with no crosswalk row", async () => {
    h.centralRows = [centralRow("g-a"), centralRow("g-b"), centralRow("g-unmapped")];
    h.mapRows = [
      { participantId: "g-a", playerId: 41 },
      { participantId: "g-b", playerId: 42 },
    ];
    h.curationRows = [{ participantId: "g-b", overrideDisplayName: "Jo Smithers" }];
    const res = await request(app)
      .get("/api/grades/1st%20Grade/distribution?fromSeason=2021&toSeason=2025")
      .expect(200);
    const ids = res.body.players.map((p: { playerId: number }) => p.playerId).sort();
    expect(ids).toEqual([41, 42]);
    expect(ids).not.toContain(0);
    const b = res.body.players.find((p: { playerId: number }) => p.playerId === 42);
    expect(b).toMatchObject({ givenName: "Jo", surname: "Smithers" });
    // WA label and span handed to the central read for the tenant's club.
    expect(h.centralCalls).toEqual([
      ["1st Grade", { clubId: 101, fromSeason: 2021, toSeason: 2025 }],
    ]);
    // Never the native tables on a central tenant.
    expect(h.executed).toHaveLength(0);
  });

  it("derives strike rate from balls faced", async () => {
    h.centralRows = [centralRow("g-a")];
    h.mapRows = [{ participantId: "g-a", playerId: 41 }];
    const res = await request(app).get("/api/grades/1st%20Grade/distribution").expect(200);
    expect(res.body.players[0].batting).toMatchObject({ strikeRate: 70, average: 35 });
  });
});

describe("buildGradeDistribution", () => {
  it("takes the minimum bowling average, economy and strike rate among qualifiers only", () => {
    const out = buildGradeDistribution(
      "A Grade",
      [
        // Qualifies (60 overs): avg 20, econ 4, SR 30.
        raw(1, { wickets: 12, runsConceded: 240, ballsBowled: 360, runsOffBallsBowled: 240 }),
        // Qualifies (50.3 overs = 303 balls): avg 15, econ 200/303*6, SR 25.25.
        raw(2, { wickets: 12, runsConceded: 180, ballsBowled: 303, runsOffBallsBowled: 200 }),
        // Better figures but only 20 overs: excluded from bowling and from best.
        raw(3, {
          innings: 2,
          wickets: 10,
          runsConceded: 50,
          ballsBowled: 120,
          runsOffBallsBowled: 50,
        }),
      ],
      OPTS,
    );
    expect(out.players.map((p) => p.playerId)).toEqual([1, 2]);
    expect(out.best.bowlingAverage).toBe(15);
    expect(out.best.bowlingStrikeRate).toBe(25.25);
    expect(out.best.economy).toBe(3.96);
    expect(out.best.wickets).toBe(12);
    const two = out.players.find((p) => p.playerId === 2)!;
    // 303 balls is 50.3 overs in ball notation, not a decimal 50.5.
    expect(two.bowling).toMatchObject({ overs: "50.3", ballsBowled: 303, economy: 3.96 });
  });

  it("takes the maximum for batting metrics and leaves unknown rates null", () => {
    const out = buildGradeDistribution(
      "A Grade",
      [
        raw(1, { runs: 500, notOuts: 2, highScore: 120, ballsFaced: 600, runsOffBallsFaced: 450 }),
        raw(2, { runs: 300, ballsFaced: null, runsOffBallsFaced: null }),
        raw(3, { innings: 5, runs: 900 }),
      ],
      OPTS,
    );
    expect(out.best.runs).toBe(500);
    expect(out.best.battingAverage).toBe(50);
    expect(out.best.highScore).toBe(120);
    expect(out.best.battingStrikeRate).toBe(75);
    expect(out.players.find((p) => p.playerId === 2)!.batting!.strikeRate).toBeNull();
    // Nobody bowled enough: bowling bests are null, not 0.
    expect(out.best.wickets).toBeNull();
    expect(out.best.economy).toBeNull();
  });

  it("drops fill-ins and unresolved ids", () => {
    const out = buildGradeDistribution("A Grade", [raw(0), raw(90000), raw(95000), raw(8)], OPTS);
    expect(out.players.map((p) => p.playerId)).toEqual([8]);
  });

  it("treats a player with no dismissals as having no average", () => {
    const out = buildGradeDistribution("A Grade", [raw(1, { innings: 10, notOuts: 10 })], OPTS);
    expect(out.players[0]!.batting!.average).toBeNull();
    expect(out.best.battingAverage).toBeNull();
  });
});

describe("rates only count recorded balls", () => {
  it("a strike rate needs enough recorded balls, so a few ball counts can't set the club best", () => {
    const out = buildGradeDistribution(
      "A Grade",
      [
        // 450 runs, but only 20 recorded balls (the rest imported as 0 = unknown).
        raw(1, { runs: 450, ballsFaced: 20, runsOffBallsFaced: 60 }),
        raw(2, { runs: 300, ballsFaced: 400, runsOffBallsFaced: 300 }),
      ],
      OPTS,
    );
    expect(out.players.find((p) => p.playerId === 1)!.batting!.strikeRate).toBeNull();
    expect(out.best.battingStrikeRate).toBe(75);
  });

  it("bowling strike rate uses wickets from the same spells as the balls", () => {
    const out = buildGradeDistribution(
      "A Grade",
      [
        // Career 100 wickets, but the 360 recorded balls brought 12 of them.
        raw(1, {
          wickets: 100,
          runsConceded: 2000,
          ballsBowled: 360,
          runsOffBallsBowled: 240,
          wicketsOffBallsBowled: 12,
        }),
      ],
      OPTS,
    );
    expect(out.players[0].bowling!.strikeRate).toBe(30);
  });
});
