import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every table handed to a `.from(...)` call on the mocked centralDb, in order.
 * Lets the tests count round trips per table (e.g. "the club match list is
 * fetched exactly once per centralDashboard call").
 */
const queriedTables: unknown[] = [];

/**
 * FIFO of result sets for the mocked builder queries: each awaited query shifts
 * the next entry (empty array when the queue is exhausted). Lets a test feed
 * label rows / match rows to centralClubMatches.
 */
const queuedResults: unknown[][] = [];

/** Builder paging calls (limit/offset), recorded so tests can assert the SQL level. */
const builderCalls: { method: string; args: unknown[] }[] = [];

vi.mock("./central", async () => {
  const schema = await vi.importActual("./central-schema");
  const makeBuilder = () => {
    const builder = {
      from(table: unknown) {
        queriedTables.push(table);
        return builder;
      },
      where() {
        return builder;
      },
      groupBy() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      $dynamic() {
        return builder;
      },
      limit(n: unknown) {
        builderCalls.push({ method: "limit", args: [n] });
        return builder;
      },
      offset(n: unknown) {
        builderCalls.push({ method: "offset", args: [n] });
        return builder;
      },
      // Thenable: awaiting any query resolves to the next queued result set.
      then(onFulfilled, onRejected) {
        return Promise.resolve(queuedResults.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };
  return {
    ...schema,
    centralDb: {
      select: () => makeBuilder(),
      selectDistinct: () => makeBuilder(),
      // Raw-SQL reads (the GROUP BY aggregates) resolve to an empty result set.
      execute: async () => ({ rows: [] }),
    },
  };
});

import { PgDialect } from "drizzle-orm/pg-core";
import {
  centralClubMatches,
  centralClubTotals,
  centralClubTotalsBySeason,
  centralDashboard,
  centralLadder,
  clearCentralQueriesCache,
  clubInvolvedWhere,
  inList,
  isPrivateRow,
  withCentralCache,
} from "./central-queries";
import { centralMatchesTable } from "./central-schema";

const matchesQueries = () => queriedTables.filter((t) => t === centralMatchesTable).length;

const savedTtl = process.env.CENTRAL_CACHE_TTL_MS;

beforeEach(() => {
  clearCentralQueriesCache();
  queriedTables.length = 0;
  queuedResults.length = 0;
  builderCalls.length = 0;
  delete process.env.CENTRAL_CACHE_TTL_MS;
});

afterEach(() => {
  vi.useRealTimers();
  if (savedTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
  else process.env.CENTRAL_CACHE_TTL_MS = savedTtl;
});

describe("withCentralCache", () => {
  it("serves repeat calls from cache and re-runs after clearCentralQueriesCache", async () => {
    let calls = 0;
    const fn = async () => ++calls;

    expect(await withCentralCache("k", fn)).toBe(1);
    expect(await withCentralCache("k", fn)).toBe(1); // hit — fn not re-run
    expect(calls).toBe(1);

    clearCentralQueriesCache();
    expect(await withCentralCache("k", fn)).toBe(2); // miss after clear
    expect(calls).toBe(2);
  });

  it("keys are distinct — different keys never share an entry", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    await withCentralCache("a", fn);
    await withCentralCache("b", fn);
    expect(calls).toBe(2);
  });

  it("CENTRAL_CACHE_TTL_MS=0 bypasses the cache entirely", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    let calls = 0;
    const fn = async () => ++calls;
    expect(await withCentralCache("k", fn)).toBe(1);
    expect(await withCentralCache("k", fn)).toBe(2);
    expect(await withCentralCache("k", fn)).toBe(3);
  });

  it("entries expire after the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    process.env.CENTRAL_CACHE_TTL_MS = "1000";
    let calls = 0;
    const fn = async () => ++calls;

    expect(await withCentralCache("ttl", fn)).toBe(1);
    vi.setSystemTime(900);
    expect(await withCentralCache("ttl", fn)).toBe(1); // still fresh
    vi.setSystemTime(1100);
    expect(await withCentralCache("ttl", fn)).toBe(2); // expired — re-run
  });

  it("does not cache rejections", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return calls;
    };
    await expect(withCentralCache("err", fn)).rejects.toThrow("transient");
    expect(await withCentralCache("err", fn)).toBe(2); // retried, then cached
    expect(await withCentralCache("err", fn)).toBe(2);
  });
});

describe("cached central reads (mocked centralDb)", () => {
  it("centralClubTotals: repeat call is a cache hit; distinct club ids are not", async () => {
    await centralClubTotals(7);
    expect(matchesQueries()).toBe(1);

    await centralClubTotals(7); // cached — no new round trip
    expect(matchesQueries()).toBe(1);

    await centralClubTotals(8); // different key — real read
    expect(matchesQueries()).toBe(2);

    clearCentralQueriesCache();
    await centralClubTotals(7); // cleared — real read again
    expect(matchesQueries()).toBe(3);
  });

  it("centralClubTotals skips the matches query when rows are preloaded", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0"; // count real queries only
    const totals = await centralClubTotals(9, []);
    expect(totals).toEqual({ players: 0, games: 0, runs: 0, wickets: 0, grades: 0 });
    expect(queriedTables.length).toBe(0); // no round trip at all
  });
});

describe("centralDashboard shared match rows", () => {
  it("fetches the club match list exactly once for the whole dashboard", async () => {
    // TTL=0 disables the cache so every query the dashboard issues is counted.
    // Before the shared-rows refactor this was 4 identical matches queries
    // (totals + grade summaries + player careers + the fielding step).
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    const dash = await centralDashboard(9);
    expect(matchesQueries()).toBe(1);
    expect(dash.gradeSummaries).toEqual([]);
    expect(dash.totalPlayers).toBe(0);
  });
});

describe("centralClubMatches SQL filtering + paging", () => {
  /** One distinct grade label the club played (feeds the label prequery). */
  const labelRows = [{ grade: "A Grade" }];

  it("applies limit/offset at the SQL level", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push(labelRows, []); // labels, then the (empty) match page
    const rows = await centralClubMatches(3, { limit: 5, offset: 10 });
    expect(rows).toEqual([]);
    expect(builderCalls).toEqual([
      { method: "limit", args: [5] },
      { method: "offset", args: [10] },
    ]);
  });

  it("no opts → no SQL limit/offset (all rows)", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push(labelRows, []);
    await centralClubMatches(3);
    expect(builderCalls).toEqual([]);
  });

  it("a grade with no mapped central labels short-circuits after the label query", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push(labelRows);
    const rows = await centralClubMatches(3, { grade: "Z Grade" });
    expect(rows).toEqual([]);
    expect(matchesQueries()).toBe(1); // only the selectDistinct label prequery
  });

  it("cache key distinguishes opts — same opts hit, different limit misses", async () => {
    queuedResults.push(labelRows, []);
    await centralClubMatches(3, { limit: 5 });
    expect(matchesQueries()).toBe(2); // labels + page

    await centralClubMatches(3, { limit: 5 }); // cached — no new round trips
    expect(matchesQueries()).toBe(2);

    queuedResults.push(labelRows, []);
    await centralClubMatches(3, { limit: 6 }); // different key — real read
    expect(matchesQueries()).toBe(4);
  });

  it("shapes a page row from the club's perspective", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    const match = {
      matchId: 7,
      playhqMatchId: null,
      season: "Summer 2023/24",
      grade: "A Grade",
      gradeId: null,
      compType: null,
      round: "Round 5",
      matchDate: "2023-11-04",
      venue: "Home Oval",
      venueOval: null,
      status: "Completed",
      homeClubId: 3,
      awayClubId: 4,
      homeTeam: "Us CC",
      awayTeam: "Them CC",
      homeScore: "8/150",
      awayScore: "10/120",
      tossWinnerClubId: null,
      winnerClubId: 3,
      resultText: null,
    };
    queuedResults.push(
      labelRows,
      [match],
      [], // roster counts
      [{ clubId: 4, name: "Them CC", shortName: "TCC", primaryColour: "#123456" }],
    );
    const rows = await centralClubMatches(3, { season: 2023, limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 7,
      grade: "A Grade",
      season: 2023,
      round: 5,
      result: "Won",
      opponent: "Them CC",
      clubScore: "8/150",
      opponentScore: "10/120",
      opponentClub: { id: 4, shortName: "TCC" },
    });
    expect(builderCalls).toEqual([{ method: "limit", args: [1] }]);
  });
});

describe("centralLadder (Ladder card prefill)", () => {
  it("filters to the app grade, derives points/pos, and flags the tenant club row", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push([
      // Two A-Grade rows (one is the tenant's club 5) + a B-Grade row that the
      // grade filter must drop.
      {
        grade: "A Grade",
        clubId: 6,
        club: "Them CC",
        played: 10,
        won: 5,
        lost: 5,
        tied: 0,
        noResult: 0,
      },
      {
        grade: "A Grade",
        clubId: 5,
        club: "Us CC",
        played: 10,
        won: 8,
        lost: 1,
        tied: 0,
        noResult: 1,
      },
      {
        grade: "B Grade",
        clubId: 5,
        club: "Us CC B",
        played: 10,
        won: 9,
        lost: 1,
        tied: 0,
        noResult: 0,
      },
    ]);
    const rows = await centralLadder(5, 2024, "A Grade");
    expect(rows).toHaveLength(2);
    // Us CC: 8*6 + 1*3(no result) = 51; Them CC: 5*6 = 30. Higher points first.
    expect(rows[0]).toEqual({
      pos: 1,
      team: "Us CC",
      played: 10,
      won: 8,
      lost: 1,
      points: 51,
      isClub: true,
    });
    expect(rows[1]).toMatchObject({ pos: 2, team: "Them CC", points: 30, isClub: false });
  });

  it("dedupes folded grade labels to one row per club (most-played wins)", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push([
      // "A Grade" and "A Grade: Wyllie Cup" both map to app grade "A Grade";
      // the same club must not appear twice — keep the most-played record.
      {
        grade: "A Grade",
        clubId: 5,
        club: "Us CC",
        played: 200,
        won: 120,
        lost: 60,
        tied: 0,
        noResult: 20,
      },
      {
        grade: "A Grade: Wyllie Cup",
        clubId: 5,
        club: "Us CC",
        played: 40,
        won: 25,
        lost: 15,
        tied: 0,
        noResult: 0,
      },
    ]);
    const rows = await centralLadder(5, 2024, "A Grade");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ team: "Us CC", played: 200, isClub: true });
  });

  it("empty ladder (no rows for the grade) returns [] and never throws", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push([
      {
        grade: "B Grade",
        clubId: 5,
        club: "Us CC B",
        played: 5,
        won: 3,
        lost: 2,
        tied: 0,
        noResult: 0,
      },
    ]);
    await expect(centralLadder(5, 2024, "A Grade")).resolves.toEqual([]);
  });
});

describe("centralClubTotalsBySeason (Club leaderboard card prefill)", () => {
  it("returns per-grade top scorer/taker and excludes junior/unmapped grades (R20)", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push(
      // Club match rows: one A-Grade (target season), one junior/unmapped grade
      // (appGradeFromCentral → null, so it never contributes), one wrong season.
      [
        { matchId: 1, grade: "A Grade", season: "Summer 2024/25" },
        { matchId: 2, grade: "Under 14 Blue", season: "Summer 2024/25" },
        { matchId: 3, grade: "A Grade", season: "Summer 2023/24" },
      ],
      [{ participantId: "guid-bat", value: 350 }], // A Grade batting agg
      [{ participantId: "guid-bowl", value: 18 }], // A Grade bowling agg
      [
        { participantId: "guid-bat", displayName: "J Smith", isPrivate: 0 },
        { participantId: "guid-bowl", displayName: "B Jones", isPrivate: 0 },
      ],
    );
    const out = await centralClubTotalsBySeason(5, 2024);
    expect(out).toEqual([
      {
        gradeLabel: "A Grade",
        topRunScorer: { playerName: "J Smith", value: 350 },
        topWicketTaker: { playerName: "B Jones", value: 18 },
      },
    ]);
  });

  it("excludes private players and applies no fill-in floor (passthrough of the central no-fill-in reality)", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push(
      [{ matchId: 1, grade: "B Grade", season: "Summer 2024/25" }],
      // Top batting candidate is private → skipped; the next public one is
      // picked. Both are GUIDs: there is no numeric fill-in sentinel to floor,
      // so no >= 90000 exclusion is (or can be) applied — only privacy/value.
      [
        { participantId: "priv-guid", value: 500 },
        { participantId: "pub-guid", value: 300 },
      ],
      [], // no bowling agg rows
      [
        { participantId: "priv-guid", displayName: "Private Star", isPrivate: 1 },
        { participantId: "pub-guid", displayName: "Public Player", isPrivate: 0 },
      ],
    );
    const out = await centralClubTotalsBySeason(5, 2024);
    expect(out).toEqual([
      {
        gradeLabel: "B Grade",
        topRunScorer: { playerName: "Public Player", value: 300 },
        topWicketTaker: null,
      },
    ]);
  });

  it("no matches in the season returns []", async () => {
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    queuedResults.push([{ matchId: 1, grade: "A Grade", season: "Summer 2023/24" }]);
    await expect(centralClubTotalsBySeason(5, 2024)).resolves.toEqual([]);
  });
});

describe("shared predicates (central/where.ts) and the privacy rule", () => {
  const dialect = new PgDialect();

  it("clubInvolvedWhere: home OR away club id, both bound to the same club", () => {
    const q = dialect.sqlToQuery(clubInvolvedWhere(7));
    expect(q.sql).toMatch(/"home_club_id" = \$1 or .*"away_club_id" = \$2/);
    expect(q.params).toEqual([7, 7]);
  });

  it("inList: binds the whole id list as ONE array parameter (= any($1))", () => {
    const ids = Array.from({ length: 1500 }, (_, i) => i + 1);
    const q = dialect.sqlToQuery(inList(centralMatchesTable.matchId, ids));
    expect(q.sql).toMatch(/"match_id" = any\(\$1\)$/);
    expect(q.params).toEqual([ids]); // not 1,500 separate bind parameters
  });

  it("isPrivateRow: only is_private = 1 is private; missing rows are public", () => {
    expect(isPrivateRow({ isPrivate: 1 })).toBe(true);
    expect(isPrivateRow({ isPrivate: 0 })).toBe(false);
    expect(isPrivateRow({ isPrivate: null })).toBe(false);
    expect(isPrivateRow(undefined)).toBe(false);
    expect(isPrivateRow(null)).toBe(false);
  });
});
