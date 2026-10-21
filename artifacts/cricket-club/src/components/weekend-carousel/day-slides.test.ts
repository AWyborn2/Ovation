/**
 * Junior same-day slides in the Weekend Carousel (ADR-010 P3): with the
 * club's switch on, the junior games of one day share a slide (Match Day,
 * Results, Match Summaries); seniors keep a slide each and never join one.
 */
import { describe, expect, it } from "vitest";
import type { Fixture, SocialSettingsBundle } from "@workspace/api-client-react";
import { matchDayFixtureContent } from "@workspace/scorecard/card-content";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { renderPackCard, resolveCardTokens } from "@/lib/pack-render";
import { sourcesFor } from "@/test/carousel-sources";
import {
  buildWeekendSlides,
  createTeamSlides,
  queuedSlide,
  slideForFixture,
  type SlideGrouping,
  type WeekendSlide,
} from "./model";

const fixture = (id: number, grade: string, startAt = "2026-10-10T01:00:00Z"): Fixture => ({
  id,
  grade,
  opponentName: `Visitors ${id} Cricket Club`,
  opponentLogoUrl: `https://crest.test/${id}.png`,
  venue: `Oval ${id}`,
  isHome: id % 2 === 0,
  startAt,
  roundLabel: "Round 4",
  source: "manual",
  createdAt: "2026-01-01T00:00:00Z",
});

/** The sources route's Match Day content: junior fixtures come from junior sources. */
function md(fixtures: Fixture[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    fixtures.map((f) => {
      const junior = /^U\d+/.test(f.grade);
      return [
        f.id,
        matchDayFixtureContent(
          {
            ...f,
            roundLabel: f.roundLabel ?? null,
            opponentLogoUrl: f.opponentLogoUrl ?? null,
            venue: f.venue ?? null,
            startAt: new Date(f.startAt),
          },
          junior ? { junior: true, juniorTeamName: "Blue", gradeLabel: `${f.grade} — Blue` } : {},
        ) as unknown as Record<string, unknown>,
      ];
    }),
  );
}

const bundle = {
  settings: { sponsorsEnabled: false, clubHashtag: "#OURCLUB" },
  brand: { name: "Our Cricket Club", primaryColour: "#009900", backgroundColour: "#001122" },
  activeSponsors: [],
} as unknown as SocialSettingsBundle;

const on = (setType: SlideGrouping["setType"] = "matchDay", capacity = 4): SlideGrouping => ({
  setType,
  consolidateByDay: true,
  capacity,
});

function build(fixtures: Fixture[], grouping?: SlideGrouping, content = md(fixtures)) {
  return buildWeekendSlides(
    createTeamSlides(fixtures, [], content),
    [],
    bundle,
    "This weekend",
    "2026-10-09",
    "2026-10-11",
    "Australia/Perth",
    undefined,
    undefined,
    null,
    grouping,
  );
}

const SAT = "2026-10-10T01:00:00Z";
const SUN = "2026-10-11T01:00:00Z";
const weekend = [
  fixture(1, "A Grade", SAT),
  fixture(2, "U13", SAT),
  fixture(3, "B Grade", SAT),
  fixture(4, "U15", SAT),
  fixture(5, "U11", SAT),
  fixture(6, "U17", SUN),
];

function render(slide: WeekendSlide, packId: string) {
  return renderPackCard(
    slide.input,
    "square",
    slide.sponsorsOn,
    resolveCardTokens({ junior: slide.junior, data: slide.data, packId }),
    slide.junior,
    slide.data,
    packId,
  );
}

describe("Match Day: junior same-day slides", () => {
  it("puts Saturday's junior games on one slide; seniors and Sunday's lone game keep their own", () => {
    const slides = build(weekend, on());
    expect(slides.map((s) => s.id)).toEqual([
      "title",
      "fixture-1",
      "day-2026-10-10-2",
      "fixture-3",
      "fixture-6",
      "sponsors",
    ]);
    const day = slides[2];
    expect(day).toMatchObject({ junior: true, sponsorsOn: false, fixtureIds: [2, 4, 5] });
    expect(day.content).toMatchObject({ page: "day", junior: true, day: "2026-10-10" });
    expect(day.data.photoUrl).toBeFalsy();
    const rows = (day.input as { carouselDay?: { fixtures: unknown[] } }).carouselDay!.fixtures;
    expect(rows).toHaveLength(3);
    // The title still counts every fixture.
    expect(slides[0].content).toMatchObject({ fixtureCount: 6 });
    expect(slideForFixture(slides, 4)?.id).toBe(day.id);
    expect(slideForFixture(slides, 1)?.id).toBe("fixture-1");
  });

  it("never puts a senior fixture on a junior day slide", () => {
    for (const s of build(weekend, on())) {
      if (s.content?.kind !== "matchDay" || s.content.page !== "day") continue;
      expect(s.content.fixtures.every((f) => f.junior)).toBe(true);
      expect(s.fixtureIds).not.toContain(1);
      expect(s.fixtureIds).not.toContain(3);
    }
  });

  it("splits a day at the layout's capacity", () => {
    const juniors = Array.from({ length: 7 }, (_, i) => fixture(10 + i, `U${11 + i}`, SAT));
    const slides = build(juniors, on("matchDay", 4));
    expect(slides.slice(1, -1).map((s) => s.fixtureIds)).toEqual([
      [10, 11, 12, 13],
      [14, 15, 16],
    ]);
  });

  it("one slide per fixture with the switch off, or no grouping (as before P3)", () => {
    const ids = ["title", ...weekend.map((f) => `fixture-${f.id}`), "sponsors"];
    expect(build(weekend, { ...on(), consolidateByDay: false }).map((s) => s.id)).toEqual(ids);
    expect(build(weekend).map((s) => s.id)).toEqual(ids);
  });

  it("warns on the title slide past Meta's ten slides", () => {
    const seniors = Array.from({ length: 9 }, (_, i) => fixture(30 + i, "A Grade"));
    const slides = build(seniors, on());
    expect(slides).toHaveLength(11);
    expect(slides[0].warnings.join(" ")).toMatch(/11 slides.*at most 10/);
    expect(build(seniors.slice(0, 8), on())[0].warnings).toEqual([]);
  });

  it("saves as a version 2 slide that reads back and renders in both packs", () => {
    const slides = build(weekend, on());
    const saved = readQueuedCarousel({
      weekendCarousel: {
        version: 2,
        packId: "club-kit-v1",
        setType: "matchDay",
        submissionId: "12345678-1234-1234-1234-123456789abc",
        size: "square",
        slides: JSON.parse(JSON.stringify(slides.map(queuedSlide))),
      },
    });
    expect(saved).not.toBeNull();
    const day = saved!.slides[2];
    expect(day).not.toHaveProperty("fixtureIds");
    expect(day.input).toEqual(slides[2].input);
    for (const packId of ["club-kit-v1", "broadcast-dark-v1"]) {
      const html = render(slides[2], packId);
      expect(html, packId).not.toContain("{{");
      expect(html.match(/data-day-row="/g), packId).toHaveLength(3);
      for (const name of ["VISITORS 2", "VISITORS 4", "VISITORS 5"])
        expect(html.toUpperCase(), packId).toContain(name);
      expect(html, packId).toContain("SAT 10 OCT");
    }
  });
});

describe("Results and Match Summaries: junior same-day slides", () => {
  const summary = (f: Fixture, junior: boolean, detail: boolean) => ({
    kind: "matchSummary",
    matchTitle: `${f.grade} • Round 4`,
    roundLabel: "Round 4",
    result: junior ? "Our Club won by 12 runs" : "Visitors won by 3 wickets",
    resultWinner: junior ? "club" : "opposition",
    club: { name: "Our Club", primaryColor: "", secondaryColor: "", textColor: "" },
    opposition: {
      name: f.opponentName,
      primaryColor: "",
      secondaryColor: "",
      textColor: "",
      logoUrl: null,
    },
    innings: [
      {
        teamKey: "club",
        inningsNum: 1,
        totalRuns: "101",
        wickets: "6",
        overs: "20",
        topBatters: [{ name: "A. Batter", runs: 40 }],
        topBowlers: [],
      },
      {
        teamKey: "opposition",
        inningsNum: 1,
        totalRuns: "89",
        wickets: "10",
        overs: "18.2",
        topBatters: [],
        topBowlers: [],
      },
    ],
    grade: f.grade,
    junior,
    carouselDetail: detail,
  });

  it.each(["results", "matchSummary"] as const)(
    "%s: puts a day's junior results on one multi-result slide",
    (setType) => {
      const games = [fixture(-1, "A Grade", SAT), fixture(-2, "U13", SAT), fixture(-3, "U15", SAT)];
      // Each result from the server's result content builder (ADR-010 P7).
      const content = sourcesFor(setType, games, (f) =>
        summary(f as Fixture, f.grade !== "A Grade", setType === "matchSummary"),
      );
      const slides = build(games, on(setType), content);
      expect(slides.map((s) => s.id)).toEqual([
        "title",
        "fixture--1",
        "day-2026-10-10--2",
        "sponsors",
      ]);
      const day = slides[2];
      expect(day.junior).toBe(true);
      const input = day.input as Extract<WeekendSlide["input"], { kind: "matchSummary" }>;
      expect(input.kind).toBe("matchSummary");
      expect(input.junior).toBe(true);
      expect(input.carouselDetail).toBeUndefined();
      expect(input.carouselDay!.results.map((r) => [r.grade, r.clubScore, r.resultWord])).toEqual([
        ["U13", "6/101", "WIN"],
        ["U15", "6/101", "WIN"],
      ]);
      // The senior result keeps its own card.
      expect(slides[1].junior).toBe(false);
      const saved = readQueuedCarousel({
        weekendCarousel: {
          version: 2,
          packId: "broadcast-dark-v1",
          setType,
          submissionId: "12345678-1234-1234-1234-123456789abc",
          size: "square",
          slides: JSON.parse(JSON.stringify(slides.map(queuedSlide))),
        },
      });
      expect(saved).not.toBeNull();
      for (const packId of ["club-kit-v1", "broadcast-dark-v1"]) {
        const html = render(day, packId);
        expect(html, packId).not.toContain("{{");
        expect(html.match(/data-day-row="/g), packId).toHaveLength(2);
        expect(html, packId).toContain("6/101");
        expect(html, packId).toContain("JUNIOR RESULTS");
      }
    },
  );

  it("a senior-sourced result with a junior-looking grade is never put on a day slide", () => {
    const games = [fixture(-2, "U13", SAT), fixture(-3, "U15", SAT)];
    const content = sourcesFor("results", games, (f) => summary(f as Fixture, false, false));
    const slides = build(games, on("results"), content);
    expect(slides.map((s) => s.id)).toEqual(["title", "fixture--2", "fixture--3", "sponsors"]);
  });
});
