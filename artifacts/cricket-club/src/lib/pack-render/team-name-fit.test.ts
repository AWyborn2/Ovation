import { describe, expect, it } from "vitest";
import { splitTeamName, teamNameSize, TEAM_NAME_MIN_RATIO } from "./team-name-fit";

const measure = (s: string) =>
  Array.from(s).reduce((w, c) => w + (c === "W" ? 12 : c === "i" ? 3 : 6), 0);

describe("Team Selection measured names", () => {
  it("distinguishes narrow and wide glyphs and leaves short lineups unchanged", () => {
    expect(teamNameSize([{ text: "iiiiiiiiiiii", width: 70 }], 24, measure)).toBe(24);
    expect(teamNameSize([{ text: "WWWWWWWWWWWW", width: 70 }], 24, measure)).toBe(
      24 * TEAM_NAME_MIN_RATIO,
    );
    expect(
      teamNameSize(
        [
          { text: "Smith", width: 80 },
          { text: "Jones", width: 80 },
        ],
        24,
        measure,
      ),
    ).toBe(24);
  });
  it("uses the tightest number/badge-adjusted width across the entire list", () => {
    expect(
      teamNameSize(
        [
          { text: "AAAAAA", width: 35 },
          { text: "AAAAAA", width: 30 },
        ],
        24,
        measure,
      ),
    ).toBe(20);
  });
  it("lets skeleton packs use their 1.8cqmin floor without changing Club Kit's existing minimum", () => {
    const rows = [{ text: "W".repeat(16), width: 40 }];
    expect(teamNameSize(rows, 32, measure, 1.8 / 3.2)).toBe(18);
    expect(teamNameSize(rows, 23, measure)).toBe(18);
  });
  it.each([
    "Venkatanarasimharaju",
    "Smith-Worthington",
    "van der Westhuizen",
    "O’Shaughnessy",
    "D'Angelo",
    "García Márquez",
    "WWWMMMMWWWW",
    "Jose\u0301-Álvarez",
  ])("preserves every character in %s, without clipping either line", (text) => {
    const lines = splitTeamName(text, measure(text) * 0.7, measure)!;
    expect(lines).toHaveLength(2);
    expect(lines.join("")).toBe(text);
    expect(lines.every((line) => measure(line) <= measure(text) * 0.7)).toBe(true);
  });
  it("prefers a space or hyphen when a balanced grapheme split also fits", () => {
    expect(splitTeamName("Smith-Jones", 50, measure)).toEqual(["Smith-", "Jones"]);
    expect(splitTeamName("van der West", 50, measure)).toEqual(["van der ", "West"]);
  });
  it("fails explicitly rather than discarding characters beyond two lines", () => {
    expect(splitTeamName("W".repeat(100), 20, measure)).toBeNull();
  });
});
