/**
 * GET /players/vs-club (stats analytics KTD6) — both read paths and the
 * opponent resolver, with the databases mocked so it runs without Postgres:
 *   - the route is registered before /players/:id (200, not an id error);
 *   - native: fill-ins excluded (in SQL and in the fold), the batting
 *     qualifier, ranking, and runs equal to the per-innings match rows;
 *   - central: a fixture's opponent (PlayHQ org or app register id) resolves
 *     to the central club and its figures come back end to end, with GUIDs
 *     resolved through the tenant crosswalk (none left at 0);
 *   - an unresolvable opponent answers `resolved: false`, not a silent empty.
 * The central grade/junior/privacy rules are pinned in
 * lib/db/src/central/vs-club.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type * as DbModule from "@workspace/db";

type Source =
  { kind: "native"; tenantId: number } | { kind: "central"; tenantId: number; clubId: number };

const h = vi.hoisted(() => ({
  source: { kind: "native", tenantId: 1 } as Source,
  clubRows: [] as Record<string, unknown>[],
  tenantRows: [] as Record<string, unknown>[],
  nativeLines: [] as Record<string, unknown>[],
  mapRows: [] as { participantId: string; playerId: number }[],
  centralRows: [] as Record<string, unknown>[],
  centralClubs: new Map<
    number,
    { clubId: number; name: string | null; shortName: string | null }
  >(),
  orgToCentral: new Map<string, number>(),
  centralCalls: [] as unknown[],
  lineWheres: [] as unknown[],
}));

vi.mock("../lib/tenant", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  dataSource: async () => h.source,
}));

vi.mock("../middlewares/tenant-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTenantId: () => h.source.tenantId,
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  const rowsFor = (table: unknown): unknown[] => {
    if (table === actual.clubsTable) return h.clubRows;
    if (table === actual.tenantsTable) return h.tenantRows;
    if (table === actual.matchPlayerLinesTable) return h.nativeLines;
    if (table === actual.playerIdMapTable) return h.mapRows;
    return [];
  };
  const select = () => {
    let table: unknown;
    const builder = {
      from: (t: unknown) => {
        table = t;
        return builder;
      },
      innerJoin: () => builder,
      leftJoin: () => builder,
      orderBy: () => builder,
      where: (w: unknown) => {
        if (table === actual.matchPlayerLinesTable) h.lineWheres.push(w);
        return builder;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(rowsFor(table)).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };
  return { ...actual, db: { select } };
});

vi.mock("@workspace/db/central-queries", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  centralVsClub: async (opts: unknown) => {
    h.centralCalls.push(opts);
    return h.centralRows;
  },
  centralClubById: async (id: number) => h.centralClubs.get(id) ?? null,
  centralClubIdForPlayhqOrg: async (org: string) => h.orgToCentral.get(org) ?? null,
}));

import playersRouter from "./players";

const app = express();
app.use("/api", playersRouter);

function line(playerId: number, matchId: number, over: Record<string, unknown> = {}) {
  return {
    playerId,
    givenName: `G${playerId}`,
    surname: `S${playerId}`,
    matchId,
    grade: "A Grade",
    season: 2023,
    round: 1,
    stage: null,
    matchDate: null,
    opponent: "Rivals",
    venue: null,
    result: null,
    batted: true,
    battingPos: 3,
    runs: 20,
    balls: null,
    fours: null,
    sixes: null,
    notOut: false,
    dismissal: "b Nguyen",
    bowled: false,
    overs: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    wides: null,
    noBalls: null,
    catches: null,
    stumpings: null,
    runOuts: null,
    battedFirst: true,
    opponentClubId: 7,
    ...over,
  };
}

function centralRow(participantId: string, over: Record<string, unknown> = {}) {
  return {
    participantId,
    displayName: `X ${participantId}`,
    matches: 4,
    innings: 4,
    notOuts: 1,
    outs: 3,
    runs: 150,
    highScore: 70,
    highScoreNotOut: false,
    spells: 0,
    wickets: 0,
    runsConceded: 0,
    ballsBowled: null,
    bestWickets: null,
    bestRuns: null,
    ...over,
  };
}

beforeEach(() => {
  h.source = { kind: "native", tenantId: 1 };
  h.clubRows = [];
  h.tenantRows = [];
  h.nativeLines = [];
  h.mapRows = [];
  h.centralRows = [];
  h.centralClubs = new Map();
  h.orgToCentral = new Map();
  h.centralCalls = [];
  h.lineWheres = [];
});

describe("GET /players/vs-club — routing and validation", () => {
  it("is served by the vs-club handler, not coerced as a player id", async () => {
    h.clubRows = [{ id: 7, name: "Rivals CC", playhqOrgId: null }];
    const res = await request(app).get("/api/players/vs-club?opponentClubId=7");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resolved: true,
      opponentClubId: 7,
      opponentName: "Rivals CC",
    });
  });

  it("rejects a request that names no opponent", async () => {
    const res = await request(app).get("/api/players/vs-club");
    expect(res.status).toBe(400);
  });
});

describe("GET /players/vs-club — native", () => {
  beforeEach(() => {
    h.clubRows = [{ id: 7, name: "Rivals CC", playhqOrgId: null }];
  });

  it("excludes fill-ins in SQL and in the fold", async () => {
    h.nativeLines = [
      line(5, 1),
      line(5, 2),
      line(5, 3),
      line(90001, 1, { runs: 200 }),
      line(90001, 2),
      line(90001, 3),
    ];
    const res = await request(app).get("/api/players/vs-club?opponentClubId=7");
    expect(res.body.batting.map((b: { playerId: number }) => b.playerId)).toEqual([5]);
    const { sql, params } = new PgDialect().sqlToQuery(h.lineWheres[0] as SQL);
    expect(sql).toContain('"player_id" <');
    expect(sql).toContain('"opponent_club_id" =');
    expect(params).toContain(90000);
    expect(params).toContain(7);
  });

  it("applies the batting qualifier and ranks by average, bowlers by wickets then average", async () => {
    h.nativeLines = [
      // Player 5: 3 innings, 2 outs, 90 runs → average 45.
      line(5, 1, { runs: 30 }),
      line(5, 2, { runs: 50, notOut: true }),
      line(5, 3, { runs: 10 }),
      // Player 6: 3 innings, 3 outs, 150 runs → average 50.
      line(6, 1, { runs: 60, bowled: true, overs: "8.3", runsConceded: 30, wickets: 2 }),
      line(6, 2, { runs: 60, bowled: true, overs: "10", runsConceded: 25, wickets: 4 }),
      line(6, 3, { runs: 30 }),
      // Player 8: only 2 innings → below the default qualifier of 3.
      line(8, 1, { runs: 100, bowled: true, overs: "6", runsConceded: 20, wickets: 6 }),
      line(8, 2, { runs: 100 }),
      // Player 9: bowled only, equal wickets to 6 but a worse average.
      line(9, 1, { batted: false, bowled: true, overs: "10", runsConceded: 80, wickets: 6 }),
    ];
    const res = await request(app).get("/api/players/vs-club?opponentClubId=7");
    expect(res.body.minInnings).toBe(3);
    expect(res.body.batting.map((b: { playerId: number }) => b.playerId)).toEqual([6, 5]);
    expect(res.body.batting[1]).toMatchObject({
      innings: 3,
      outs: 2,
      notOuts: 1,
      runs: 90,
      average: 45,
      highScore: 50,
      highScoreNotOut: true,
      matches: 3,
    });
    // All three took 6 wickets: the lower average ranks higher (3.33, 9.17, 13.33).
    expect(res.body.bowling.map((b: { playerId: number }) => b.playerId)).toEqual([8, 6, 9]);
    expect(res.body.bowling[1]).toMatchObject({
      wickets: 6,
      runsConceded: 55,
      balls: 51 + 60,
      average: 9.17,
      bestWickets: 4,
      bestRuns: 25,
    });

    const lowered = await request(app).get("/api/players/vs-club?opponentClubId=7&minInnings=2");
    expect(lowered.body.batting.map((b: { playerId: number }) => b.playerId)).toContain(8);
  });

  it("runs vs the club equal the sum of the player's per-innings match rows vs that club", async () => {
    h.nativeLines = [
      line(5, 1, { runs: 31 }),
      line(5, 2, { runs: 77, notOut: true }),
      line(5, 3, { batted: false, runs: null }),
      line(5, 4, { runs: 4 }),
    ];
    const [vs, matches] = await Promise.all([
      request(app).get("/api/players/vs-club?opponentClubId=7&minInnings=0"),
      request(app).get("/api/players/5/matches"),
    ]);
    const innings = (matches.body as { opponentClubId: number; innings: { runs: number }[] }[])
      .filter((m) => m.opponentClubId === 7)
      .flatMap((m) => m.innings);
    const [p5] = vs.body.batting;
    expect(p5.runs).toBe(innings.reduce((s, i) => s + (i.runs ?? 0), 0));
    expect(p5.innings).toBe(innings.length);
  });

  it("resolves a PlayHQ org id through the app clubs register", async () => {
    h.clubRows = [{ id: 7, name: "Rivals CC" }];
    const res = await request(app).get("/api/players/vs-club?opponentOrgId=org-rivals");
    expect(res.body).toMatchObject({ resolved: true, opponentClubId: 7 });
  });

  it("answers resolved:false for an unknown opponent", async () => {
    h.clubRows = [];
    h.nativeLines = [line(5, 1), line(5, 2), line(5, 3)];
    const res = await request(app).get("/api/players/vs-club?opponentClubId=404");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      resolved: false,
      opponentClubId: null,
      opponentName: null,
      minInnings: 3,
      batting: [],
      bowling: [],
    });
    expect(h.lineWheres).toHaveLength(0);
  });
});

describe("GET /players/vs-club — central", () => {
  beforeEach(() => {
    h.source = { kind: "central", tenantId: 3, clubId: 1 };
    h.mapRows = [
      { participantId: "g-a", playerId: 11 },
      { participantId: "g-b", playerId: 12 },
    ];
    h.centralClubs.set(12, { clubId: 12, name: "Rivals Cricket Club", shortName: "Rivals" });
    h.centralRows = [
      centralRow("g-a", { runs: 210, outs: 3 }),
      centralRow("g-b", {
        spells: 5,
        wickets: 9,
        runsConceded: 120,
        ballsBowled: 240,
        bestWickets: 4,
        bestRuns: 18,
      }),
      // No crosswalk row → dropped, never returned as id 0.
      centralRow("g-unmapped", { runs: 999 }),
    ];
  });

  it("resolves a fixture's PlayHQ org to the central club and returns crosswalked figures", async () => {
    h.orgToCentral.set("org-rivals", 12);
    const res = await request(app).get("/api/players/vs-club?opponentOrgId=org-rivals");
    expect(res.status).toBe(200);
    expect(h.centralCalls).toEqual([{ clubId: 1, opponentClubId: 12 }]);
    expect(res.body).toMatchObject({
      resolved: true,
      opponentClubId: 12,
      opponentName: "Rivals Cricket Club",
    });
    const ids = [...res.body.batting, ...res.body.bowling].map(
      (r: { playerId: number }) => r.playerId,
    );
    expect(ids).not.toContain(0);
    expect(res.body.batting[0]).toMatchObject({
      playerId: 11,
      runs: 210,
      average: 70,
      givenName: "X",
      surname: "g-a",
    });
    expect(res.body.bowling).toEqual([
      expect.objectContaining({
        playerId: 12,
        wickets: 9,
        balls: 240,
        average: 13.33,
        bestWickets: 4,
        bestRuns: 18,
      }),
    ]);
  });

  it("maps a fixture's app clubs register id through the tenants row", async () => {
    h.tenantRows = [{ centralClubId: 12, playhqOrgId: null }];
    const res = await request(app).get("/api/players/vs-club?opponentAppClubId=55");
    expect(res.body).toMatchObject({ resolved: true, opponentClubId: 12 });
    expect(h.centralCalls).toEqual([{ clubId: 1, opponentClubId: 12 }]);
  });

  it("maps an app register id via its PlayHQ org when the club isn't a tenant", async () => {
    h.clubRows = [{ id: 55, name: "Rivals CC", playhqOrgId: "org-rivals" }];
    h.orgToCentral.set("org-rivals", 12);
    const res = await request(app).get("/api/players/vs-club?opponentAppClubId=55");
    expect(res.body).toMatchObject({ resolved: true, opponentClubId: 12 });
  });

  it("never treats the tenant's own club as the opponent", async () => {
    h.centralClubs.set(1, { clubId: 1, name: "Home CC", shortName: null });
    const res = await request(app).get("/api/players/vs-club?opponentClubId=1");
    expect(res.body.resolved).toBe(false);
    expect(h.centralCalls).toHaveLength(0);
  });

  it("answers resolved:false when the org has no central scorecards", async () => {
    const res = await request(app).get("/api/players/vs-club?opponentOrgId=org-unknown");
    expect(res.body).toMatchObject({
      resolved: false,
      opponentClubId: null,
      batting: [],
      bowling: [],
    });
    expect(h.centralCalls).toHaveLength(0);
  });
});
