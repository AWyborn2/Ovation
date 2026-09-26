/**
 * social-achievements.test.ts — the central per-match achievements read used by
 * the Social Studio sweep and backfill. The fold is pure and tested directly:
 * centuries / five-fors per match, senior debuts, senior-only career
 * crossings (juniors isolation), privacy, and the empty short-circuit of the
 * query (against a mocked centralDb).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const queuedSelects: unknown[][] = [];

vi.mock("../central", async () => {
  const schema = await vi.importActual("../central-schema");
  const makeBuilder = () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(queuedSelects.shift() ?? []).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };
  return { ...schema, centralDb: { select: () => makeBuilder() } };
});

import {
  centralMatchAchievements,
  foldMatchAchievements,
  type AchievementMatchMeta,
  type FoldAchievementsInput,
} from "./social-achievements";

beforeEach(() => {
  queuedSelects.length = 0;
});

const TIERS = {
  games: [50, 100],
  runs: [1000, 2500],
  wickets: [50, 100],
  dismissals: [25, 50],
};

const senior = (
  matchId: number,
  season: number,
  date: string,
  round = 1,
): AchievementMatchMeta => ({
  matchId,
  grade: "A Grade",
  season,
  matchDate: date,
  round,
  opponent: "Rivals CC",
});
const junior = (matchId: number, season: number, date: string): AchievementMatchMeta => ({
  matchId,
  grade: null, // junior / pathway labels never map to an app grade
  season,
  matchDate: date,
  round: 1,
  opponent: "Rivals Juniors",
});

const bat = (participantId: string, matchId: number, runs: number, notOut = false) => ({
  participantId,
  matchId,
  runs,
  balls: 100,
  dismissal: notOut ? "not out" : "b Bowler",
  dismissalType: notOut ? "not out" : "bowled",
});
const bowl = (participantId: string, matchId: number, wickets: number, runs: number) => ({
  participantId,
  matchId,
  wickets,
  runs,
  overs: 10,
});

function input(over: Partial<FoldAchievementsInput>): FoldAchievementsInput {
  return {
    targetIds: [],
    matches: [],
    batting: [],
    bowling: [],
    rosters: [],
    fielding: [],
    names: new Map(),
    tiers: TIERS,
    ...over,
  };
}

describe("foldMatchAchievements", () => {
  it("finds a century, a five-for and a debut in the target match", () => {
    const out = foldMatchAchievements(
      input({
        targetIds: [2],
        matches: [senior(1, 2024, "2024-10-05"), senior(2, 2024, "2024-10-12", 2)],
        batting: [bat("a", 1, 20), bat("a", 2, 104, true), bat("b", 2, 3)],
        bowling: [bowl("b", 2, 6, 21), bowl("a", 2, 1, 30)],
        names: new Map([
          ["a", { displayName: "A Star", isPrivate: false }],
          ["b", { displayName: "B Debut", isPrivate: false }],
        ]),
      }),
    );
    expect(out).toEqual([
      expect.objectContaining({ kind: "debut", participantId: "b", matchId: 2, round: 2 }),
      expect.objectContaining({
        kind: "century",
        participantId: "a",
        runs: 104,
        notOut: true,
        grade: "A Grade",
        season: 2024,
        opponent: "Rivals CC",
        displayName: "A Star",
      }),
      expect.objectContaining({
        kind: "fiveFor",
        participantId: "b",
        wickets: 6,
        runsConceded: 21,
        overs: "10",
      }),
    ]);
  });

  it("takes the best innings and the best spell of a two-innings match", () => {
    const out = foldMatchAchievements(
      input({
        targetIds: [1],
        matches: [senior(1, 2024, "2024-10-05")],
        batting: [bat("a", 1, 40), bat("a", 1, 120)],
        bowling: [bowl("a", 1, 5, 40), bowl("a", 1, 5, 12)],
      }),
    );
    const feats = out.filter((a) => a.kind === "century" || a.kind === "fiveFor");
    expect(feats).toHaveLength(2);
    expect(feats).toContainEqual(expect.objectContaining({ kind: "century", runs: 120 }));
    expect(feats).toContainEqual(expect.objectContaining({ kind: "fiveFor", runsConceded: 12 }));
  });

  it("reports only the target matches", () => {
    const out = foldMatchAchievements(
      input({
        targetIds: [2],
        matches: [senior(1, 2024, "2024-10-05"), senior(2, 2024, "2024-10-12")],
        batting: [bat("a", 1, 150), bat("a", 2, 10)],
      }),
    );
    expect(out).toEqual([]);
  });

  it("a debut is the first SENIOR appearance: junior games don't count", () => {
    const out = foldMatchAchievements(
      input({
        targetIds: [2],
        matches: [junior(1, 2023, "2023-11-01"), senior(2, 2024, "2024-10-12")],
        batting: [bat("k", 1, 50), bat("k", 2, 12)],
      }),
    );
    expect(out).toEqual([expect.objectContaining({ kind: "debut", participantId: "k" })]);
  });

  it("no debut for a player who played an earlier senior match (ordered by season, then date)", () => {
    const out = foldMatchAchievements(
      input({
        // Higher id but earlier date: still the earlier match.
        targetIds: [5],
        matches: [senior(5, 2024, "2024-10-12"), senior(9, 2024, "2024-10-05")],
        rosters: [
          { participantId: "r", matchId: 9 },
          { participantId: "r", matchId: 5 },
        ],
      }),
    );
    expect(out.filter((a) => a.kind === "debut")).toEqual([]);
  });

  it("junior runs never push a player over a career milestone", () => {
    const out = foldMatchAchievements(
      input({
        targetIds: [3],
        matches: [
          junior(1, 2023, "2023-11-01"),
          senior(2, 2024, "2024-10-05"),
          senior(3, 2024, "2024-10-12"),
        ],
        // 700 junior + 300 senior would be 1000; senior-only is 300.
        batting: [bat("c", 1, 700), bat("c", 2, 200), bat("c", 3, 100)],
      }),
    );
    expect(out.filter((a) => a.kind === "career")).toEqual([]);
  });

  it("emits a senior career crossing in the match that reaches the tier", () => {
    const out = foldMatchAchievements(
      input({
        targetIds: [3],
        matches: [
          senior(1, 2023, "2023-11-01"),
          senior(2, 2024, "2024-10-05"),
          senior(3, 2024, "2024-10-12"),
        ],
        batting: [bat("s", 1, 600), bat("s", 2, 300), bat("s", 3, 150)],
      }),
    );
    expect(out).toContainEqual(
      expect.objectContaining({
        kind: "career",
        participantId: "s",
        boardKey: "runs",
        tierIndex: 0,
        threshold: 1000,
        value: 1050,
        matchId: 3,
      }),
    );
  });

  it("counts catches and stumpings (not run-outs) as dismissals", () => {
    const matches = Array.from({ length: 3 }, (_, i) => senior(i + 1, 2024, `2024-10-0${i + 1}`));
    const fielding = [
      ...Array.from({ length: 12 }, () => ({ participantId: "w", matchId: 1, kind: "caught" })),
      ...Array.from({ length: 12 }, () => ({ participantId: "w", matchId: 2, kind: "stumped" })),
      ...Array.from({ length: 5 }, () => ({ participantId: "w", matchId: 3, kind: "run out" })),
      { participantId: "w", matchId: 3, kind: "caught" },
    ];
    const out = foldMatchAchievements(
      input({
        targetIds: [3],
        matches,
        fielding,
        rosters: matches.map((m) => ({ participantId: "w", matchId: m.matchId })),
      }),
    );
    expect(out.filter((a) => a.kind === "career")).toEqual([
      expect.objectContaining({ boardKey: "dismissals", threshold: 25, value: 25 }),
    ]);
  });

  it("omits private players and NULL participants entirely", () => {
    const out = foldMatchAchievements(
      input({
        targetIds: [1],
        matches: [senior(1, 2024, "2024-10-05")],
        batting: [bat("p", 1, 180), { ...bat("x", 1, 150), participantId: null }],
        bowling: [bowl("p", 1, 7, 10)],
        names: new Map([["p", { displayName: "P Hidden", isPrivate: true }]]),
      }),
    );
    expect(out).toEqual([]);
  });

  it("a junior target match emits nothing", () => {
    const out = foldMatchAchievements(
      input({
        targetIds: [1],
        matches: [junior(1, 2024, "2024-10-05")],
        batting: [bat("k", 1, 200)],
        bowling: [bowl("k", 1, 8, 4)],
      }),
    );
    expect(out).toEqual([]);
  });
});

describe("centralMatchAchievements", () => {
  it("reads nothing for no match ids", async () => {
    expect(await centralMatchAchievements(7, [], TIERS)).toEqual([]);
  });

  it("stops after the match list when no id is one of the club's senior matches", async () => {
    queuedSelects.push([
      {
        matchId: 1,
        grade: "Under 15 Boys",
        season: "2024/25",
        matchDate: "2024-10-05",
        round: "1",
        homeClubId: 7,
        homeTeam: "Club",
        awayTeam: "Rivals",
      },
    ]);
    expect(await centralMatchAchievements(7, [1, 999], TIERS)).toEqual([]);
    expect(queuedSelects).toHaveLength(0);
  });
});
