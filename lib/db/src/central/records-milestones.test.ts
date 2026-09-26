/**
 * centralMilestones — career totals are senior-only (juniors isolation), for
 * the milestones board and the Social Studio alike. Runs against a mocked
 * centralDb: a player whose junior runs would push them over a career tier
 * must never cross it.
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

import { centralMilestones } from "./records";

const CLUB = 7;
const TIERS = { games: [50], runs: [1000], wickets: [100], dismissals: [25] };

/** Last season: a junior game with 700 runs. This season: a senior game with 300. */
function queueScenario() {
  queuedSelects.push(
    // club matches
    [
      {
        matchId: 1,
        grade: "Under 15 Boys",
        season: "2023/24",
        matchDate: null,
        homeClubId: CLUB,
        awayClubId: 99,
        homeTeam: "Club",
        awayTeam: "Rivals",
      },
      {
        matchId: 2,
        grade: "A Grade",
        season: "2024/25",
        matchDate: null,
        homeClubId: CLUB,
        awayClubId: 99,
        homeTeam: "Club",
        awayTeam: "Rivals",
      },
    ],
    // batting, bowling, rosters, fielding
    [
      { participantId: "p", matchId: 1, runs: 700 },
      { participantId: "p", matchId: 2, runs: 300 },
    ],
    [],
    [],
    [],
    // player names
    [{ participantId: "p", displayName: "C Crossover", isPrivate: 0 }],
  );
}

beforeEach(() => {
  queuedSelects.length = 0;
});

describe("centralMilestones senior-only career walk", () => {
  it("junior runs never push a player over a career tier", async () => {
    queueScenario();
    const out = await centralMilestones(CLUB, TIERS);
    expect(out.filter((m) => m.kind === "career")).toEqual([]);
  });

  it("senior runs alone still cross the tier", async () => {
    queueScenario();
    // A different tiers object so this call isn't served from cache.
    const out = await centralMilestones(CLUB, { ...TIERS, runs: [300] });
    expect(out.filter((m) => m.kind === "career")).toEqual([
      expect.objectContaining({ boardKey: "runs", threshold: 300, value: 300, matchId: 2 }),
    ]);
  });
});
