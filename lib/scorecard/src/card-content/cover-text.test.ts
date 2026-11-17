/**
 * Ash's New Studio checks (17 Nov 2026): a carousel's dates read right past
 * or to come, and a team list's grade line never says the grade twice.
 */
import { describe, expect, it } from "vitest";
import {
  dateRangeLabel,
  distinctCompetitionLine,
  matchDayTitleContent,
  readableDateRange,
  shortDateRange,
  shortDateSpanFromLabel,
  teamListContent,
  teamListSlideInput,
} from "./index";
import { slideInputFor } from "../kind-templates/set-slides";

describe("shortDateRange", () => {
  it("writes a range as the app does, with no tense", () => {
    expect(shortDateRange("2026-11-13", "2026-11-22")).toBe("13–22 Nov");
    expect(shortDateRange("2026-11-28", "2026-12-02")).toBe("28 Nov – 2 Dec");
    expect(shortDateRange("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 – 3 Jan 2027");
    expect(shortDateRange("2026-11-14", "2026-11-14")).toBe("14 Nov");
  });

  it("puts a range given backwards the right way round", () => {
    expect(shortDateRange("2026-11-22", "2026-11-13")).toBe("13–22 Nov");
  });

  it("leaves a range it can't read as it was given", () => {
    expect(shortDateRange("soon", "later")).toBe("soon – later");
  });
});

describe("readableDateRange", () => {
  it("rewrites a set named from its raw range", () => {
    expect(readableDateRange("2026-11-13 – 2026-11-22")).toBe("13–22 Nov");
  });

  it("leaves any other name alone", () => {
    expect(readableDateRange("ROUND 7")).toBe("ROUND 7");
    expect(readableDateRange("13–22 Nov")).toBe("13–22 Nov");
  });
});

describe("shortDateSpanFromLabel", () => {
  it("shortens a cover's printed dates", () => {
    expect(shortDateSpanFromLabel(dateRangeLabel("2026-11-13", "2026-11-22"))).toBe("13–22 Nov");
    expect(shortDateSpanFromLabel("SAT 31 OCT – SUN 15 NOV")).toBe("31 Oct – 15 Nov");
    expect(shortDateSpanFromLabel("SAT 8 NOV")).toBe("8 Nov");
  });

  it("finds the first day's month from the last when it is left out", () => {
    expect(shortDateSpanFromLabel("SAT 13 – SUN 14 DEC")).toBe("13–14 Dec");
    expect(shortDateSpanFromLabel("SAT 31 – SUN 1 JAN")).toBe("31 Dec – 1 Jan");
  });

  it("is empty for text without a date, so the chip drops", () => {
    expect(shortDateSpanFromLabel("")).toBe("");
    expect(shortDateSpanFromLabel(undefined)).toBe("");
    expect(shortDateSpanFromLabel("THIS WEEKEND")).toBe("");
  });
});

describe("carousel cover title", () => {
  it("defaults to a title that fits a round already played", () => {
    const title = matchDayTitleContent({
      heading: "  ",
      from: "2026-11-13",
      to: "2026-11-22",
      roundLabels: ["7"],
      fixtureCount: 3,
    });
    expect(title.heading).toBe("Match day");
  });

  it("titles a round fixtures list's cover without 'this weekend'", () => {
    const cover = slideInputFor(
      { kind: "matchDay", page: "title", slot: "cover" },
      { kind: "roundFixtures", date: "SAT 14 NOV", fixtures: [] },
    ) as { carouselPage: { title: string } };
    expect(cover.carouselPage.title).toBe("Fixtures");
  });
});

describe("distinctCompetitionLine", () => {
  it("drops a competition line that only says the grade again", () => {
    expect(distinctCompetitionLine("B GRADE — ROUND 7", "B Grade")).toBe("");
    expect(distinctCompetitionLine("UNDER 13 — BLUE — ROUND 2", "Under 13 — Blue")).toBe("");
  });

  it("keeps one that adds something", () => {
    expect(distinctCompetitionLine("B GRADE — ROUND 7", "One Day")).toBe("One Day");
    expect(distinctCompetitionLine("A GRADE · RD 3", "First Grade • One Day")).toBe(
      "First Grade • One Day",
    );
  });

  it("matches whole words only", () => {
    expect(distinctCompetitionLine("A GRADE — ROUND 7", "A")).toBe("");
    expect(distinctCompetitionLine("B GRADE — ROUND 7", "B GRADE WOMEN")).toBe("B GRADE WOMEN");
  });

  it("is empty when there's no line", () => {
    expect(distinctCompetitionLine("B GRADE — ROUND 7", "  ")).toBe("");
  });

  it("finds the repeat in a built team list slide", () => {
    const content = teamListContent(
      {
        id: 1,
        grade: "B Grade",
        roundLabel: "7",
        opponentName: "Pinjarra",
        venue: "Halls Head Oval",
        startAt: new Date("2026-11-14T02:00:00Z"),
      },
      {
        kind: "teamList",
        gradeRound: "B GRADE — ROUND 7",
        competitionLine: "B Grade",
        venueDateTime: "",
        players: [],
      } as never,
    );
    const slide = teamListSlideInput(content, new Set(["team.round"])) as {
      gradeRound: string;
      competitionLine: string;
    };
    expect(slide.gradeRound).toBe("B GRADE — ROUND 7");
    expect(distinctCompetitionLine(slide.gradeRound, slide.competitionLine)).toBe("");
  });
});
