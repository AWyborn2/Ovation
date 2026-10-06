import { describe, expect, it } from "vitest";
import { seasonStartYearFor } from "./seasons";

/**
 * Australian cricket seasons run July–June and are named by their start year
 * (matches.season). Dates are read in Perth time (UTC+8, no daylight saving).
 */
describe("seasonStartYearFor", () => {
  it("starts a new season on 1 July", () => {
    expect(seasonStartYearFor(new Date("2026-07-01T12:00:00+08:00"))).toBe(2026);
  });

  it("keeps 30 June in the previous season", () => {
    expect(seasonStartYearFor(new Date("2026-06-30T12:00:00+08:00"))).toBe(2025);
  });

  it("puts January in the season that started the previous July", () => {
    expect(seasonStartYearFor(new Date("2026-01-15T12:00:00+08:00"))).toBe(2025);
  });

  it("reads the date in Perth time, not UTC", () => {
    // 2026-06-30T16:30Z: still 30 June in UTC, already 1 July in Perth.
    expect(seasonStartYearFor(new Date("2026-07-01T00:30:00+08:00"))).toBe(2026);
    // 2026-07-01T07:30Z is 15:30 on 1 July in Perth.
    expect(seasonStartYearFor(new Date("2026-07-01T07:30:00Z"))).toBe(2026);
    // 2026-06-30T15:59Z is 23:59 on 30 June in Perth.
    expect(seasonStartYearFor(new Date("2026-06-30T15:59:00Z"))).toBe(2025);
  });

  it("accepts an ISO string", () => {
    expect(seasonStartYearFor("2026-10-06T09:00:00+08:00")).toBe(2026);
  });

  it("throws on an invalid date rather than returning NaN", () => {
    expect(() => seasonStartYearFor("not a date")).toThrow();
  });
});
