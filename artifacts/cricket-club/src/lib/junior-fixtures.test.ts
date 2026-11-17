import { describe, expect, it } from "vitest";
import type { Fixture } from "@workspace/api-client-react";
import { fmtFixtureWhen } from "@/components/studio-create/format";
import { fixtureToMatchDayState } from "@/components/card-forms/prefill";
import { fmtJuniorStart } from "./junior-fixtures";

/**
 * Fixture times show in club (Perth) time whatever the browser's zone: a 12:30pm
 * Perth start is 04:30 UTC, and must never read as 4:30am.
 */
const PERTH_1230 = "2026-11-21T04:30:00.000Z";

describe("fixture times in club time", () => {
  it("formats a junior fixture's start in Perth time", () => {
    expect(fmtJuniorStart(PERTH_1230)).toMatch(/12:30\s?pm/i);
    expect(fmtJuniorStart(PERTH_1230)).not.toMatch(/4:30/);
    expect(fmtJuniorStart(null)).toBeNull();
  });

  it("formats Create's fixture lists in Perth time", () => {
    expect(fmtFixtureWhen(PERTH_1230)).toBe("Sat, 21 Nov, 12:30pm");
    // Late evening UTC is the next morning in Perth.
    expect(fmtFixtureWhen("2026-11-20T23:30:00.000Z")).toBe("Sat, 21 Nov, 7:30am");
  });

  it("prefills a Match Day card's date and start time in Perth time", () => {
    const state = fixtureToMatchDayState({
      id: 1,
      grade: "A Grade",
      opponentName: "Mandurah",
      startAt: "2026-11-20T23:30:00.000Z",
      isHome: true,
      source: "playhq",
      createdAt: "2026-09-01T00:00:00Z",
    } as Fixture);
    expect(state.startTime).toMatch(/^7:30\sAM$/);
    expect(state.date).toMatch(/^SAT,? 21 NOV$/);
  });
});
