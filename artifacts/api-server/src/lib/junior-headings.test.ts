/**
 * Round 3 retest (Ash, junior Team List headings): junior headings built like
 * the senior ones. The big heading is the grade ("YEAR 9"), with the team's
 * own suffix only when the club has two teams in it that round ("YEAR 9 GOLD");
 * the small line is the competition. Never the club's name.
 */
import { describe, expect, it } from "vitest";
import { clubNameVariants, juniorHeading, juniorTeamSuffix } from "./junior-headings";
import { juniorTeamListToCardInput } from "./engines/junior-team-list";

const club = clubNameVariants("Halls Head Cricket Club", "Halls Head");
const fixture = (teamName: string) => ({
  ageGroup: "Year 9",
  grade: "Year 9 Boys South West",
  teamName,
});

describe("junior headings", () => {
  it("one team in the grade: the grade alone, the competition as the small line", () => {
    expect(
      juniorHeading(fixture("Halls Head Year 9"), { clubNames: club, teamsInGrade: 1 }),
    ).toEqual({
      heading: "Year 9",
      eyebrow: "YEAR 9 BOYS SOUTH WEST",
    });
  });

  it("two teams in the grade that round: the team's own suffix, without the club", () => {
    const gold = juniorHeading(fixture("Halls Head Year 9 Gold"), {
      clubNames: club,
      teamsInGrade: 2,
    });
    const black = juniorHeading(fixture("Halls Head Cricket Club Year 9 Black"), {
      clubNames: club,
      teamsInGrade: 2,
    });
    expect(gold.heading).toBe("Year 9 Gold");
    expect(black.heading).toBe("Year 9 Black");
    for (const h of [gold, black]) {
      expect(`${h.heading} ${h.eyebrow}`.toUpperCase()).not.toContain("HALLS HEAD");
    }
  });

  it("a single team never shows a suffix, even when its name has one", () => {
    expect(
      juniorHeading(fixture("Halls Head Year 9 Gold"), { clubNames: club, teamsInGrade: 1 })
        .heading,
    ).toBe("Year 9");
  });

  it("adds the round to the small line when it is known, and never repeats the grade or club", () => {
    const h = juniorHeading(fixture("Halls Head Year 9"), { clubNames: club, round: "Round 5" });
    expect(h.eyebrow).toBe("YEAR 9 BOYS SOUTH WEST — ROUND 5");
  });

  it("takes the club's name out in its full, short and plain forms", () => {
    expect(
      juniorTeamSuffix("Halls Head CC Year 9 Gold", "Year 9", clubNameVariants("Halls Head CC")),
    ).toBe("Gold");
    expect(juniorTeamSuffix("Halls Head Year 9", "Year 9", club)).toBe("");
  });

  it("the junior card input prints the heading and the competition, never the team name", () => {
    const input = juniorTeamListToCardInput(
      {
        id: 1,
        tenantId: 1,
        playhqMatchId: "m",
        seasonStartYear: 2026,
        ageGroup: "Year 9",
        grade: "Year 9 Boys South West",
        teamName: "Halls Head Year 9",
        opponentName: "Kardinya Junior Cricket Club",
        venue: "Peelwood Reserve",
        startAt: new Date("2026-11-14T00:00:00Z"),
        isHome: true,
        status: "UPCOMING",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [],
      () => null,
    );
    expect(input.gradeHeading).toBe("Year 9");
    expect(input.gradeRound).toBe("YEAR 9 BOYS SOUTH WEST");
    expect(input.grade).toBe("Year 9 Boys South West");
  });
});
