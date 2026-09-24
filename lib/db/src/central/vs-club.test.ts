/**
 * vs-club.test.ts — the central squad-vs-club read (stats analytics KTD6). The
 * pure match filter and line fold are tested directly (junior grades, "did not
 * bat", high score, best figures, and runs equal to the per-innings match-log
 * rows); the query runs against a mocked centralDb so the GUID grouping, the
 * privacy omission and the org → club lookup are pinned without a database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** FIFO of builder (select) results, in the order the read issues them. */
const queuedSelects: unknown[][] = [];

vi.mock("../central", async () => {
  const schema = await vi.importActual("../central-schema");
  const playhq = await vi.importActual("../playhq-schema");
  const makeBuilder = () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      innerJoin: () => builder,
      groupBy: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(queuedSelects.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };
  return {
    ...schema,
    ...playhq,
    centralDb: { select: () => makeBuilder() },
  };
});

import { clearCentralQueriesCache } from "./cache";
import { buildInningsLines } from "./match-innings";
import {
  aggregateVsClubLines,
  centralClubIdForPlayhqOrg,
  centralVsClub,
  vsClubSeniorMatchIds,
  type VsClubBatLine,
} from "./vs-club";

beforeEach(() => {
  clearCentralQueriesCache();
  queuedSelects.length = 0;
});

const bat = (
  matchId: number,
  participantId: string,
  runs: number | null,
  dismissalType: string | null,
  dismissal: string | null = dismissalType,
): VsClubBatLine => ({ matchId, participantId, runs, dismissal, dismissalType });

describe("vsClubSeniorMatchIds", () => {
  it("drops junior / pathway grades and unparseable seasons (match-log rule)", () => {
    expect(
      vsClubSeniorMatchIds([
        { matchId: 1, grade: "1st Grade", season: "2021/22" },
        { matchId: 2, grade: "Tony Mann Shield (Premier U15)", season: "2023/24" },
        { matchId: 3, grade: "2nd Grade", season: "2023/24" },
        { matchId: 4, grade: "1st Grade", season: null },
        { matchId: 5, grade: null, season: "2023/24" },
      ]),
    ).toEqual([1, 3]);
  });
});

describe("aggregateVsClubLines", () => {
  it("counts innings, outs, not-outs and the high score by GUID", () => {
    const [row] = aggregateVsClubLines({
      matchIds: [1, 2, 3],
      batting: [
        bat(1, "g1", 40, "caught"),
        bat(2, "g1", 62, "not out"),
        bat(2, "g1", 62, "bowled"),
        bat(3, "g1", 0, "other", "did not bat"),
      ],
      bowling: [],
      appearances: [],
    });
    expect(row).toMatchObject({
      participantId: "g1",
      matches: 3,
      innings: 3,
      notOuts: 1,
      outs: 2,
      runs: 164,
      highScore: 62,
      // A tie at the top goes to the not-out innings.
      highScoreNotOut: true,
      spells: 0,
    });
  });

  it("ignores lines outside the senior match list and blank participants", () => {
    const rows = aggregateVsClubLines({
      matchIds: [1],
      batting: [bat(1, "g1", 10, "bowled"), bat(9, "g1", 99, "bowled"), bat(1, "", 50, "caught")],
      bowling: [{ matchId: 9, participantId: "g2", overs: 4, runs: 20, wickets: 3 }],
      appearances: [{ matchId: 9, participantId: "g3" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ participantId: "g1", runs: 10, matches: 1 });
  });

  it("sums wickets and balls, and keeps the best figures (most wickets, then fewest runs)", () => {
    const [row] = aggregateVsClubLines({
      matchIds: [1, 2, 3],
      batting: [],
      bowling: [
        { matchId: 1, participantId: "g2", overs: 7.3, runs: 30, wickets: 3 },
        { matchId: 2, participantId: "g2", overs: 10, runs: 18, wickets: 3 },
        { matchId: 3, participantId: "g2", overs: null, runs: 12, wickets: 1 },
      ],
      appearances: [{ matchId: 3, participantId: "g2" }],
    });
    expect(row).toMatchObject({
      matches: 3,
      spells: 3,
      wickets: 7,
      runsConceded: 60,
      // 7.3 overs = 45 balls, 10 = 60; the spell with no overs adds nothing.
      ballsBowled: 105,
      bestWickets: 3,
      bestRuns: 18,
      innings: 0,
      highScore: null,
    });
  });

  it("runs equal the sum of the per-innings match-log rows for the same lines", () => {
    const lines = [
      { matchId: 1, innings: 1, runs: 23, dismissalType: "caught", dismissal: "c X b Y" },
      { matchId: 1, innings: 3, runs: 51, dismissalType: "not out", dismissal: "not out" },
      { matchId: 2, innings: 2, runs: 0, dismissalType: "other", dismissal: "did not bat" },
      { matchId: 3, innings: 2, runs: 7, dismissalType: "lbw", dismissal: "lbw b Z" },
    ];
    const [row] = aggregateVsClubLines({
      matchIds: [1, 2, 3],
      batting: lines.map((l) => ({ ...l, participantId: "g1" })),
      bowling: [],
      appearances: [],
    });
    const perInnings = [1, 2, 3].flatMap((matchId) =>
      buildInningsLines(
        lines.filter((l) => l.matchId === matchId).map((l) => ({ ...l, batOrder: 3, balls: null })),
      ),
    );
    expect(row?.runs).toBe(perInnings.reduce((s, i) => s + (i.runs ?? 0), 0));
    expect(row?.innings).toBe(perInnings.length);
    expect(row?.notOuts).toBe(perInnings.filter((i) => i.notOut).length);
  });
});

describe("centralVsClub", () => {
  it("reads only senior matches between the clubs and omits private players", async () => {
    queuedSelects.push(
      // matches between the two clubs
      [
        { matchId: 1, grade: "A Grade", season: "2022/23" },
        { matchId: 2, grade: "Under 16", season: "2022/23" },
      ],
      // batting, bowling, rosters, fielding
      [bat(1, "g1", 45, "caught"), bat(2, "g1", 100, "bowled"), bat(1, "g9", 80, "bowled")],
      [{ matchId: 1, participantId: "g2", overs: 5, runs: 22, wickets: 2 }],
      [{ matchId: 1, participantId: "g3" }],
      [],
      // centralPlayerNames
      [
        { participantId: "g1", displayName: "A Batter", isPrivate: 0 },
        { participantId: "g2", displayName: "B Bowler", isPrivate: 0 },
        { participantId: "g3", displayName: "C Keeper", isPrivate: null },
        { participantId: "g9", displayName: "P Private", isPrivate: 1 },
      ],
    );
    const rows = await centralVsClub({ clubId: 1, opponentClubId: 4 });
    const byId = new Map(rows.map((r) => [r.participantId, r]));
    expect([...byId.keys()].sort()).toEqual(["g1", "g2", "g3"]);
    // The junior-grade hundred (match 2) is excluded.
    expect(byId.get("g1")).toMatchObject({ displayName: "A Batter", runs: 45, innings: 1 });
    expect(byId.get("g2")).toMatchObject({ wickets: 2, ballsBowled: 30, spells: 1 });
    expect(byId.get("g3")).toMatchObject({ matches: 1, innings: 0, spells: 0 });
  });

  it("never reads the club against itself", async () => {
    expect(await centralVsClub({ clubId: 3, opponentClubId: 3 })).toEqual([]);
  });

  it("returns [] when the clubs never met in a senior grade", async () => {
    queuedSelects.push([{ matchId: 7, grade: "Under 14", season: "2022/23" }]);
    expect(await centralVsClub({ clubId: 1, opponentClubId: 5 })).toEqual([]);
  });
});

describe("centralClubIdForPlayhqOrg", () => {
  it("returns the most frequent central club on the org's side", async () => {
    queuedSelects.push([{ clubId: 12, n: 40 }]);
    expect(await centralClubIdForPlayhqOrg("org-guid")).toBe(12);
  });

  it("is null when the org has no shared matches", async () => {
    queuedSelects.push([]);
    expect(await centralClubIdForPlayhqOrg("unknown-org")).toBeNull();
    expect(await centralClubIdForPlayhqOrg("  ")).toBeNull();
  });
});
