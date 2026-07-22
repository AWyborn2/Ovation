import { describe, it, expect } from "vitest";
import { parseMatchDate, partitionMatchDates } from "./match-date";

/**
 * Pure unit test — no database, so this runs locally as well as in CI.
 */

describe("parseMatchDate", () => {
  it("reads ISO dates, with or without zero padding", () => {
    expect(parseMatchDate("2024-01-12")).toBe("2024-01-12");
    expect(parseMatchDate("2024-1-2")).toBe("2024-01-02");
    expect(parseMatchDate("2024-01-12T09:30:00Z")).toBe("2024-01-12");
  });

  it("reads named months, long or abbreviated, and strips stray quotes", () => {
    expect(parseMatchDate("12 Jan 2024")).toBe("2024-01-12");
    expect(parseMatchDate("12 January 2024")).toBe("2024-01-12");
    expect(parseMatchDate('"5 Feb 2023"')).toBe("2023-02-05");
    expect(parseMatchDate("Sat 12 Jan 2024")).toBe("2024-01-12");
  });

  it("reads day-first numeric dates, which the old parser silently dropped", () => {
    // The regression this fixes: an Australian competition's most common
    // written format returned null, so the row vanished from the board.
    expect(parseMatchDate("12/01/2024")).toBe("2024-01-12");
    expect(parseMatchDate("12-01-2024")).toBe("2024-01-12");
    expect(parseMatchDate("2.1.2024")).toBe("2024-01-02");
    expect(parseMatchDate("12/01/24")).toBe("2024-01-12");
    expect(parseMatchDate("12/01/98")).toBe("1998-01-12");
  });

  it("treats ambiguous numeric dates as day-first, not month-first", () => {
    // 03/04 is 3 April here, never 4 March.
    expect(parseMatchDate("03/04/2024")).toBe("2024-04-03");
  });

  it("returns null for blank, absent and unreadable values", () => {
    expect(parseMatchDate(null)).toBeNull();
    expect(parseMatchDate(undefined)).toBeNull();
    expect(parseMatchDate("")).toBeNull();
    expect(parseMatchDate("   ")).toBeNull();
    expect(parseMatchDate("TBC")).toBeNull();
    expect(parseMatchDate("Round 4")).toBeNull();
  });

  it("rejects well-formed but impossible dates instead of emitting them", () => {
    // The old parser produced "2024-02-31" happily, which then sorted as a real
    // date and could win the latest-date race that sets the recency window.
    expect(parseMatchDate("31 Feb 2024")).toBeNull();
    expect(parseMatchDate("2023-02-29")).toBeNull();
    expect(parseMatchDate("32/01/2024")).toBeNull();
    expect(parseMatchDate("12/13/2024")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(parseMatchDate("2024-02-29")).toBe("2024-02-29");
    expect(parseMatchDate("29 Feb 2024")).toBe("2024-02-29");
  });
});

describe("partitionMatchDates", () => {
  it("separates readable dates from values that need a data-quality warning", () => {
    const { parsed, unparsed } = partitionMatchDates([
      "2024-01-12",
      "12 Jan 2024",
      "TBC",
      "Round 4",
    ]);
    expect(parsed).toEqual(["2024-01-12", "2024-01-12"]);
    expect(unparsed).toEqual(["TBC", "Round 4"]);
  });

  it("does not report blank dates as unparseable", () => {
    // A match with no date recorded is ordinary missing data; only a non-empty
    // value the parser cannot read indicates a format the importer missed.
    const { parsed, unparsed } = partitionMatchDates([null, "", "  ", '""']);
    expect(parsed).toEqual([]);
    expect(unparsed).toEqual([]);
  });
});
