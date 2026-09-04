import { describe, it, expect } from "vitest";
import { FILL_IN_THRESHOLD, isFillInPlayerId } from "./fill-in";

describe("FILL_IN_THRESHOLD", () => {
  it("is the documented fill-in floor (playerId >= 90000)", () => {
    // replit.md Gotcha / AGENTS.md hard constraint — the rule must not move.
    expect(FILL_IN_THRESHOLD).toBe(90000);
  });

  it("isFillInPlayerId is inclusive at the floor", () => {
    expect(isFillInPlayerId(89999)).toBe(false);
    expect(isFillInPlayerId(90000)).toBe(true);
    expect(isFillInPlayerId(90001)).toBe(true);
  });
});
