import { describe, expect, it } from "vitest";
import {
  contentInput,
  dayHeading,
  dayResultRow,
  matchDayDayContent,
  matchDayFixtureContent,
  presetFields,
  readCardContent,
} from "./index";
import type { MatchSummaryInput } from "../match-summary-types";

const fixture = (
  id: number,
  opts: { junior?: boolean; startAt?: string; opponent?: string } = {},
) =>
  matchDayFixtureContent(
    {
      id,
      grade: opts.junior === false ? "A Grade" : "Under 13",
      roundLabel: "Round 4",
      opponentName: opts.opponent ?? "Mandurah Cricket Club",
      opponentLogoUrl: "https://crest.test/m.png",
      venue: "Rushton Park 2",
      startAt: new Date(opts.startAt ?? "2026-10-10T00:30:00Z"),
      isHome: id % 2 === 0,
    },
    opts.junior === false
      ? {}
      : { junior: true, juniorTeamName: "Blue", gradeLabel: `Under 13 — Blue ${id}` },
  );

describe("junior day content", () => {
  it("holds the junior fixtures of one day", () => {
    const day = matchDayDayContent([fixture(1), fixture(2)]);
    expect(day).toMatchObject({
      kind: "matchDay",
      page: "day",
      junior: true,
      day: "2026-10-10",
      date: "SAT 10 OCT",
    });
    expect(day.fixtures.map((f) => f.fixtureId)).toEqual([1, 2]);
  });

  it("refuses a senior fixture (juniors isolation fails closed)", () => {
    expect(() => matchDayDayContent([fixture(1), fixture(2, { junior: false })])).toThrow(/junior/);
  });

  it("refuses fixtures of different days", () => {
    expect(() =>
      matchDayDayContent([fixture(1), fixture(2, { startAt: "2026-10-11T00:30:00Z" })]),
    ).toThrow(/one day/);
  });

  it("uses the club's time zone for the day (a 9 pm UTC Friday game is Saturday in Perth)", () => {
    const day = matchDayDayContent([
      fixture(1, { startAt: "2026-10-09T23:30:00Z" }),
      fixture(2, { startAt: "2026-10-10T01:00:00Z" }),
    ]);
    expect(day.day).toBe("2026-10-10");
    expect(dayHeading(day.day)).toBe("SAT 10 OCT");
  });

  it("reads back from a saved carousel, and rejects a senior or other-day fixture inside it", () => {
    const day = matchDayDayContent([fixture(1), fixture(2)]);
    expect(readCardContent(JSON.parse(JSON.stringify(day)))).toEqual(day);
    expect(
      readCardContent({ ...day, fixtures: [fixture(1), fixture(2, { junior: false })] }),
    ).toBeNull();
    expect(
      readCardContent({
        ...day,
        fixtures: [fixture(1), fixture(2, { startAt: "2026-10-11T00:30:00Z" })],
      }),
    ).toBeNull();
    expect(readCardContent({ ...day, junior: false })).toBeNull();
    expect(readCardContent({ ...day, fixtures: [] })).toBeNull();
  });

  it("binds compact rows, with hidden fields blanked", () => {
    const day = matchDayDayContent([fixture(1), fixture(2)]);
    const standard = contentInput(day, presetFields("matchDay", "standard")) as {
      junior: boolean;
      carouselDay: { heading: string; fixtures: Record<string, unknown>[] };
    };
    expect(standard.junior).toBe(true);
    expect(standard.carouselDay.heading).toBe("SAT 10 OCT");
    expect(standard.carouselDay.fixtures[0]).toEqual({
      grade: "Under 13 — Blue 1",
      opposition: "Mandurah",
      crestUrl: "https://crest.test/m.png",
      monogram: "MA",
      homeAway: "AWAY",
      venue: "Rushton Park 2",
      startTime: "8:30 AM",
      roundLabel: "ROUND 4",
    });
    const minimal = contentInput(day, presetFields("matchDay", "minimal")) as typeof standard;
    expect(minimal.carouselDay.fixtures[0]).toMatchObject({ crestUrl: null, roundLabel: "" });
  });
});

describe("junior result rows", () => {
  const result = (over: Partial<MatchSummaryInput> = {}): MatchSummaryInput => ({
    kind: "matchSummary",
    matchTitle: "Under 13 • Round 4",
    result: "Halls Head won by 22 runs",
    resultWinner: "club",
    club: { name: "Halls Head", primaryColor: "", secondaryColor: "", textColor: "" },
    opposition: {
      name: "Mandurah Cricket Club",
      primaryColor: "",
      secondaryColor: "",
      textColor: "",
      logoUrl: null,
    },
    innings: [
      {
        teamKey: "club",
        inningsNum: 1,
        totalRuns: "120",
        wickets: "4",
        overs: "20",
        topBatters: [],
        topBowlers: [],
      },
      {
        teamKey: "opposition",
        inningsNum: 1,
        totalRuns: "98",
        wickets: "9",
        overs: "20",
        topBatters: [],
        topBowlers: [],
      },
    ],
    junior: true,
    ...over,
  });

  it("is display-ready: both scores, the result word and line", () => {
    expect(dayResultRow({ ...result(), grade: "Under 13" })).toEqual({
      grade: "Under 13",
      opposition: "Mandurah Cricket Club",
      crestUrl: null,
      clubScore: "4/120",
      oppositionScore: "9/98",
      resultWord: "WIN",
      result: "Halls Head won by 22 runs",
      winner: "club",
    });
  });

  it("marks a washed-out game and a missing score honestly", () => {
    const row = dayResultRow(
      result({ result: "Match abandoned", resultWinner: "draw", innings: [] }),
    );
    expect(row).toMatchObject({ resultWord: "ABANDONED", clubScore: "—", oppositionScore: "—" });
    expect(row.grade).toBe("Under 13");
  });

  it("refuses a senior result", () => {
    expect(() => dayResultRow(result({ junior: false }))).toThrow(/junior/);
  });
});
