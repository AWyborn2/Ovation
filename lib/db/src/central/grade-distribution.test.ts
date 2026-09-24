/**
 * grade-distribution.test.ts — the central grade distribution read (stats
 * analytics KTD4). The pure grade/span/overs rules are tested directly; the
 * query itself runs against a mocked centralDb so the bound match ids, the
 * privacy omission and the row mapping are pinned without a database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";

/** FIFO of builder (select) results: club match rows, then fielding rows. */
const queuedSelects: unknown[][] = [];
/** Rows the raw-SQL aggregate resolves to. */
let executeRows: Record<string, unknown>[] = [];
/** Every raw SQL statement executed, for inspecting bound parameters. */
const executed: SQL[] = [];

vi.mock("../central", async () => {
  const schema = await vi.importActual("../central-schema");
  const makeBuilder = () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      groupBy: () => builder,
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(queuedSelects.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };
  return {
    ...schema,
    centralDb: {
      select: () => makeBuilder(),
      execute: async (q: SQL) => {
        executed.push(q);
        return { rows: executeRows };
      },
    },
  };
});

import { PgDialect } from "drizzle-orm/pg-core";
import { clearCentralQueriesCache } from "./cache";
import {
  centralGradeDistribution,
  decimalOversToBalls,
  gradeDistributionMatchIds,
} from "./grade-distribution";

const MATCHES = [
  { matchId: 1, grade: "1st Grade", season: "2021/22" },
  { matchId: 2, grade: "01. Men's First Grade", season: "2023/24" },
  { matchId: 3, grade: "Tony Mann Shield (Premier U15)", season: "2023/24" },
  { matchId: 4, grade: "2nd Grade", season: "2023/24" },
  { matchId: 5, grade: "1st Grade", season: "2024/25" },
  { matchId: 6, grade: "1st Grade", season: null },
];

/** Every array bound into the executed statement (the `= any($n)` lists). */
function boundArrays(q: SQL): unknown[][] {
  const { params } = new PgDialect().sqlToQuery(q);
  return params.filter((p): p is unknown[] => Array.isArray(p));
}

beforeEach(() => {
  clearCentralQueriesCache();
  queuedSelects.length = 0;
  executed.length = 0;
  executeRows = [];
});

describe("decimalOversToBalls", () => {
  it("reads the fractional digit as balls, six to the over", () => {
    expect(decimalOversToBalls(7.3)).toBe(45);
    expect(decimalOversToBalls(10)).toBe(60);
    expect(decimalOversToBalls(0.5)).toBe(5);
    // Double-precision drift (7.29999…) still rounds to the intended ball.
    expect(decimalOversToBalls(7.299999999)).toBe(45);
  });

  it("returns null for missing or invalid overs", () => {
    expect(decimalOversToBalls(null)).toBeNull();
    expect(decimalOversToBalls(undefined)).toBeNull();
    expect(decimalOversToBalls(-1)).toBeNull();
    expect(decimalOversToBalls(Number.NaN)).toBeNull();
  });
});

describe("gradeDistributionMatchIds", () => {
  it("rolls WA '1st Grade' label variants into one app grade (career span)", () => {
    expect(gradeDistributionMatchIds(MATCHES, "1st Grade", {})).toEqual([1, 2, 5, 6]);
  });

  it("never includes a junior/pathway grade, whatever the span", () => {
    for (const span of [{}, { fromSeason: 2023, toSeason: 2023 }]) {
      const ids = gradeDistributionMatchIds(MATCHES, "1st Grade", span);
      expect(ids).not.toContain(3);
    }
    // A junior label is not a senior grade, so asking for it yields nothing.
    expect(gradeDistributionMatchIds(MATCHES, "Tony Mann Shield (Premier U15)", {})).toEqual([]);
  });

  it("filters to the span and drops unparseable seasons once bounded", () => {
    expect(
      gradeDistributionMatchIds(MATCHES, "1st Grade", { fromSeason: 2022, toSeason: 2023 }),
    ).toEqual([2]);
    expect(gradeDistributionMatchIds(MATCHES, "1st Grade", { fromSeason: 2023 })).toEqual([2, 5]);
    expect(gradeDistributionMatchIds(MATCHES, "1st Grade", { toSeason: 2021 })).toEqual([1]);
  });
});

describe("centralGradeDistribution", () => {
  const row = (over: Record<string, unknown>) => ({
    participantId: "g-1",
    games: 3,
    innings: 3,
    notOuts: 1,
    runs: 120,
    highScore: 70,
    fifties: 1,
    hundreds: 0,
    ballsFaced: 150,
    runsOffBallsFaced: 120,
    wickets: 4,
    runsConceded: 80,
    fiveWickets: 0,
    ballsBowled: 90,
    runsOffBallsBowled: 80,
    maidens: 2,
    displayName: "A Batter",
    isPrivate: 0,
    ...over,
  });

  it("binds only the grade's senior match ids in the span", async () => {
    queuedSelects.push(MATCHES, []);
    await centralGradeDistribution("1st Grade", { clubId: 101, fromSeason: 2023 });
    expect(executed).toHaveLength(1);
    const lists = boundArrays(executed[0]!);
    expect(lists.length).toBeGreaterThan(0);
    for (const ids of lists) expect(ids).toEqual([2, 5]);
  });

  it("skips the query entirely when the club has no matches in the grade", async () => {
    queuedSelects.push(MATCHES);
    expect(await centralGradeDistribution("3rd Grade", { clubId: 101 })).toEqual([]);
    expect(executed).toHaveLength(0);
  });

  it("omits private participants and attaches catches by GUID", async () => {
    queuedSelects.push(MATCHES, [
      { participantId: "g-1", kind: "caught", n: 2 },
      { participantId: "g-1", kind: "run out", n: 1 },
      { participantId: "g-2", kind: "caught", n: 5 },
    ]);
    executeRows = [row({}), row({ participantId: "g-2", isPrivate: 1, displayName: "Hidden" })];
    const out = await centralGradeDistribution("1st Grade", { clubId: 101 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      participantId: "g-1",
      displayName: "A Batter",
      innings: 3,
      ballsBowled: 90,
      maidens: 2,
      catches: 2,
    });
    expect(out[0]).not.toHaveProperty("isPrivate");
  });

  it("keeps unknown ball counts as null rather than zero", async () => {
    queuedSelects.push(MATCHES, []);
    executeRows = [
      row({ ballsFaced: null, runsOffBallsFaced: null, ballsBowled: null, highScore: null }),
    ];
    const [r] = await centralGradeDistribution("1st Grade", { clubId: 101 });
    expect(r).toMatchObject({
      ballsFaced: null,
      runsOffBallsFaced: null,
      ballsBowled: null,
      highScore: null,
    });
  });
});
