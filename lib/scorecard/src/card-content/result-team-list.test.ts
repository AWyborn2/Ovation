/**
 * ADR-010 P7: result (results set, match summary) and team list content, the
 * single card's input it gives the sweep and Create a Card, and the carousel
 * slide input it gives the Weekend Carousel.
 */
import { describe, expect, it } from "vitest";
import type { MatchSummaryInput } from "../match-summary-types";
import { contentSlideInput, readQueuedCarousel } from "../queued-carousel";
import {
  CONTENT_FIELDS,
  contentInput,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
  readCardContent,
  resolveVisibleFields,
  resultContent,
  resultDayContent,
  resultDraftInput,
  resultSlideInput,
  teamListContent,
  teamListDraftInput,
  teamListSlideInput,
  type ContentTeamListPlayer,
  type TeamListSource,
} from "./index";

const names = {
  teams: { "mandurah cricket club": "Mandurah" },
  crests: { "mandurah cricket club": "https://crest/mandurah.png" },
  competitions: { "a grade": "A Grade One Day" },
};

const summary = (over: Partial<MatchSummaryInput> = {}): MatchSummaryInput => ({
  kind: "matchSummary",
  matchTitle: "A Grade • Round 5",
  roundLabel: "5",
  result: "Halls Head won by 24 runs",
  resultWinner: "club",
  club: {
    name: "Halls Head Cricket Club",
    primaryColor: "#000",
    secondaryColor: "#fff",
    textColor: "#fff",
    logoUrl: "https://crest/hh.png",
  },
  opposition: {
    name: "Mandurah Cricket Club",
    primaryColor: "#111",
    secondaryColor: "#eee",
    textColor: "#fff",
  },
  innings: [
    {
      teamKey: "club",
      inningsNum: 1,
      totalRuns: "180",
      wickets: "6",
      overs: "50",
      topBatters: [{ name: "J. Smith", runs: 72 }],
      topBowlers: [],
    },
    {
      teamKey: "opposition",
      inningsNum: 1,
      totalRuns: "156",
      wickets: "10",
      overs: "44.2",
      topBatters: [],
      topBowlers: [{ name: "K. Lee", wickets: 4, runs: 21, overs: "9" }],
    },
  ],
  ...over,
});

const standard = (kind: string) => presetFields(kind, "standard");
const minimal = (kind: string) => presetFields(kind, "minimal");

describe("the catalogue (P7)", () => {
  it("Standard and Full show every result and team list field; Minimal the core ones", () => {
    for (const kind of ["results", "matchSummary", "teamList"] as const) {
      const all = CONTENT_FIELDS[kind].map((f) => f.key);
      expect([...standard(kind)].sort()).toEqual([...all].sort());
      expect([...presetFields(kind, "full")].sort()).toEqual([...all].sort());
      expect([...minimal(kind)].sort()).toEqual(
        CONTENT_FIELDS[kind]
          .filter((f) => f.tier === "core")
          .map((f) => f.key)
          .sort(),
      );
    }
  });

  it("a match summary's top performers are core; the results set has none", () => {
    expect(minimal("matchSummary").has("result.performers")).toBe(true);
    expect(CONTENT_FIELDS.results.some((f) => f.key === "result.performers")).toBe(false);
  });
});

describe("resultContent", () => {
  it("resolves names, crests, the competition label and the round; keeps the source as it is", () => {
    const source = summary();
    const c = resultContent(source, {
      kind: "matchSummary",
      matchId: 41,
      grade: "A Grade",
      day: "2026-10-10",
      names,
    });
    expect(c).toMatchObject({
      kind: "matchSummary",
      page: "result",
      matchId: 41,
      junior: false,
      grade: "A Grade One Day",
      roundLabel: "ROUND 5",
      day: "2026-10-10",
      date: "SAT 10 OCT",
      opposition: {
        name: "Mandurah",
        rawName: "Mandurah Cricket Club",
        crestUrl: "https://crest/mandurah.png",
        monogram: expect.any(String),
      },
      club: { crestUrl: "https://crest/hh.png" },
      hasPerformers: true,
    });
    expect(c.source).toBe(source);
  });

  it("takes the round from the title when the source has no label, and the grade from it too", () => {
    const c = resultContent(summary({ roundLabel: undefined, matchTitle: "B Grade • R7" }), {
      kind: "results",
      matchId: 1,
    });
    expect(c.grade).toBe("B Grade");
    expect(c.roundLabel).toBe("ROUND 7");
    expect(c.day).toBeNull();
    expect(c.date).toBe("");
  });

  it("is junior for a junior source or a junior-looking grade (fail closed)", () => {
    expect(resultContent(summary({ junior: true }), { kind: "results", matchId: 1 }).junior).toBe(
      true,
    );
    expect(
      resultContent(summary(), { kind: "results", matchId: 1, grade: "Under 13 Blue" }).junior,
    ).toBe(true);
  });
});

describe("resultDraftInput (the single card)", () => {
  const c = resultContent(summary(), { kind: "matchSummary", matchId: 41, names });

  it("is the source's own input when every input field shows (existing drafts never change)", () => {
    expect(resultDraftInput(c)).toBe(c.source);
    expect(resultDraftInput(c, standard("matchSummary"))).toBe(c.source);
    expect(resultDraftInput(c, presetFields("matchSummary", "full"))).toBe(c.source);
  });

  it("hides the round and the crest when the club switches them off, with names final", () => {
    const input = resultDraftInput(c, minimal("matchSummary"));
    expect(input).toMatchObject({
      matchTitle: "A Grade",
      roundLabel: "",
      opposition: { name: "Mandurah", logoUrl: null },
      club: { logoUrl: "https://crest/hh.png" },
      namesResolved: true,
    });
    // The scorecard itself is untouched.
    expect(input.innings).toEqual(c.source.innings);
  });
});

describe("resultSlideInput (the carousel)", () => {
  it("the results set drops the top performers; a match summary keeps them in detail", () => {
    const results = resultContent(summary(), { kind: "results", matchId: 1, names });
    const r = resultSlideInput(results, standard("results"));
    expect(r.carouselDetail).toBe(false);
    expect((r.innings as MatchSummaryInput["innings"]).every((i) => !i.topBatters.length)).toBe(
      true,
    );
    // The full lists (the performance lists) go too.
    const full = summary();
    full.innings = full.innings.map((i) => ({
      ...i,
      batters: i.topBatters,
      bowlers: i.topBowlers,
    }));
    const set = resultSlideInput(
      resultContent(full, { kind: "results", matchId: 1, names }),
      standard("results"),
    );
    expect(
      (set.innings as MatchSummaryInput["innings"]).every((i) => !i.batters && !i.bowlers),
    ).toBe(true);
    const ms = resultSlideInput(
      resultContent(summary(), { kind: "matchSummary", matchId: 1, names }),
      standard("matchSummary"),
    );
    expect(ms.carouselDetail).toBe(true);
    expect(ms).toMatchObject({ grade: "A Grade One Day", junior: false, namesResolved: true });
  });

  it("an abandoned match summary with no performers posts as the result card", () => {
    const bare = summary({
      result: "Abandoned",
      resultWinner: "draw",
      innings: [],
    });
    const c = resultContent(bare, { kind: "matchSummary", matchId: 1 });
    expect(resultSlideInput(c, standard("matchSummary")).carouselDetail).toBe(false);
  });
});

describe("junior result day slides", () => {
  const junior = (day: string, opp = "Mandurah Cricket Club") =>
    resultContent(summary({ junior: true, opposition: { ...summary().opposition, name: opp } }), {
      kind: "results",
      matchId: 1,
      junior: true,
      grade: "Under 13",
      day,
      names,
    });

  it("holds junior results of one day only", () => {
    expect(() => resultDayContent([junior("2026-10-10"), junior("2026-10-11")])).toThrow();
    expect(() =>
      resultDayContent([
        junior("2026-10-10"),
        resultContent(summary(), { kind: "results", matchId: 2, day: "2026-10-10" }),
      ]),
    ).toThrow();
    expect(() =>
      resultDayContent([
        resultContent(summary({ junior: true }), { kind: "results", matchId: 2, day: null }),
      ]),
    ).toThrow();
  });

  it("prints a row per result with short names, and the crest only when shown", () => {
    const day = resultDayContent([junior("2026-10-10"), junior("2026-10-10", "Rockingham")]);
    const input = contentInput(day, standard("results"));
    expect(input).toMatchObject({
      kind: "matchSummary",
      junior: true,
      carouselDay: {
        heading: "SAT 10 OCT",
        results: [
          { grade: "Under 13", opposition: "Mandurah", crestUrl: "https://crest/mandurah.png" },
          { opposition: "Rockingham", crestUrl: null },
        ],
      },
    });
    expect("carouselDetail" in input).toBe(false);
    const hidden = contentInput(day, minimal("results")) as {
      carouselDay: { results: Array<{ crestUrl: string | null }> };
    };
    expect(hidden.carouselDay.results.every((r) => r.crestUrl === null)).toBe(true);
    expect(readCardContent(JSON.parse(JSON.stringify(day)))).toEqual(day);
  });
});

const players: ContentTeamListPlayer[] = Array.from({ length: 14 }, (_, i) => ({
  order: i + 1,
  surname: `PLAYER${i + 1}`,
  ...(i === 0 ? { firstInitial: "J", role: "C" } : {}),
  ...(i === 2 ? { debut: true } : {}),
  ...(i === 3 ? { overseas: true } : {}),
  ...(i < 5 ? { shirtNumber: String(10 + i) } : {}),
}));

const teamSource = (over: Partial<TeamListSource> = {}): TeamListSource => ({
  kind: "teamList",
  gradeRound: "A GRADE — ROUND 3",
  competitionLine: "A Grade",
  venueDateTime: "Halls Head Oval • SAT 10 OCT • 12:30 PM",
  players,
  grade: "A Grade",
  roundLabel: "ROUND 3",
  opponent: "Mandurah Cricket Club",
  homeAway: "HOME",
  venue: "Halls Head Oval",
  date: "SAT 10 OCT",
  startTime: "12:30 PM",
  numbering: "shirt",
  ...over,
});
const fixture = {
  id: 7,
  grade: "A Grade",
  roundLabel: "Round 3",
  opponentName: "Mandurah Cricket Club",
  opponentLogoUrl: null,
  venue: "Halls Head Oval",
  startAt: new Date("2026-10-10T04:30:00Z"),
};

describe("teamListContent", () => {
  it("resolves names and crest, keeps the source as it is", () => {
    const source = teamSource();
    const c = teamListContent(fixture, source, { names });
    expect(c).toMatchObject({
      kind: "teamList",
      page: "team",
      fixtureId: 7,
      junior: false,
      grade: "A Grade One Day",
      roundLabel: "ROUND 3",
      opposition: { name: "Mandurah", crestUrl: "https://crest/mandurah.png" },
      homeAway: "HOME",
      day: "2026-10-10",
    });
    expect(c.source).toBe(source);
  });

  it("the single card is the source's own input on Standard (existing drafts never change)", () => {
    const c = teamListContent(fixture, teamSource(), { names });
    expect(teamListDraftInput(c)).toBe(c.source);
    expect(teamListDraftInput(c, standard("teamList"))).toBe(c.source);
  });

  it("Minimal hides the round, crest, shirt numbers and debuts; keeps all 14 and the OS mark", () => {
    const c = teamListContent(fixture, teamSource(), { names });
    const input = teamListDraftInput(c, minimal("teamList"));
    const rows = input.players as ContentTeamListPlayer[];
    expect(rows).toHaveLength(14);
    expect(rows.some((p) => p.shirtNumber || p.debut)).toBe(false);
    expect(rows[3]!.overseas).toBe(true);
    expect(rows[0]).toMatchObject({ firstInitial: "J", role: "C" });
    expect(input).toMatchObject({
      gradeRound: "A GRADE ONE DAY",
      roundLabel: "",
      opponent: "Mandurah",
      namesResolved: true,
    });
    expect("numbering" in input).toBe(false);
    expect("opponentLogoUrl" in input).toBe(false);
  });

  it("the carousel slide carries the junior flag and the junior side's name", () => {
    const c = teamListContent(
      { ...fixture, grade: "Under 13", roundLabel: null },
      teamSource({ junior: true }),
      { junior: true, juniorTeamName: "Blue", gradeLabel: "Under 13 — Blue" },
    );
    expect(teamListSlideInput(c, standard("teamList"))).toMatchObject({
      junior: true,
      juniorTeamName: "Blue",
      grade: "Under 13 — Blue",
      gradeRound: "UNDER 13 — BLUE",
    });
  });

  it("reads back saved; a junior source is never senior content", () => {
    const c = teamListContent(fixture, teamSource(), { names });
    expect(readCardContent(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(readCardContent({ ...c, source: { ...c.source, junior: true } })).toBeNull();
    expect(readCardContent({ ...c, source: { ...c.source, players: [] } })).toBeNull();
  });
});

describe("saved carousels with P7 content slides", () => {
  const bookend = {
    heading: "Results",
    from: "2026-10-10",
    to: "2026-10-11",
    roundLabels: ["5"],
    fixtureCount: 1,
  };
  const md = [...presetFields("matchDay", "standard")];
  const slide = (id: string, content: unknown, junior = false, visible = md) => ({
    id,
    label: id,
    content,
    visibleFields: visible,
    photoId: null,
    data: {},
    junior,
    sponsorsOn: false,
    warnings: [],
  });
  const carousel = (setType: string, middle: unknown) => ({
    weekendCarousel: {
      version: 2,
      packId: "club-kit-v1",
      setType,
      submissionId: "12345678-1234-1234-1234-123456789abc",
      size: "square",
      slides: [
        slide("title", matchDayTitleContent(bookend)),
        middle,
        slide("sponsors", matchDaySponsorsContent({ ...bookend, sponsors: [] })),
      ],
    },
  });

  it("a results slide reads back with its derived input", () => {
    const c = resultContent(summary(), { kind: "results", matchId: 41, names });
    const read = readQueuedCarousel(
      carousel("results", slide("r-41", c, false, [...standard("results")])),
    );
    expect(read).not.toBeNull();
    expect(read!.slides[1]!.input).toMatchObject({
      kind: "matchSummary",
      carouselContent: true,
      carouselDetail: false,
    });
  });

  it("a team list slide reads back; a junior flag that disagrees with its content fails", () => {
    const c = teamListContent(fixture, teamSource(), { names });
    const ok = carousel("teamList", slide("t-7", c, false, [...standard("teamList")]));
    expect(readQueuedCarousel(ok)!.slides[1]!.input).toMatchObject({ kind: "teamList" });
    expect(
      readQueuedCarousel(carousel("teamList", slide("t-7", c, true, [...standard("teamList")]))),
    ).toBeNull();
  });

  it("a junior slide shows a photo only behind the club's stock image", () => {
    const c = resultContent(summary({ junior: true }), { kind: "results", matchId: 1 });
    const input = contentSlideInput({
      content: c,
      visibleFields: [...resolveVisibleFields("results")],
      photoId: 9,
      data: { photoUrl: "https://stock" },
      junior: true,
    });
    expect(input).toMatchObject({ juniorPhotoAllowed: true, juniorStockPhotoId: 9 });
  });
});
