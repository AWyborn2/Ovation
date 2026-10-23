/** Saved carousel version 3: a content set drawn with a template (ADR-011 T3.19). */
import { describe, expect, it } from "vitest";
import { carouselPackId, readCarouselTemplateRef, readQueuedCarousel } from "./queued-carousel";
import {
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
} from "./card-content";
import { pageForInput } from "./kind-templates";

const bookendOpts = {
  heading: "This weekend",
  from: "2026-10-09",
  to: "2026-10-11",
  roundLabels: ["3"],
  fixtureCount: 1,
};
const slide = (id: string, content: unknown) => ({
  id,
  label: id,
  content,
  visibleFields: [...presetFields("matchDay", "standard")],
  photoId: null,
  data: {},
  junior: false,
  sponsorsOn: false,
  warnings: [],
});
const fixture = matchDayFixtureContent({
  id: 7,
  grade: "A Grade",
  roundLabel: "Round 3",
  opponentName: "Mandurah Cricket Club",
  opponentLogoUrl: "https://crest",
  venue: "Oval",
  startAt: new Date("2026-10-10T02:00:00Z"),
  isHome: true,
});

const v3 = (over: Record<string, unknown> = {}) => ({
  weekendCarousel: {
    version: 3,
    templateRef: { copyId: 12, version: 4 },
    setType: "matchDay",
    submissionId: "12345678-1234-1234-1234-123456789abc",
    size: "square",
    slides: [
      slide("title", matchDayTitleContent(bookendOpts)),
      slide("fixture-7", fixture),
      slide("sponsors", matchDaySponsorsContent({ ...bookendOpts, sponsors: [] })),
    ],
    ...over,
  },
});

describe("queued carousel v3 (templated)", () => {
  it("reads a templated set like version 2, with its template ref", () => {
    const c = readQueuedCarousel(v3())!;
    expect(c).not.toBeNull();
    expect(c.version).toBe(3);
    expect(c.templateRef).toEqual({ copyId: 12, version: 4 });
    expect(c.packId).toBeUndefined();
    // Each slide draws its own page of the one document.
    expect(c.slides.map((s) => pageForInput(s.input as { kind: string }))).toEqual([
      "title",
      "fixture",
      "sponsors",
    ]);
  });

  it("renders on the blank base", () => {
    expect(carouselPackId(readQueuedCarousel(v3())!)).toBe("blank");
    expect(carouselPackId({ version: 2 })).toBe("club-kit-v1");
  });

  it("refuses a pack, a missing or ambiguous ref", () => {
    expect(readQueuedCarousel(v3({ packId: "club-kit-v1" }))).toBeNull();
    expect(readQueuedCarousel(v3({ templateRef: undefined }))).toBeNull();
    expect(
      readQueuedCarousel(v3({ templateRef: { copyId: 1, libraryTemplateId: 2, version: 1 } })),
    ).toBeNull();
    expect(readQueuedCarousel(v3({ templateRef: { copyId: 0, version: 1 } }))).toBeNull();
  });

  it("reads template refs strictly", () => {
    expect(readCarouselTemplateRef({ libraryTemplateId: 3, version: 2 })).toEqual({
      libraryTemplateId: 3,
      version: 2,
    });
    expect(readCarouselTemplateRef({ copyId: 3, version: 2, extra: 1 })).toBeNull();
    expect(readCarouselTemplateRef({ copyId: 3 })).toBeNull();
    expect(readCarouselTemplateRef(null)).toBeNull();
  });
});

describe("queued carousel v3 rearranged in the set editor (carousel set editor plan)", () => {
  const slides = () => (v3().weekendCarousel.slides as Array<Record<string, unknown>>).slice();
  const design = (id: string, junior = false) => ({
    id,
    label: "Page 1",
    pageId: "page-1",
    input: { kind: "matchDay", ...(junior ? { junior: true } : {}) },
    data: {},
    junior,
    sponsorsOn: false,
    warnings: [],
  });

  it("keeps slides in any order, without the sponsors page", () => {
    const [title, fix, sponsors] = slides();
    expect(readQueuedCarousel(v3({ slides: [fix, title, sponsors] }))).not.toBeNull();
    const c = readQueuedCarousel(v3({ slides: [title, fix] }))!;
    expect(c.slides.map((s) => s.id)).toEqual(["title", "fixture-7"]);
    expect(readQueuedCarousel(v3({ slides: [fix] }))).not.toBeNull();
  });

  it("names a slide's page, and keeps a design page of no data", () => {
    const [title, fix, sponsors] = slides();
    const c = readQueuedCarousel(
      v3({ slides: [title, { ...fix, pageId: "fixture" }, design("d1"), sponsors] }),
    )!;
    expect(c.slides.map((s) => s.pageId)).toEqual([undefined, "fixture", "page-1", undefined]);
  });

  it("refuses a design page carrying data, or an odd page id", () => {
    const [title] = slides();
    expect(
      readQueuedCarousel(
        v3({ slides: [title, { ...design("d1"), input: { kind: "matchDay", grade: "A" } }] }),
      ),
    ).toBeNull();
    expect(
      readQueuedCarousel(v3({ slides: [title, { ...design("d1"), data: { photoUrl: "x" } }] })),
    ).toBeNull();
    expect(
      readQueuedCarousel(v3({ slides: [title, { ...design("d1"), pageId: "../x" }] })),
    ).toBeNull();
    // A junior design page says so on its input too.
    expect(
      readQueuedCarousel(v3({ slides: [title, { ...design("d1"), junior: true }] })),
    ).toBeNull();
    expect(readQueuedCarousel(v3({ slides: [title, design("d1", true)] }))).not.toBeNull();
  });

  it("still refuses a junior leak on a moved slide", () => {
    const [title, fix, sponsors] = slides();
    expect(
      readQueuedCarousel(v3({ slides: [sponsors, { ...fix, junior: true }, title] })),
    ).toBeNull();
  });

  it("keeps versions 1 and 2 to their bookends", () => {
    const [title, fix, sponsors] = slides();
    expect(
      readQueuedCarousel(
        v3({
          version: 2,
          templateRef: undefined,
          packId: "club-kit-v1",
          slides: [fix, title, sponsors],
        }),
      ),
    ).toBeNull();
  });
});

describe("a design page's card data", () => {
  it("is the set's brand: the first data slide's payload without its photo", async () => {
    const { carouselSlideData } = await import("./queued-carousel");
    const data = { brand: { name: "Club" }, photoUrl: "p.jpg", photoTransform: { zoom: 1 } };
    const slides = [
      { id: "a", pageId: undefined, data },
      { id: "d", pageId: "page-1", data: {} },
    ] as never[];
    expect(carouselSlideData({ slides }, slides[1]!)).toEqual({ brand: { name: "Club" } });
    expect(carouselSlideData({ slides }, slides[0]!)).toBe(data);
  });
});
