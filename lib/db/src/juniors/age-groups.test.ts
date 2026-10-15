import { describe, expect, it } from "vitest";

import { juniorAgeBand, normaliseJuniorAge } from "./age-groups";

// Expected values follow pg_temp.jr_norm_age / pg_temp.jr_band in scripts/sql/juniors-etl.sql
// exactly (lower-cased input, first matching rule wins).
describe("normaliseJuniorAge (jr_norm_age)", () => {
  it.each([
    ["Under 14", "U14"],
    ["under14", "U14"],
    ["Under 09", "U9"],
    ["U14", "U14"],
    ["u 15 Boys", "U15"],
    ["U13 Boys", "U13"],
    ["Ted Hussey Shield (Male Under 17s)", "U17"],
    ["Tony Mann Shield (Premier U15)", "U15"],
    ["Year 9 Boys Peel", "Year 9"],
    ["Year 4 South", "Year 4"],
    ["year7 gold", "Year 7"],
    ["Year 10-11 Boys South West", "Year 10-11"],
    ["Year 10 - 11", "Year 10"],
    ["Peel Girls League", "Girls League"],
    ["GIRL LEAGUE", "Girls League"],
    // Girls League wins over an age in the same label (first rule).
    ["Girls League Under 13", "Girls League"],
    // "under" beats "u", which beats "year".
    ["Year 9 Under 15", "U15"],
    ["Year 9 U15", "U15"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseJuniorAge(raw)).toBe(expected);
  });

  it.each([
    ["A Grade"],
    ["Men's Colts League"],
    ["Female B Grade"],
    ["Mixed Social Twilight"],
    [""],
    [null],
    [undefined],
    // "u" must start a word (Postgres \m): "Club 14" has no word-initial u.
    ["Club 14"],
  ])("%s → null", (raw) => {
    expect(normaliseJuniorAge(raw)).toBeNull();
  });
});

describe("juniorAgeBand (jr_band)", () => {
  it.each([
    ["U10", "Year 4"],
    ["Under 11", "Year 5"],
    ["U12 Mixed", "Year 6"],
    ["U13 Boys", "Year 7"],
    ["Under 14 Girls", "Year 8"],
    ["U15", "Year 9"],
    ["U16", "Year 10-11"],
    ["Under 17", "Year 10-11"],
    // Passes through what it doesn't band.
    ["U9", "U9"],
    ["U18", "U18"],
    ["Year 7 Gold", "Year 7"],
    ["Year 10-11", "Year 10-11"],
    ["Peel Girls League", "Girls League"],
  ])("%s → %s", (raw, expected) => {
    expect(juniorAgeBand(raw)).toBe(expected);
  });

  it("is null when the label carries no age group", () => {
    expect(juniorAgeBand("A Grade")).toBeNull();
    expect(juniorAgeBand(null)).toBeNull();
  });
});
