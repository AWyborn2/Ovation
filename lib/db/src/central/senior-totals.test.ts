/**
 * Senior club totals never count junior matches (juniors isolation): junior and
 * senior stats are never combined. Runs against a mocked centralDb, like
 * records-milestones.test.ts — a club whose only matches are junior has no
 * senior totals, careers, leaders or seasons at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** FIFO of builder (select) results. */
const queuedSelects: unknown[][] = [];

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
  return { ...schema, centralDb: { select: () => makeBuilder() } };
});

import { seniorMatchRows } from "./club-matches";
import { centralClubTotals, centralClubSeasons } from "./summaries";
import { centralPlayerCareers } from "./players";

const JUNIOR_ONLY = [
  { matchId: 1, grade: "Under 15 Boys", season: "2024/25" },
  { matchId: 2, grade: null, season: "2024/25" },
];

beforeEach(() => {
  queuedSelects.length = 0;
  process.env.CENTRAL_CACHE_TTL_MS = "0";
});

describe("senior-only central totals", () => {
  it("seniorMatchRows drops junior and unmapped grades, keeps senior ones", () => {
    expect(
      seniorMatchRows([...JUNIOR_ONLY, { matchId: 3, grade: "A Grade", season: "2024/25" }]),
    ).toEqual([{ matchId: 3, grade: "A Grade", season: "2024/25" }]);
  });

  it("club totals ignore junior matches", async () => {
    expect(await centralClubTotals(7, JUNIOR_ONLY)).toEqual({
      players: 0,
      games: 0,
      runs: 0,
      wickets: 0,
      grades: 0,
    });
  });

  it("player careers ignore junior matches", async () => {
    expect(await centralPlayerCareers(8, JUNIOR_ONLY)).toEqual([]);
  });

  it("the season picker never offers a junior-only season", async () => {
    queuedSelects.push(JUNIOR_ONLY);
    expect(await centralClubSeasons(9)).toEqual([]);
  });
});
