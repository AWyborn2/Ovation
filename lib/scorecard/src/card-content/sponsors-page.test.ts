import { describe, expect, it } from "vitest";
import {
  SPONSORS_CTA,
  SPONSORS_THANK_YOU,
  contentInput,
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
  readCardContent,
  resolveVisibleFields,
  splitSponsorsContent,
} from "./index";
import { readQueuedCarousel } from "../queued-carousel";

const bookend = {
  heading: "Round 5",
  from: "2024-10-11",
  to: "2024-10-13",
  roundLabels: ["5"],
  fixtureCount: 2,
};

const SPONSORS = [
  { name: "Club A", logoUrl: "https://s/a.png", tier: "standard" },
  { name: "Team T", logoUrl: "https://s/t.png", tier: "major", grades: ["A Grade"] },
  { name: "Major M", logoUrl: "https://s/m.png", tier: "major" },
  { name: "Club B", logoUrl: "https://s/b.png" },
];

const nextHome = matchDayFixtureContent({
  id: 9,
  grade: "A Grade",
  roundLabel: "6",
  opponentName: "White Knights Baldivis Cricket Club Inc",
  opponentLogoUrl: null,
  venue: "Halls Head Oval",
  startAt: new Date("2024-10-19T04:30:00Z"),
  isHome: true,
});

const content = matchDaySponsorsContent({
  ...bookend,
  sponsors: SPONSORS,
  nextHomeGame: nextHome,
  socials: ["@ourclub", " Our Cricket Club ", "@ourclub", "", "ourclub.com.au", "extra"],
});

const page = (visible: ReadonlySet<string>, hasCoverPhoto = false) =>
  contentInput(content, visible, { hasCoverPhoto }).carouselPage as Record<string, unknown>;

const withFields = (...keys: string[]) =>
  resolveVisibleFields("matchDay", {
    preset: "standard",
    fields: Object.fromEntries(keys.map((k) => [k, true])),
  });

describe("matchDaySponsorsContent (P6)", () => {
  it("holds every sponsor: club sponsors first in sponsor order, then team sponsors", () => {
    expect(content.sponsors).toEqual([
      { name: "Club A", logoUrl: "https://s/a.png", tier: "standard", teamSponsor: false },
      { name: "Major M", logoUrl: "https://s/m.png", tier: "major", teamSponsor: false },
      { name: "Club B", logoUrl: "https://s/b.png", tier: "standard", teamSponsor: false },
      { name: "Team T", logoUrl: "https://s/t.png", tier: "major", teamSponsor: true },
    ]);
  });

  it("holds the thank-you, call to action, next home game and socials", () => {
    expect(content.thankYou).toBe(SPONSORS_THANK_YOU);
    expect(content.cta).toBe(SPONSORS_CTA);
    expect(content.nextHomeGame).toEqual({
      match: "A Grade v White Knights Baldivis",
      when: "SAT 19 OCT · 12:30 PM · Halls Head Oval",
    });
    // Trimmed, blanks and repeats dropped, at most three.
    expect(content.socials).toEqual(["@ourclub", "Our Cricket Club", "ourclub.com.au"]);
  });

  it("a game with no ground leaves it out; no game is null", () => {
    const noGround = matchDaySponsorsContent({
      ...bookend,
      sponsors: [],
      nextHomeGame: { ...nextHome, venue: "" },
    });
    expect(noGround.nextHomeGame?.when).toBe("SAT 19 OCT · 12:30 PM");
    expect(matchDaySponsorsContent({ ...bookend, sponsors: [] }).nextHomeGame).toBeNull();
  });

  it("the caller's team-sponsor test wins over grades", () => {
    const c = matchDaySponsorsContent({
      ...bookend,
      sponsors: [{ name: "X", logoUrl: "x", grades: ["  "], teamSponsor: true }],
    });
    expect(c.sponsors[0].teamSponsor).toBe(true);
  });
});

describe("sponsors page input (P6)", () => {
  it("Standard is the page as it was: club sponsors only, flat, no extra blocks", () => {
    for (const preset of ["minimal", "standard"] as const) {
      expect(page(presetFields("matchDay", preset), true)).toEqual({
        page: "sponsors",
        title: "Round 5",
        fixtureCount: 2,
        sponsors: [
          { name: "Club A", logoUrl: "https://s/a.png" },
          { name: "Major M", logoUrl: "https://s/m.png" },
          { name: "Club B", logoUrl: "https://s/b.png" },
        ],
      });
    }
  });

  it("team sponsors join when that field is on", () => {
    const names = (page(withFields("sponsors.teamSponsors")).sponsors as { name: string }[]).map(
      (s) => s.name,
    );
    expect(names).toEqual(["Club A", "Major M", "Club B", "Team T"]);
  });

  it("the tiered grid puts major sponsors first and counts them", () => {
    const p = page(withFields("sponsors.tiers", "sponsors.teamSponsors"));
    expect((p.sponsors as { name: string }[]).map((s) => s.name)).toEqual([
      "Major M",
      "Team T",
      "Club A",
      "Club B",
    ]);
    expect(p.majorCount).toBe(2);
    // A hidden team sponsor is not counted as a major one.
    expect(page(withFields("sponsors.tiers")).majorCount).toBe(1);
  });

  it("tiers with no major sponsor stay a flat grid", () => {
    const flat = matchDaySponsorsContent({
      ...bookend,
      sponsors: [{ name: "A", logoUrl: "a" }],
    });
    expect(
      contentInput(flat, withFields("sponsors.tiers")).carouselPage as Record<string, unknown>,
    ).not.toHaveProperty("majorCount");
  });

  it("the thank-you, next home game and socials show only when their field is on", () => {
    const p = page(withFields("sponsors.thankYou", "sponsors.nextHomeGame"));
    expect(p.thankYou).toBe(SPONSORS_THANK_YOU);
    expect(p.cta).toBe(SPONSORS_CTA);
    expect(p.nextHome).toEqual(content.nextHomeGame);
    expect(p.socials).toBe("@ourclub · Our Cricket Club · ourclub.com.au");
    const off = page(presetFields("matchDay", "standard"));
    for (const k of ["thankYou", "cta", "nextHome", "socials"]) expect(off).not.toHaveProperty(k);
  });

  it("an empty block hides itself even when its field is on", () => {
    const bare = matchDaySponsorsContent({ ...bookend, sponsors: [] });
    const p = contentInput(bare, presetFields("matchDay", "full")).carouselPage as Record<
      string,
      unknown
    >;
    expect(p).not.toHaveProperty("nextHome");
    expect(p).not.toHaveProperty("socials");
    expect(p.sponsors).toEqual([]);
    // With no sponsor to thank, the page keeps the club thank-you instead.
    expect(p).not.toHaveProperty("thankYou");
    expect(p).not.toHaveProperty("cta");
  });

  it("the background shows only with its field on and a photo", () => {
    expect(page(withFields("sponsors.background"), true).hasCoverPhoto).toBe(true);
    expect(page(withFields("sponsors.background"), false)).not.toHaveProperty("hasCoverPhoto");
    // title.coverPhoto is the title page's switch, not the sponsors page's.
    expect(page(withFields("title.coverPhoto"), true)).not.toHaveProperty("hasCoverPhoto");
  });
});

describe("saved sponsors content (P6)", () => {
  it("reads new content and content saved before P6", () => {
    expect(readCardContent(JSON.parse(JSON.stringify(content)))).toEqual(content);
    const before = {
      kind: "matchDay",
      page: "sponsors",
      heading: "x",
      dateRange: "y",
      roundLabel: "",
      fixtureCount: 0,
      sponsors: [{ name: "a", logoUrl: "b" }],
    };
    expect(readCardContent(before)).toEqual(before);
  });

  it("rejects malformed P6 blocks", () => {
    expect(
      readCardContent({ ...content, sponsors: [{ name: "a", logoUrl: "b", tier: "gold" }] }),
    ).toBeNull();
    expect(readCardContent({ ...content, nextHomeGame: { match: "x" } })).toBeNull();
    expect(readCardContent({ ...content, socials: "@x" })).toBeNull();
    expect(readCardContent({ ...content, thankYou: 3 })).toBeNull();
  });

  it("a saved v2 carousel derives the sponsors page input from its fields", () => {
    const visible = [...withFields("sponsors.tiers", "sponsors.background")];
    const read = readQueuedCarousel({
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
            content: matchDayTitleContent(bookend),
            visibleFields: visible,
            photoId: null,
            data: {},
            junior: false,
            sponsorsOn: false,
            warnings: [],
          },
          {
            id: "fixture-9",
            label: "A Grade v White Knights",
            content: nextHome,
            visibleFields: visible,
            photoId: null,
            data: {},
            junior: false,
            sponsorsOn: false,
            warnings: [],
          },
          {
            id: "sponsors",
            label: "Sponsors",
            content,
            visibleFields: visible,
            photoId: 4,
            data: { photoUrl: "https://p/bg.jpg" },
            junior: false,
            sponsorsOn: false,
            warnings: [],
          },
        ],
      },
    });
    const last = read!.slides[2].input.carouselPage as Record<string, unknown>;
    expect(last.majorCount).toBe(1);
    expect(last.hasCoverPhoto).toBe(true);
  });
});

describe("splitSponsorsContent (sponsors over more than one slide)", () => {
  const many = (n: number, majors = 0) =>
    matchDaySponsorsContent({
      ...bookend,
      sponsors: Array.from({ length: n }, (_, i) => ({
        name: `S${i + 1}`,
        logoUrl: `https://s/${i + 1}.png`,
        // Majors listed last, to show they are moved to the front.
        tier: i >= n - majors ? "major" : "standard",
      })),
      nextHomeGame: nextHome,
      socials: ["@ourclub"],
    });
  const tiers = withFields("sponsors.tiers");
  const names = (pages: ReturnType<typeof splitSponsorsContent>) =>
    pages.map((p) => p.sponsors.map((s) => s.name));

  it("keeps one page while the sponsors fit", () => {
    const one = many(12);
    expect(splitSponsorsContent(one, tiers)).toEqual([one]);
  });

  it("shares the sponsors evenly, not a full page and a remainder", () => {
    expect(splitSponsorsContent(many(20), tiers).map((p) => p.sponsors.length)).toEqual([10, 10]);
    expect(splitSponsorsContent(many(13), tiers).map((p) => p.sponsors.length)).toEqual([7, 6]);
    // Ash's example: 12 at 8 a page is 6 and 6.
    expect(splitSponsorsContent(many(12), tiers, 8).map((p) => p.sponsors.length)).toEqual([6, 6]);
  });

  it("puts the major sponsors first while tiers are on, and each page re-projects to itself", () => {
    const pages = splitSponsorsContent(many(20, 3), tiers);
    expect(names(pages)[0]!.slice(0, 3)).toEqual(["S18", "S19", "S20"]);
    for (const p of pages) {
      const input = contentInput(p, tiers).carouselPage as { sponsors: Array<{ name: string }> };
      expect(input.sponsors.map((s) => s.name)).toEqual(p.sponsors.map((s) => s.name));
    }
  });

  it("closes the last page with the next home game and socials, and drops hidden team sponsors", () => {
    const pages = splitSponsorsContent(many(20), tiers);
    expect(pages[0]!.nextHomeGame).toBeNull();
    expect(pages[0]!.socials).toEqual([]);
    expect(pages[1]!.nextHomeGame).not.toBeNull();
    expect(pages[1]!.socials).toEqual(["@ourclub"]);
    expect(pages.every((p) => p.thankYou === SPONSORS_THANK_YOU)).toBe(true);
    const withTeams = matchDaySponsorsContent({
      ...bookend,
      sponsors: Array.from({ length: 14 }, (_, i) => ({
        name: `S${i}`,
        logoUrl: "https://s/x.png",
        grades: i < 4 ? ["A Grade"] : [],
      })),
    });
    // Team sponsors off: 10 shown, one page.
    expect(splitSponsorsContent(withTeams, tiers)).toHaveLength(1);
  });
});
