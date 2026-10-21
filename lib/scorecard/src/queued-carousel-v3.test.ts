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
