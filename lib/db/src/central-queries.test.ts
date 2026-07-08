// @ts-nocheck — `@workspace/db` deliberately carries no vitest devDependency
// (it is a leaf lib; the workspace's test runner lives in the api-server
// package). Run this suite with the api-server's vitest install, e.g. from
// lib/db:  node ../../artifacts/api-server/node_modules/vitest/vitest.mjs run
// The central DB is fully mocked below, so no CENTRAL_DATABASE_URL is needed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every table handed to a `.from(...)` call on the mocked centralDb, in order.
 * Lets the tests count round trips per table (e.g. "the club match list is
 * fetched exactly once per centralDashboard call").
 */
const queriedTables: unknown[] = [];

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
      limit() {
        return builder;
      },
      // Thenable: awaiting any query resolves to an empty result set.
      then(onFulfilled, onRejected) {
        return Promise.resolve([]).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };
  return {
    ...schema,
    centralDb: {
      select: () => makeBuilder(),
      selectDistinct: () => makeBuilder(),
    },
  };
});

import {
  centralClubTotals,
  centralDashboard,
  clearCentralQueriesCache,
  withCentralCache,
} from "./central-queries";
import { centralMatchesTable } from "./central-schema";

const matchesQueries = () =>
  queriedTables.filter((t) => t === centralMatchesTable).length;

const savedTtl = process.env.CENTRAL_CACHE_TTL_MS;

beforeEach(() => {
  clearCentralQueriesCache();
  queriedTables.length = 0;
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
