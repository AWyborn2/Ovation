import { describe, expect, it } from "vitest";
import { bindInput } from "./bind";
import type { ShareCardInput } from "../share-card";

/** A games milestone card reads "Club Milestone" over its number, whatever tier name it was saved with. */
const games = (tierLabel: string) =>
  ({
    kind: "milestone",
    playerName: "Zachary Dreckow",
    tierLabel,
    tierIndex: 1,
    milestoneLabel: "Games",
    currentValue: 100,
  }) as ShareCardInput;

describe("milestone heading", () => {
  it("binds 'Club Milestone' for a games tier, old 'Centurion' cards included", () => {
    expect(bindInput(games("Centurion"), null).values["tierLabel"]).toBe("Club Milestone");
    expect(bindInput(games("150 Games"), null).values["tierLabel"]).toBe("Club Milestone");
  });

  it("keeps a runs tier as it is", () => {
    const runs = { ...games("1000 Runs"), milestoneLabel: "Runs" } as ShareCardInput;
    expect(bindInput(runs, null).values["tierLabel"]).toBe("1000 Runs");
  });
});
