import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUND_SCHEDULES,
  invalidRoundSchedule,
  lastScheduledAt,
  mergeRoundSchedules,
  resolveRoundSchedules,
} from "./round-schedules";

/** Round set schedules (balanced card sets U5): defaults, merging and club-time maths. */

describe("round schedules", () => {
  it("defaults keep a club that never saved one exactly as before", () => {
    const s = resolveRoundSchedules(null);
    expect(s.gameDay.mode).toBe("perFixture");
    expect(s.teamLists.mode).toBe("perFixture");
    expect(s.weekendWrap.mode).toBe("off");
    expect(s).toEqual(DEFAULT_ROUND_SCHEDULES);
  });

  it("saved cards win, the rest keep their defaults, and saves merge per card", () => {
    const saved = mergeRoundSchedules(
      { gameDay: { mode: "perRound", day: 4, hour: 18 } },
      { weekendWrap: { mode: "perRound", day: 0, hour: 20 } },
    );
    const s = resolveRoundSchedules(saved);
    expect(s.gameDay).toEqual({ mode: "perRound", day: 4, hour: 18 });
    expect(s.weekendWrap).toEqual({ mode: "perRound", day: 0, hour: 20 });
    expect(s.teamLists).toEqual(DEFAULT_ROUND_SCHEDULES.teamLists);
  });

  it("the weekend wrap can't be drafted per match", () => {
    expect(invalidRoundSchedule("weekendWrap", { mode: "perFixture", day: 0, hour: 19 })).toMatch(
      /once a round/,
    );
    expect(invalidRoundSchedule("gameDay", { mode: "perFixture", day: 0, hour: 19 })).toBeNull();
  });

  it("finds the most recent chosen day and hour in Perth time", () => {
    const thu6pm = { day: 4, hour: 18 }; // Thursday 6 pm Perth = Thursday 10:00 UTC
    // Saturday 8 am Perth → this week's Thursday.
    expect(lastScheduledAt(new Date("2026-10-10T00:00:00Z"), thu6pm).toISOString()).toBe(
      "2026-10-08T10:00:00.000Z",
    );
    // Exactly on time counts.
    expect(lastScheduledAt(new Date("2026-10-08T10:00:00Z"), thu6pm).toISOString()).toBe(
      "2026-10-08T10:00:00.000Z",
    );
    // A minute early → last week's.
    expect(lastScheduledAt(new Date("2026-10-08T09:59:00Z"), thu6pm).toISOString()).toBe(
      "2026-10-01T10:00:00.000Z",
    );
    // Sunday 7 pm Perth, asked late Sunday UTC (already Monday in Perth).
    expect(
      lastScheduledAt(new Date("2026-10-11T17:00:00Z"), { day: 0, hour: 19 }).toISOString(),
    ).toBe("2026-10-11T11:00:00.000Z");
  });
});
