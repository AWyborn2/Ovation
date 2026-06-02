import { describe, it, expect, afterEach } from "vitest";
import type { AwardVotingConfigRow } from "@workspace/db";
import { computeTally, isTallyVisible } from "./voting";
import {
  createVotingScenario,
  insertBallot,
  type VotingScenario,
} from "./voting.test-helpers";

function fakeConfig(overrides: Partial<AwardVotingConfigRow>): AwardVotingConfigRow {
  return {
    id: 1,
    awardId: 1,
    season: 2099,
    votingEnabled: true,
    votingOpen: true,
    grades: ["A Grade"],
    tallyVisible: true,
    autoHideAfterRounds: null,
    finalisedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("isTallyVisible", () => {
  it("hides when voting is disabled", () => {
    expect(isTallyVisible(fakeConfig({ votingEnabled: false }), 0)).toBe(false);
  });

  it("hides when the admin switch is off", () => {
    expect(isTallyVisible(fakeConfig({ tallyVisible: false }), 0)).toBe(false);
  });

  it("shows when enabled, switched on and no auto-hide", () => {
    expect(isTallyVisible(fakeConfig({ autoHideAfterRounds: null }), 99)).toBe(true);
  });

  it("shows while rounds played are below the auto-hide threshold", () => {
    expect(isTallyVisible(fakeConfig({ autoHideAfterRounds: 5 }), 4)).toBe(true);
  });

  it("hides once rounds played reach the auto-hide threshold", () => {
    expect(isTallyVisible(fakeConfig({ autoHideAfterRounds: 5 }), 5)).toBe(false);
  });

  it("hides once rounds played exceed the auto-hide threshold", () => {
    expect(isTallyVisible(fakeConfig({ autoHideAfterRounds: 5 }), 6)).toBe(false);
  });

  it("treats a threshold of 0 as immediately hidden", () => {
    expect(isTallyVisible(fakeConfig({ autoHideAfterRounds: 0 }), 0)).toBe(false);
  });
});

describe("computeTally", () => {
  let scenario: VotingScenario | undefined;

  afterEach(async () => {
    if (scenario) {
      await scenario.cleanup();
      scenario = undefined;
    }
  });

  it("sums 3-2-1 points and orders entries by points desc", async () => {
    scenario = await createVotingScenario({ playerCount: 3, rounds: [1, 2] });
    const [a, b, c] = scenario.playerIds;
    // Round 1: a=3, b=2, c=1
    await insertBallot({
      configId: scenario.configId,
      captainId: scenario.captainId,
      grade: "A Grade",
      round: 1,
      pick1PlayerId: a,
      pick2PlayerId: b,
      pick3PlayerId: c,
    });
    // Round 2: b=3, a=2, c=1  => totals a=5, b=5, c=2
    await insertBallot({
      configId: scenario.configId,
      captainId: scenario.captainId,
      grade: "A Grade",
      round: 2,
      pick1PlayerId: b,
      pick2PlayerId: a,
      pick3PlayerId: c,
    });

    const tally = await computeTally(scenario.config);
    const byId = new Map(tally.entries.map((e) => [e.playerId, e]));
    expect(byId.get(a)?.points).toBe(5);
    expect(byId.get(b)?.points).toBe(5);
    expect(byId.get(c)?.points).toBe(2);
    expect(byId.get(a)?.firstPlaces).toBe(1);
    expect(byId.get(a)?.secondPlaces).toBe(1);
    expect(byId.get(c)?.thirdPlaces).toBe(2);
    // c (2 pts) must sort last.
    expect(tally.entries[tally.entries.length - 1].playerId).toBe(c);
  });

  it("breaks point ties by first-place count, then by name", async () => {
    scenario = await createVotingScenario({ playerCount: 3, rounds: [1, 2] });
    const [a, b, c] = scenario.playerIds;
    // a gets two firsts (6), b gets a first+third over two rounds, c filler.
    // Round 1: a=3(1st), b=2(2nd), c=1(3rd)
    await insertBallot({
      configId: scenario.configId,
      captainId: scenario.captainId,
      grade: "A Grade",
      round: 1,
      pick1PlayerId: a,
      pick2PlayerId: b,
      pick3PlayerId: c,
    });
    // Round 2: b=3(1st), c=2(2nd), a=1(3rd)  => a=4(1 first), b=5, c=3
    await insertBallot({
      configId: scenario.configId,
      captainId: scenario.captainId,
      grade: "A Grade",
      round: 2,
      pick1PlayerId: b,
      pick2PlayerId: c,
      pick3PlayerId: a,
    });

    const tally = await computeTally(scenario.config);
    // b has most points (5) -> first. Then a (4) -> second, c (3) -> third.
    expect(tally.entries.map((e) => e.playerId)).toEqual([b, a, c]);
    expect(tally.winnerPlayerIds).toEqual([b]);
  });

  it("orders equal-point, equal-first-place entries alphabetically by name", async () => {
    // Two players each get exactly one first place and nothing else: same points
    // (3) and same first-place count (1) -> tie broken by name ascending.
    scenario = await createVotingScenario({ playerCount: 4, rounds: [1, 2] });
    const [a, b, c, d] = scenario.playerIds;
    // Round 1: a=3(1st), c=2, d=1
    await insertBallot({
      configId: scenario.configId,
      captainId: scenario.captainId,
      grade: "A Grade",
      round: 1,
      pick1PlayerId: a,
      pick2PlayerId: c,
      pick3PlayerId: d,
    });
    // Round 2: b=3(1st), c=2, d=1 => a and b both 3 pts / 1 first
    await insertBallot({
      configId: scenario.configId,
      captainId: scenario.captainId,
      grade: "A Grade",
      round: 2,
      pick1PlayerId: b,
      pick2PlayerId: c,
      pick3PlayerId: d,
    });

    const tally = await computeTally(scenario.config);
    const aEntry = tally.entries.find((e) => e.playerId === a)!;
    const bEntry = tally.entries.find((e) => e.playerId === b)!;
    expect(aEntry.points).toBe(3);
    expect(bEntry.points).toBe(3);
    // Names are P01.. (a) and P02.. (b); a sorts before b.
    const aIdx = tally.entries.findIndex((e) => e.playerId === a);
    const bIdx = tally.entries.findIndex((e) => e.playerId === b);
    expect(aIdx).toBeLessThan(bIdx);
  });

  it("returns all top-scoring players as winners on a tie", async () => {
    scenario = await createVotingScenario({ playerCount: 3, rounds: [1, 2] });
    const [a, b, c] = scenario.playerIds;
    // Round 1: a=3, b=2, c=1
    await insertBallot({
      configId: scenario.configId,
      captainId: scenario.captainId,
      grade: "A Grade",
      round: 1,
      pick1PlayerId: a,
      pick2PlayerId: b,
      pick3PlayerId: c,
    });
    // Round 2: b=3, a=2, c=1 => a=5, b=5 tie for the lead
    await insertBallot({
      configId: scenario.configId,
      captainId: scenario.captainId,
      grade: "A Grade",
      round: 2,
      pick1PlayerId: b,
      pick2PlayerId: a,
      pick3PlayerId: c,
    });

    const tally = await computeTally(scenario.config);
    expect([...tally.winnerPlayerIds].sort((x, y) => x - y)).toEqual(
      [a, b].sort((x, y) => x - y),
    );
  });

  it("has no winners and no entries when no ballots exist", async () => {
    scenario = await createVotingScenario({ playerCount: 3, rounds: [1] });
    const tally = await computeTally(scenario.config);
    expect(tally.entries).toEqual([]);
    expect(tally.winnerPlayerIds).toEqual([]);
  });

  it("counts distinct non-abandoned rounds played", async () => {
    scenario = await createVotingScenario({ playerCount: 3, rounds: [1, 2, 3] });
    const tally = await computeTally(scenario.config);
    expect(tally.roundsPlayed).toBe(3);
  });
});
