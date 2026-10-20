import { describe, expect, it } from "vitest";
import { carouselPackId, contentSlideInput, readQueuedCarousel } from "./queued-carousel";
import {
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
} from "./card-content";
import { livePackId, resolvePackIdForKind } from "./pack-resolve";

const bookendOpts = {
  heading: "This weekend",
  from: "2026-10-09",
  to: "2026-10-11",
  roundLabels: ["3"],
  fixtureCount: 1,
};
const fixture = (junior = false) =>
  matchDayFixtureContent(
    {
      id: junior ? -2_000_000_007 : 7,
      grade: junior ? "Year 5" : "A Grade",
      roundLabel: junior ? null : "Round 3",
      opponentName: "Mandurah Cricket Club",
      opponentLogoUrl: "https://crest",
      venue: "Oval",
      startAt: new Date("2026-10-10T02:00:00Z"),
      isHome: true,
    },
    junior ? { junior: true, juniorTeamName: "Gold", gradeLabel: "Year 5 — Gold" } : {},
  );
const visible = (preset: "minimal" | "standard" = "standard") => [
  ...presetFields("matchDay", preset),
];

const v2 = (over: { slides?: unknown[]; [k: string]: unknown } = {}) => ({
  weekendCarousel: {
    version: 2,
    packId: "club-kit-v1",
    setType: "matchDay",
    submissionId: "12345678-1234-1234-1234-123456789abc",
    size: "square",
    slides: [
      {
        id: "title",
        label: "Title page",
        content: matchDayTitleContent(bookendOpts),
        visibleFields: visible(),
        photoId: null,
        data: {},
        junior: false,
        sponsorsOn: false,
        warnings: [],
      },
      {
        id: "fixture-7",
        label: "A Grade v Mandurah",
        content: fixture(),
        visibleFields: visible(),
        photoId: null,
        data: {},
        junior: false,
        sponsorsOn: false,
        warnings: [],
      },
      {
        id: "sponsors",
        label: "Sponsors",
        content: matchDaySponsorsContent({ ...bookendOpts, sponsors: [] }),
        visibleFields: visible(),
        photoId: null,
        data: {},
        junior: false,
        sponsorsOn: false,
        warnings: [],
      },
    ],
    ...over,
  },
});

describe("queued carousel v2 (content snapshot)", () => {
  it("reads a v2 carousel and derives each content slide's input", () => {
    const payload = v2();
    const before = JSON.stringify(payload);
    const c = readQueuedCarousel(payload)!;
    expect(c).not.toBeNull();
    expect(c.version).toBe(2);
    expect(JSON.stringify(payload)).toBe(before);
    expect(c.slides[0].input).toMatchObject({
      kind: "matchDay",
      roundLabel: "ROUND 3",
      carouselPage: { page: "title", title: "This weekend", fixtureCount: 1 },
    });
    expect(c.slides[1].input).toMatchObject({
      kind: "matchDay",
      grade: "A Grade",
      oppositionName: "Mandurah",
      oppositionLogoUrl: "https://crest",
      roundLabel: "ROUND 3",
      carouselContent: true,
      namesResolved: true,
    });
    expect(c.slides[1].content).toEqual(fixture());
    expect(c.slides[2].input).toMatchObject({ carouselPage: { page: "sponsors" } });
  });

  it("hidden fields stay hidden when the saved carousel renders", () => {
    const payload = v2();
    for (const s of payload.weekendCarousel.slides as Array<{ visibleFields: string[] }>)
      s.visibleFields = visible("minimal");
    const c = readQueuedCarousel(payload)!;
    expect(c.slides[1].input).toMatchObject({ roundLabel: "", oppositionLogoUrl: null });
    expect(c.slides[0].input.roundLabel).toBe("");
  });

  it("keeps a valid override and drops an empty one", () => {
    expect(
      readQueuedCarousel(v2({ contentOverride: { preset: "minimal" } }))!.contentOverride,
    ).toEqual({ preset: "minimal" });
    expect(readQueuedCarousel(v2({ contentOverride: {} }))).not.toHaveProperty("contentOverride");
    expect(readQueuedCarousel(v2({ contentOverride: "minimal" }))).toBeNull();
  });

  it("rejects bad content, a slide with both content and input, or a mismatched junior flag", () => {
    const bad = v2();
    (bad.weekendCarousel.slides[1] as Record<string, unknown>).content = { kind: "matchDay" };
    expect(readQueuedCarousel(bad)).toBeNull();
    const both = v2();
    (both.weekendCarousel.slides[1] as Record<string, unknown>).input = { kind: "matchDay" };
    expect(readQueuedCarousel(both)).toBeNull();
    const leak = v2();
    (leak.weekendCarousel.slides[1] as Record<string, unknown>).junior = true;
    expect(readQueuedCarousel(leak)).toBeNull();
    const noFields = v2();
    delete (noFields.weekendCarousel.slides[1] as Record<string, unknown>).visibleFields;
    expect(readQueuedCarousel(noFields)).toBeNull();
  });

  it("a junior slide's photo is allowed only behind its stock image id", () => {
    const payload = v2();
    Object.assign(payload.weekendCarousel.slides[1] as Record<string, unknown>, {
      content: fixture(true),
      junior: true,
      photoId: 42,
      data: { photoUrl: "https://stock" },
    });
    const c = readQueuedCarousel(payload)!;
    expect(c.slides[1].input).toMatchObject({
      junior: true,
      juniorPhotoAllowed: true,
      juniorStockPhotoId: 42,
    });
    // Without the stock id the junior photo is refused, as in v1.
    (payload.weekendCarousel.slides[1] as Record<string, unknown>).photoId = null;
    expect(readQueuedCarousel(payload)).toBeNull();
  });

  it("mixes content slides with frozen inputs for kinds not on the pipeline yet", () => {
    const payload = v2({ setType: "teamList" });
    payload.weekendCarousel.slides[1] = {
      id: "fixture-7",
      label: "A Grade",
      input: { kind: "teamList", players: [{ order: 1, surname: "SMITH" }] },
      data: {},
      junior: false,
      sponsorsOn: false,
      warnings: [],
    };
    const c = readQueuedCarousel(payload)!;
    expect(c.slides[1].input.kind).toBe("teamList");
  });

  it("contentSlideInput matches what the reader derives", () => {
    const slide = (v2().weekendCarousel.slides as Array<Record<string, unknown>>)[1];
    expect(contentSlideInput(slide as Parameters<typeof contentSlideInput>[0])).toEqual(
      readQueuedCarousel(v2())!.slides[1].input,
    );
  });
});

describe("retired packs", () => {
  it("a retired pack id in a saved carousel reads as Club Kit (v1 and v2)", () => {
    const retired = ["gold-foil-v1"];
    const p = v2({ packId: "gold-foil-v1" });
    expect(carouselPackId(readQueuedCarousel(p, retired)!)).toBe("club-kit-v1");
    expect(p.weekendCarousel.packId).toBe("gold-foil-v1");
    const v1 = { weekendCarousel: { ...readQueuedCarousel(v2())!, version: 1 } };
    Object.assign(v1.weekendCarousel, { packId: "gold-foil-v1" });
    expect(carouselPackId(readQueuedCarousel(v1, retired)!)).toBe("club-kit-v1");
    // Not retired: the saved choice stands.
    expect(carouselPackId(readQueuedCarousel(v2({ packId: "gold-foil-v1" }))!)).toBe(
      "gold-foil-v1",
    );
  });

  it("livePackId maps only retired ids", () => {
    expect(livePackId("sunset-v1", ["sunset-v1"])).toBe("club-kit-v1");
    expect(livePackId("sunset-v1", [])).toBe("sunset-v1");
    expect(livePackId(null, ["sunset-v1"])).toBeNull();
    expect(
      resolvePackIdForKind(
        [
          {
            source: "pack",
            packId: "broadcast-dark-v1",
            cardKinds: [],
            isActive: true,
            isDefault: true,
          },
        ],
        "matchDay",
      ),
    ).toBe("broadcast-dark-v1");
  });
});
