/**
 * Junior same-day slides in the Weekend Carousel (ADR-010 P3): with the
 * club's switch on, the junior games of one day share a slide (Match Day,
 * Results, Match Summaries); seniors keep a slide each and never join one.
 */
import { describe, expect, it } from "vitest";
import type { Fixture, SocialSettingsBundle } from "@workspace/api-client-react";
import { matchDayFixtureContent } from "@workspace/scorecard/card-content";
import {
  documentRowsCapacity,
  normaliseDocument,
  rowsCapacity,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
} from "@/lib/pack-render";
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

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");

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

  it("gives a junior day slide its teams' own sponsors, as a senior slide has its team's (round 4)", () => {
    // Club sponsor logos are no child's data: the junior slide's "Supported
    // by" strip follows the same rule as the senior one (Ash's junior/senior
    // consistency decision). Player sponsors never reach a team slide.
    const sponsored = {
      ...bundle,
      settings: { ...bundle.settings, sponsorsEnabled: true },
      activeSponsors: [
        { name: "Club wide", logoUrl: "/club-wide.png", grades: [], cardKinds: [] },
        { name: "Seniors Co", logoUrl: "/a-grade.png", grades: ["A Grade"], cardKinds: [] },
        { name: "Juniors Co", logoUrl: "/u13.png", grades: ["U13", "U15"], cardKinds: [] },
        { name: "Little Co", logoUrl: "/u11.png", grades: ["U11"], cardKinds: [] },
      ],
    } as unknown as SocialSettingsBundle;
    const slides = buildWeekendSlides(
      createTeamSlides(weekend, [], md(weekend)),
      [],
      sponsored,
      "This weekend",
      "2026-10-09",
      "2026-10-11",
      "Australia/Perth",
      undefined,
      undefined,
      null,
      on(),
    );
    const senior = slides.find((s) => s.id === "fixture-1")!;
    const day = slides.find((s) => s.id === "day-2026-10-10-2")!;
    expect(senior).toMatchObject({ sponsorsOn: true });
    expect(senior.data.sponsors).toEqual([{ name: "Seniors Co", logoUrl: "/a-grade.png" }]);
    // U13 and U15 share a sponsor (shown once); U11 has its own.
    expect(day).toMatchObject({ junior: true, sponsorsOn: true });
    expect(day.data.sponsors).toEqual([
      { name: "Juniors Co", logoUrl: "/u13.png" },
      { name: "Little Co", logoUrl: "/u11.png" },
    ]);
    expect(day.data.photoUrl).toBeFalsy();
    for (const packId of ["broadcast-dark-v1", "club-kit-v1"]) {
      const seniorHtml = render(senior, packId);
      const dayHtml = render(day, packId);
      expect(seniorHtml.toUpperCase(), packId).toContain("SUPPORTED BY");
      expect(dayHtml.toUpperCase(), packId).toContain("SUPPORTED BY");
      expect(dayHtml, packId).toContain("/u13.png");
      expect(dayHtml, packId).not.toContain("/a-grade.png");
      expect(dayHtml, packId).not.toContain("/club-wide.png");
    }
    // Sponsors off, or the team sponsor field hidden: no strip on either.
    const off = buildWeekendSlides(
      createTeamSlides(weekend, [], md(weekend)),
      [],
      { ...sponsored, settings: { ...sponsored.settings, sponsorsEnabled: false } },
      "This weekend",
      "2026-10-09",
      "2026-10-11",
      "Australia/Perth",
      undefined,
      undefined,
      null,
      on(),
    );
    expect(off.find((s) => s.id === "day-2026-10-10-2")).toMatchObject({ sponsorsOn: false });
  });

  // Retest 5 (H): a junior grade with a grade sponsor, as the admin picks it from
  // the fixtures' grades (TeamSponsorPicker), in a look's own day page.
  it("a junior grade's sponsor reads 'Supported by' on its day slide in every look that draws one (retest 5)", () => {
    const juniors = [
      fixture(41, "U13 Blue", SAT),
      fixture(42, "U15 Gold", SAT),
      fixture(43, "A Grade", SAT),
    ];
    const sponsored = {
      ...bundle,
      settings: { ...bundle.settings, sponsorsEnabled: true },
      activeSponsors: [
        // Stored as picked, matched whatever the case or spacing.
        { name: "Blue Bakery", logoUrl: "/blue.png", grades: ["u13 blue"], cardKinds: [] },
        { name: "Seniors Co", logoUrl: "/a-grade.png", grades: ["A Grade"], cardKinds: [] },
      ],
    } as unknown as SocialSettingsBundle;
    const slides = buildWeekendSlides(
      createTeamSlides(juniors, [], md(juniors)),
      [],
      sponsored,
      "This weekend",
      "2026-10-09",
      "2026-10-11",
      "Australia/Perth",
      undefined,
      undefined,
      null,
      on(),
    );
    const day = slides.find((s) => s.junior && s.content?.kind === "matchDay")!;
    expect(day).toMatchObject({ junior: true, sponsorsOn: true, fixtureIds: [41, 42] });
    expect(day.data.sponsors).toEqual([{ name: "Blue Bakery", logoUrl: "/blue.png" }]);
    expect(day.data.presentingSponsorName).toBe("Blue Bakery");

    const looks = readdirSync(BUNDLES).filter((d) =>
      existsSync(path.join(BUNDLES, d, "matchDay.json")),
    );
    const drawn: string[] = [];
    for (const look of looks) {
      const doc = JSON.parse(readFileSync(path.join(BUNDLES, look, "matchDay.json"), "utf8"))
        .document as { pages?: Record<string, unknown> };
      // A look whose day page has no sponsor strip draws none (see the report).
      if (!doc.pages?.day || !JSON.stringify(doc.pages.day).includes("{{sponsor1}}")) continue;
      drawn.push(look);
      for (const size of ["square", "portrait", "story"] as const) {
        const html = renderPackCard(
          day.input,
          size,
          day.sponsorsOn,
          resolveCardTokens({ junior: true, data: day.data, packId: BLANK_PACK_ID }),
          true,
          day.data,
          BLANK_PACK_ID,
          doc as unknown as CardAdjustments,
          { page: "day" },
        );
        expect(html, `${look} ${size}`).toContain("/blue.png");
        expect(html, `${look} ${size}`).not.toContain("/a-grade.png");
        expect(html.toUpperCase(), `${look} ${size}`).toMatch(/SUPPORTED BY/);
      }
    }
    expect(drawn.length).toBeGreaterThan(5);
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

/** A result's card input, as the server's result content builder reads it (ADR-010 P7). */
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

describe("Results and Match Summaries: junior same-day slides", () => {
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

// ── Duotone's day pages: a "Supported by" strip (retest 6) ──────────────────

describe("Duotone day pages: a 'Supported by' strip with the day's grade sponsors (retest 6)", () => {
  // Ash's decision: Duotone's junior and senior day slides show their teams'
  // grade sponsors as its fixture and result pages do (and every other look's
  // day page). With no sponsor the strip draws nothing and the list keeps its
  // full game count.
  const SIZES4 = ["square", "portrait", "story", "landscape"] as const;
  type Size4 = (typeof SIZES4)[number];
  type Kind = "matchDay" | "matchSummary";
  const GRADES = ["U11", "U12", "U13", "U14", "U15", "U16", "U17"];
  /** Games a day list holds at each size, with or without sponsors. */
  const CAPACITY: Record<Kind, Record<Size4, number>> = {
    matchDay: { square: 5, portrait: 6, story: 6, landscape: 4 },
    matchSummary: { square: 4, portrait: 4, story: 6, landscape: 4 },
  };

  const duotone = (kind: Kind) =>
    JSON.parse(readFileSync(path.join(BUNDLES, "duotone", `${kind}.json`), "utf8")).document as {
      pages: { day: { layers: TemplateLayerV2[] } };
    };

  const sponsoredBundle = (enabled: boolean) =>
    ({
      ...bundle,
      settings: { ...bundle.settings, sponsorsEnabled: enabled },
      activeSponsors: [
        { name: "Blue Bakery", logoUrl: "/u11.png", grades: ["U11"], cardKinds: [] },
        { name: "Gold Gym", logoUrl: "/u12.png", grades: ["U12"], cardKinds: [] },
        { name: "Seniors Co", logoUrl: "/a-grade.png", grades: ["A Grade"], cardKinds: [] },
      ],
    }) as unknown as SocialSettingsBundle;

  /** The day slides of `count` junior games (U11 and U12 sponsored), split as the app splits. */
  function daySlides(kind: Kind, size: Size4, count: number, sponsors: boolean) {
    const doc = duotone(kind);
    // The app's day capacity: the picked template's day list (template-choice.tsx).
    const capacity = documentRowsCapacity(
      normaliseDocument(doc, kind).pages.day!,
      size,
      "dayRows",
    )!;
    const games = GRADES.slice(0, count).map((g, i) => fixture(60 + i, g, SAT));
    const content =
      kind === "matchDay"
        ? md(games)
        : sourcesFor("results", games, (f) => summary(f as Fixture, true, false));
    const slides = buildWeekendSlides(
      createTeamSlides(games, [], content),
      [],
      sponsoredBundle(sponsors),
      "This weekend",
      "2026-10-09",
      "2026-10-11",
      "Australia/Perth",
      undefined,
      undefined,
      null,
      on(kind === "matchDay" ? "matchDay" : "results", capacity),
    );
    return { doc, capacity, days: slides.filter((s) => s.id.startsWith("day-")) };
  }

  /** The day slide drawn in Duotone's own day page, as a junior or a senior card. */
  function draw(kind: Kind, slide: WeekendSlide, size: Size4, junior: boolean) {
    return renderPackCard(
      { ...slide.input, junior } as WeekendSlide["input"],
      size,
      slide.sponsorsOn,
      resolveCardTokens({ junior, data: slide.data, packId: BLANK_PACK_ID }),
      junior,
      slide.data,
      BLANK_PACK_ID,
      duotone(kind) as unknown as CardAdjustments,
      { page: "day" },
    );
  }

  /** Each drawn layer's top and bottom (card percent). */
  function drawnBoxes(html: string): Map<string, { top: number; bottom: number }> {
    const out = new Map<string, { top: number; bottom: number }>();
    const re =
      /data-layer-id="([^"]+)"[^>]*?style="position:absolute;left:[^;]+;top:(-?[\d.]+)%;width:[^;]+;height:(-?[\d.]+)%/g;
    for (const m of html.matchAll(re))
      out.set(m[1]!, { top: Number(m[2]), bottom: Number(m[2]) + Number(m[3]) });
    return out;
  }
  /** The drawn day list's layer (the one holding the rows). */
  function listLayer(html: string, doc: ReturnType<typeof duotone>): TemplateLayerV2 {
    const root = window.document.createElement("div");
    root.innerHTML = html;
    const id = root.querySelector("[data-row-index]")!.closest<HTMLElement>("[data-layer-id]")!
      .dataset.layerId!;
    return doc.pages.day.layers.find((l) => l.id === id)!;
  }

  for (const kind of ["matchDay", "matchSummary"] as const)
    for (const size of SIZES4)
      for (const junior of [true, false])
        it(`${kind} ${size} ${junior ? "junior" : "senior"}: the strip prints the day's grade sponsors, never a senior grade's`, () => {
          const { days } = daySlides(kind, size, 3, true);
          expect(days).toHaveLength(1);
          const day = days[0]!;
          expect(day).toMatchObject({ junior: true, sponsorsOn: true });
          const html = draw(kind, day, size, junior);
          expect(html).toMatch(/>Supported by</);
          expect(html).toContain("/u11.png");
          // Match Day's strip has three logo slots; a result card carries one sponsor.
          if (kind === "matchDay") expect(html).toContain("/u12.png");
          expect(html).not.toContain("/a-grade.png");
          expect(html).not.toContain("{{");
        });

  for (const kind of ["matchDay", "matchSummary"] as const)
    for (const size of SIZES4)
      it(`${kind} ${size}: sponsors off, no strip and the list holds its full ${CAPACITY[kind][size]} games`, () => {
        const { doc, capacity, days } = daySlides(kind, size, CAPACITY[kind][size], false);
        expect(capacity).toBe(CAPACITY[kind][size]);
        expect(days).toHaveLength(1);
        expect(days[0]).toMatchObject({ sponsorsOn: false });
        for (const junior of [true, false]) {
          const html = draw(kind, days[0]!, size, junior);
          expect(html).not.toMatch(/Supported by/i);
          expect(html).not.toContain('data-layer-id="day-strip');
          expect(html.match(/data-row-index="/g)).toHaveLength(capacity);
          expect(rowsCapacity(listLayer(html, doc), size)).toBe(capacity);
        }
      });

  for (const kind of ["matchDay", "matchSummary"] as const)
    for (const size of SIZES4)
      it(`${kind} ${size}: with sponsors the list still holds ${CAPACITY[kind][size]} games, every one above the strip`, () => {
        const { doc, capacity, days } = daySlides(kind, size, CAPACITY[kind][size], true);
        expect(days).toHaveLength(1);
        expect(days[0]).toMatchObject({ sponsorsOn: true });
        for (const junior of [true, false]) {
          const html = draw(kind, days[0]!, size, junior);
          expect(html.match(/data-row-index="/g)).toHaveLength(capacity);
          const list = listLayer(html, doc);
          expect(rowsCapacity(list, size)).toBeGreaterThanOrEqual(capacity);
          const boxes = drawnBoxes(html);
          const strip = [...boxes].filter(([id]) => id.startsWith("day-strip"));
          expect(strip.length).toBeGreaterThan(0);
          const stripTop = Math.min(...strip.map(([, b]) => b.top));
          expect(boxes.get(list.id)!.bottom).toBeLessThanOrEqual(stripTop);
        }
      });
});
