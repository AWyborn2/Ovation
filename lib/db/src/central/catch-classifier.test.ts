/**
 * ONE catch rule on every central read (hybrid stats plan U10 follow-up).
 *
 * `central.fielding.kind` is free text. Player pages, the leaderboard and the
 * club overlay classify it with `classifyFieldingKind`; the records card, the
 * record leaders and the grade summaries each had their own regex, so the same
 * player could show a different catch count on different pages ("ct" was a
 * catch on the season rows but not on the records card). They now all use the
 * classifier. Runs against a mocked centralDb, like records-milestones.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** FIFO of builder (select) results, in the order the read issues them. */
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

import { clearCentralQueriesCache } from "./cache";
import { centralClubRecords, centralRecordLeaders } from "./records";
import { classifyFieldingKind } from "./scoring";
import { centralGradeSummaries } from "./summaries";

const CLUB = 7;
const MATCHES = [{ matchId: 1, grade: "A Grade", season: "2024/25" }];
const ROSTERS = [
  { participantId: "keeper", matchId: 1 },
  { participantId: "fielder", matchId: 1 },
];
const NAMES = [
  { participantId: "keeper", displayName: "K Keeper", isPrivate: 0 },
  { participantId: "fielder", displayName: "F Fielder", isPrivate: 0 },
];
/** The keeper: 5 stumpings + 2 run-outs. The fielder: 3 catches, two written "ct". */
const KINDS: [string, string, number][] = [
  ["keeper", "st", 5],
  ["keeper", "run out", 2],
  ["fielder", "ct", 2],
  ["fielder", "caught", 1],
];

beforeEach(() => {
  clearCentralQueriesCache();
  queuedSelects.length = 0;
});

describe("one catch classifier everywhere", () => {
  it("the classifier itself: catches, never a stumping or a run-out", () => {
    expect(KINDS.map(([, kind]) => classifyFieldingKind(kind))).toEqual([
      "stumping",
      "runOut",
      "catch",
      "catch",
    ]);
  });

  it("the records card's Most Catches counts what the classifier counts", async () => {
    queuedSelects.push(
      MATCHES,
      [], // batting
      [], // bowling
      ROSTERS,
      KINDS.map(([participantId, kind, n]) => ({ participantId, kind, n })),
      NAMES,
    );
    const records = await centralClubRecords(CLUB);
    expect(records.mostCatches).toMatchObject({ participantId: "fielder", value: 3 });
  });

  it("the catches leaders list agrees with the records card", async () => {
    queuedSelects.push(
      MATCHES,
      [], // batting
      [], // bowling
      ROSTERS,
      KINDS.flatMap(([participantId, kind, n]) =>
        Array.from({ length: n }, () => ({ participantId, matchId: 1, kind })),
      ),
      NAMES,
    );
    const leaders = await centralRecordLeaders(CLUB, "catches");
    expect(leaders.map((l) => [l.participantId, l.value])).toEqual([["fielder", 3]]);
  });

  it("grade summaries split catches, stumpings and run-outs the same way", async () => {
    queuedSelects.push(
      [], // batting
      [], // bowling
      ROSTERS,
      KINDS.map(([, kind, n]) => ({ matchId: 1, kind, n })),
    );
    const [summary] = await centralGradeSummaries(CLUB, MATCHES);
    expect(summary).toMatchObject({ grade: "A Grade", catches: 3, stumpings: 5, runOuts: 2 });
  });
});
