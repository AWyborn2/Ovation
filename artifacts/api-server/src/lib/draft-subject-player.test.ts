import { describe, expect, it } from "vitest";
import { draftSubjectPlayerId } from "./draft-enrich";

/** Player sponsors: which drafts follow a player's sponsors. */
describe("draftSubjectPlayerId", () => {
  it("keeps the player on player-centred senior cards", () => {
    for (const kind of ["milestone", "century", "fiveFor", "debut", "player", "newSigning"]) {
      expect(draftSubjectPlayerId(kind, 42, false)).toBe(42);
    }
  });

  it("drops it on other kinds, junior cards, fill-ins and missing ids", () => {
    expect(draftSubjectPlayerId("matchSummary", 42, false)).toBeNull();
    expect(draftSubjectPlayerId("teamList", 42, false)).toBeNull();
    expect(draftSubjectPlayerId("record", 42, false)).toBeNull();
    expect(draftSubjectPlayerId("milestone", 42, true)).toBeNull();
    expect(draftSubjectPlayerId("milestone", 90001, false)).toBeNull();
    expect(draftSubjectPlayerId("milestone", null, false)).toBeNull();
    expect(draftSubjectPlayerId("milestone", 0, false)).toBeNull();
  });
});
