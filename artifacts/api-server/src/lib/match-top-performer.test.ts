import { describe, it, expect } from "vitest";
import { topPerformerPlayerId, type PerformerLine } from "./match-top-performer";

const line = (over: Partial<PerformerLine> & { playerId: number }): PerformerLine => ({
  batted: false,
  bowled: false,
  ...over,
});

describe("topPerformerPlayerId", () => {
  it("features the top run-scorer", () => {
    expect(
      topPerformerPlayerId([
        line({ playerId: 1, batted: true, runs: 30, bowled: true, wickets: 5 }),
        line({ playerId: 2, batted: true, runs: 55 }),
      ]),
    ).toBe(2);
  });

  it("breaks a tie on runs with the better bowling", () => {
    expect(
      topPerformerPlayerId([
        line({ playerId: 1, batted: true, runs: 40, bowled: true, wickets: 1, runsConceded: 20 }),
        line({ playerId: 2, batted: true, runs: 40, bowled: true, wickets: 3, runsConceded: 35 }),
        line({ playerId: 3, batted: true, runs: 40, bowled: true, wickets: 3, runsConceded: 18 }),
      ]),
    ).toBe(3);
  });

  it("with no one batting, features the best bowler", () => {
    expect(
      topPerformerPlayerId([
        line({ playerId: 4, bowled: true, wickets: 2, runsConceded: 10 }),
        line({ playerId: 5, bowled: true, wickets: 4, runsConceded: 30 }),
      ]),
    ).toBe(5);
  });

  it("never features a fill-in or an unresolved (private/unmapped) player", () => {
    expect(
      topPerformerPlayerId([
        line({ playerId: 90001, batted: true, runs: 120 }),
        line({ playerId: 0, batted: true, runs: 80 }),
        line({ playerId: 7, batted: true, runs: 12 }),
      ]),
    ).toBe(7);
  });

  it("is null when no club player batted or bowled", () => {
    expect(topPerformerPlayerId([])).toBeNull();
    expect(topPerformerPlayerId([line({ playerId: 8 })])).toBeNull();
    expect(topPerformerPlayerId([line({ playerId: 90002, batted: true, runs: 9 })])).toBeNull();
  });
});
