import { describe, expect, it } from "vitest";
import {
  addDays,
  clubDay,
  clubInstant,
  clubParts,
  gridHours,
  minutesAtY,
  mondayOf,
  snapMinutes,
  weekDays,
} from "./calendar-time";

describe("calendar-time", () => {
  it("turns a Sunday 6:45pm drop into 10:45 UTC", () => {
    expect(clubInstant("2026-10-18", 18 * 60 + 45).toISOString()).toBe("2026-10-18T10:45:00.000Z");
  });

  it("buckets 00:30 Perth into its own club day, not the UTC date", () => {
    const at = new Date("2026-10-17T16:30:00Z"); // Sunday 00:30 in Perth
    expect(clubDay(at)).toBe("2026-10-18");
    expect(clubParts(at).minutes).toBe(30);
  });

  it("snaps to the nearest 15 minutes and stays inside the day", () => {
    expect(snapMinutes(18 * 60 + 52)).toBe(18 * 60 + 45);
    expect(snapMinutes(18 * 60 + 53)).toBe(19 * 60);
    expect(snapMinutes(-20)).toBe(0);
    expect(snapMinutes(24 * 60 + 30)).toBe(23 * 60 + 45);
  });

  it("weeks run Monday to Sunday", () => {
    expect(mondayOf("2026-10-18")).toBe("2026-10-12"); // a Sunday
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(weekDays("2026-10-12")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("widens the grid to show a card outside 6am to 10pm", () => {
    expect(gridHours([])).toEqual({ startMinutes: 360, endMinutes: 1320 });
    expect(gridHours([new Date("2026-10-17T16:30:00Z")])).toEqual({
      startMinutes: 0,
      endMinutes: 1320,
    });
    expect(gridHours([new Date("2026-10-18T15:10:00Z")])).toEqual({
      startMinutes: 360,
      endMinutes: 1440,
    });
  });

  it("reads the time under the pointer in a day column", () => {
    // 1px per minute from 6am: 765px down is 6am + 12h45 = 6:45pm.
    expect(minutesAtY(1765, 1000, 1, 360)).toBe(18 * 60 + 45);
  });
});
