import { describe, expect, it } from "vitest";
import {
  DEFAULT_POSTING_SCHEDULE,
  clubDate,
  invalidPostingSchedule,
  mergePostingSchedule,
  resolvePostingSchedule,
  seedPostingSchedule,
  slotKindOf,
} from "./posting-schedule";
import { DEFAULT_ROUND_SCHEDULES } from "./round-schedules";

describe("resolvePostingSchedule", () => {
  it("is the disabled default for a club that never saved one", () => {
    expect(resolvePostingSchedule(null)).toEqual(DEFAULT_POSTING_SCHEDULE);
    expect(resolvePostingSchedule(null).enabled).toBe(false);
  });

  it("lays saved values over the defaults", () => {
    const s = resolvePostingSchedule({
      enabled: true,
      dailyCap: 6,
      kinds: { debuts: { slots: [{ day: 3, time: "18:00" }], collision: "roll" } },
    });
    expect(s.enabled).toBe(true);
    expect(s.dailyCap).toBe(6);
    expect(s.minGapMinutes).toBe(DEFAULT_POSTING_SCHEDULE.minGapMinutes);
    expect(s.kinds.debuts).toEqual({ slots: [{ day: 3, time: "18:00" }], collision: "roll" });
    expect(s.kinds.milestones).toEqual(DEFAULT_POSTING_SCHEDULE.kinds.milestones);
  });
});

describe("mergePostingSchedule", () => {
  it("keeps other kinds' slots when one kind changes", () => {
    const saved = {
      enabled: true,
      kinds: {
        milestones: { slots: [{ day: 0, time: "18:00" }], collision: "space" as const },
      },
    };
    const merged = mergePostingSchedule(saved, {
      kinds: { debuts: { slots: [{ day: 3, time: "18:00" }], collision: "roll" } },
    });
    expect(merged.enabled).toBe(true);
    expect(merged.kinds?.milestones).toEqual(saved.kinds.milestones);
    expect(merged.kinds?.debuts?.slots).toEqual([{ day: 3, time: "18:00" }]);
  });
});

describe("seedPostingSchedule", () => {
  it("starts round cards at the times the club already drafts them", () => {
    const seeded = seedPostingSchedule({
      ...DEFAULT_ROUND_SCHEDULES,
      teamLists: { mode: "perRound", day: 5, hour: 9 },
    });
    expect(seeded.kinds.teamLists.slots).toEqual([{ day: 5, time: "09:00" }]);
    expect(seeded.kinds.gameDay.slots).toEqual([{ day: 4, time: "18:00" }]);
    expect(seeded.kinds.roundResults.slots).toEqual([{ day: 0, time: "19:00" }]);
  });
});

describe("invalidPostingSchedule", () => {
  it.each([
    [{ dailyCap: 0 }, /daily cap/],
    [{ dailyCap: 21 }, /daily cap/],
    [{ minGapMinutes: 20 }, /15-minute steps/],
    [{ minGapMinutes: 300 }, /gap/],
    [{ ageLimitDays: 0 }, /age limit/],
    [{ kinds: { debuts: { slots: [{ day: 7, time: "18:00" }], collision: "space" } } }, /day/],
    [{ kinds: { debuts: { slots: [{ day: 1, time: "25:00" }], collision: "space" } } }, /time/],
    [{ kinds: { debuts: { slots: [{ day: 1, time: "18:10" }], collision: "space" } } }, /15-minute/],
    [{ kinds: { nope: { slots: [], collision: "space" } } }, /Unknown card kind/],
  ] as const)("rejects %j", (patch, message) => {
    expect(invalidPostingSchedule(patch as never)).toMatch(message);
  });

  it("accepts a valid schedule", () => {
    expect(
      invalidPostingSchedule({
        enabled: true,
        dailyCap: 4,
        minGapMinutes: 45,
        ageLimitDays: 7,
        kinds: { debuts: { slots: [{ day: 3, time: "18:15" }], collision: "roll" } },
      }),
    ).toBeNull();
  });
});

describe("slotKindOf", () => {
  it("maps card kinds to slot kinds, with unknowns in other", () => {
    expect(slotKindOf("milestone")).toBe("milestones");
    expect(slotKindOf("debut")).toBe("debuts");
    expect(slotKindOf("weekendWrap")).toBe("roundResults");
    expect(slotKindOf("teamListRound")).toBe("teamLists");
    expect(slotKindOf("ladder")).toBe("roundUp");
    expect(slotKindOf("announcement")).toBe("other");
    expect(slotKindOf(undefined)).toBe("other");
  });
});

describe("clubDate", () => {
  it("reads the Perth date and weekday", () => {
    // Saturday 16:30 UTC is Sunday 00:30 in Perth.
    expect(clubDate(new Date("2026-10-17T16:30:00Z"))).toEqual({
      key: "2026-10-18",
      weekday: 0,
      minutes: 30,
    });
  });
});
