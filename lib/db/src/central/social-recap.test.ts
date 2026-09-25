/**
 * social-recap.test.ts — the central round-up / recap read. The pure grade /
 * season / round selection and the per-participant fold are tested directly;
 * the query runs against a mocked centralDb so privacy omission and the
 * no-match short-circuit are pinned without a database.
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

import {
  centralGradeSeasonSocial,
  foldGradeSeasonSocial,
  socialGradeSeasonMatches,
} from "./social-recap";

beforeEach(() => {
  queuedSelects.length = 0;
});

describe("socialGradeSeasonMatches", () => {
  const rows = [
    { matchId: 1, grade: "A Grade", season: "Summer 2024/25", round: "Round 3" },
    { matchId: 2, grade: "A Grade: Wyllie Cup", season: "Summer 2024/25", round: "Round 11" },
    { matchId: 3, grade: "A Grade", season: "Summer 2024/25", round: "Grand Final" },
    { matchId: 4, grade: "A Grade", season: "Summer 2023/24", round: "Round 14" },
    { matchId: 5, grade: "Under 15 Boys", season: "Summer 2024/25", round: "Round 12" },
    { matchId: 6, grade: "B Grade", season: "Summer 2024/25", round: "Round 13" },
  ];

  it("keeps the grade's season matches; finals count but carry no round", () => {
    expect(socialGradeSeasonMatches(rows, "A Grade", 2024)).toEqual({
      matchIds: [1, 2, 3],
      latestRound: 11,
    });
  });

  it("never selects junior labels (juniors isolation)", () => {
    expect(socialGradeSeasonMatches(rows, "Under 15 Boys", 2024).matchIds).toEqual([]);
  });
});

describe("foldGradeSeasonSocial", () => {
  it("sums the season, skips did-not-bat, and keeps the best innings and spell", () => {
    const out = foldGradeSeasonSocial(
      [
        { participantId: "a", runs: 87, dismissal: "not out", dismissalType: "not out" },
        { participantId: "a", runs: 87, dismissal: "b Smith", dismissalType: "bowled" },
        { participantId: "a", runs: 12, dismissal: "c X b Y", dismissalType: "caught" },
        { participantId: "b", runs: 0, dismissal: "did not bat", dismissalType: "other" },
        { participantId: null, runs: 200, dismissal: "not out", dismissalType: "not out" },
      ],
      [
        { participantId: "b", wickets: 5, runs: 30 },
        { participantId: "b", wickets: 5, runs: 22 },
        { participantId: "b", wickets: 2, runs: 10 },
      ],
      [
        { participantId: "a", kind: "caught", n: 2 },
        { participantId: "a", kind: "stumped", n: 1 },
        { participantId: "a", kind: "run out", n: 4 },
      ],
    );
    expect(out.get("a")).toEqual({
      runs: 186,
      wickets: 0,
      dismissals: 3,
      highScore: "87*",
      bestBowling: null,
    });
    expect(out.get("b")).toEqual({
      runs: 0,
      wickets: 12,
      dismissals: 0,
      highScore: null,
      bestBowling: "5/22",
    });
    expect(out.size).toBe(2);
  });
});

describe("centralGradeSeasonSocial", () => {
  it("returns nothing (and reads no lines) when the club has no match in the grade + season", async () => {
    queuedSelects.push([{ matchId: 9, grade: "Colts", season: "2024/25", round: "1" }]);
    expect(await centralGradeSeasonSocial(1, "A Grade", 2024)).toEqual({
      performers: [],
      innings: [],
      latestRound: null,
    });
    expect(queuedSelects).toHaveLength(0);
  });

  it("omits private participants", async () => {
    queuedSelects.push(
      [{ matchId: 1, grade: "A Grade", season: "2024/25", round: "Round 2" }],
      [
        { participantId: "pub", runs: 40, dismissal: "b X", dismissalType: "bowled" },
        { participantId: "priv", runs: 99, dismissal: "b X", dismissalType: "bowled" },
      ],
      [],
      [],
      [
        { participantId: "pub", displayName: "P Public", isPrivate: 0 },
        { participantId: "priv", displayName: "S Secret", isPrivate: 1 },
      ],
    );
    const res = await centralGradeSeasonSocial(1, "A Grade", 2024);
    expect(res.latestRound).toBe(2);
    expect(res.performers).toEqual([
      { participantId: "pub", displayName: "P Public", runs: 40, wickets: 0, dismissals: 0 },
    ]);
    expect(res.innings.map((i) => i.participantId)).toEqual(["pub"]);
  });
});
