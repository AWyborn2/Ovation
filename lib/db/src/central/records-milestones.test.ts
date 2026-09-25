/**
 * centralMilestones — the `seniorOnly` career walk (juniors isolation for the
 * Social Studio season recap). Runs against a mocked centralDb: a player whose
 * junior runs would push them over a career tier must not cross it when only
 * senior matches count, while the default (board) behaviour is unchanged.
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

describe("centralMilestones seniorOnly", () => {
  it("junior runs never push a player over a career tier", async () => {
    queueScenario();
    const out = await centralMilestones(CLUB, TIERS, { seniorOnly: true });
    expect(out.filter((m) => m.kind === "career")).toEqual([]);
  });

  it("the default walk (the milestones board) is unchanged", async () => {
    queueScenario();
    // A different tiers object so the default call isn't served from cache.
    const out = await centralMilestones(CLUB, { ...TIERS });
    expect(out.filter((m) => m.kind === "career")).toEqual([
      expect.objectContaining({ boardKey: "runs", threshold: 1000, value: 1000, matchId: 2 }),
    ]);
  });
});
