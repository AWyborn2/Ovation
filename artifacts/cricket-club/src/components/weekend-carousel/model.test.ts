import { describe, expect, it, vi } from "vitest";
import type { ClubPhoto, Fixture, SocialSettingsBundle } from "@workspace/api-client-react";
import { buildWeekendSlides, createTeamSlides, eligiblePhotos, eligibleCoverPhotos, fixturesInRange, moveTeam, validRange, weekendRange } from "./model";
import { renderPackCard, resolveCardTokens } from "@/lib/pack-render";
import { SIZES, type CardSize } from "@/lib/share-card";

const fixture = (id = 1, overrides: Partial<Fixture> = {}): Fixture => ({
  id, grade: "A Grade", opponentName: "Visitors", venue: "Club Oval", isHome: true,
  startAt: "2026-10-10T04:00:00Z", source: "manual", createdAt: "2026-01-01T00:00:00Z", ...overrides,
});
const photo = (id = 1, overrides: Partial<ClubPhoto> = {}): ClubPhoto => ({
  id, grade: "A Grade", photoTypes: ["batting"], url: `/photos/${id}.jpg`, thumbUrl: `/photos/${id}-thumb.jpg`,
  width: 1000, height: 800, playerIds: [], createdAt: "", season: null, takenAt: null, matchFormat: null, ...overrides,
});
const bundle = {
  settings: { sponsorsEnabled: true, clubHashtag: "#OURCLUB" },
  brand: { name: "Our Cricket Club", primaryColour: "#009900", backgroundColour: "#001122" },
  activeSponsors: Array.from({ length: 7 }, (_, i) => ({ name: `Sponsor ${i + 1}`, logoUrl: `/sponsor-${i + 1}.png`, cardKinds: ["matchDay"] })),
} as unknown as SocialSettingsBundle;

describe("weekend sponsor placements", () => {
  const sponsorBundle = {
    ...bundle,
    activeSponsors: [
      { name: "Headline", logoUrl: "/headline.png", isPresenting: true, grades: [], cardKinds: [] },
      { name: "A sponsor", logoUrl: "/a-sponsor.png", grades: ["a-grade"], cardKinds: ["teamList"] },
      { name: "B sponsor", logoUrl: "/b-sponsor.png", grades: ["B Grade"], cardKinds: [] },
      { name: "Other team", logoUrl: "/other.png", grades: ["C Grade"], cardKinds: [] },
      ...Array.from({ length: 8 }, (_, i) => ({
        name: `Club supporter ${i}`, logoUrl: `/club-${i}.png`, grades: [],
        // Every unassigned active sponsor belongs on the closing page, even
        // if they aren't enabled for standalone match-day cards.
        cardKinds: ["milestone"],
      })),
    ],
  } as unknown as SocialSettingsBundle;
  const build = (b = sponsorBundle) => buildWeekendSlides(
    createTeamSlides([fixture(), fixture(2, { grade: "B Grade" }), fixture(3, { grade: "U15" })], []),
    [], b, "Weekend", "2026-10-09", "2026-10-11",
  );
  it.each(Object.keys(SIZES) as CardSize[])("places each sponsor in the correct rendered %s slide", size => {
    const slides = build();
    const html = slides.map(sl => renderPackCard(sl.input, size, sl.sponsorsOn,
      resolveCardTokens({ data: sl.data, junior: sl.junior, packId: "club-kit-v1" }),
      sl.junior, sl.data, "club-kit-v1"));
    expect(html[0]).toContain("PRESENTED BY");
    expect(html[0]).toContain("/headline.png");
    expect(html[0]).not.toContain("/a-sponsor.png");
    expect(slides[1].data.sponsors).toEqual([{ name: "A sponsor", logoUrl: "/a-sponsor.png" }]);
    expect(slides[2].data.sponsors).toEqual([{ name: "B sponsor", logoUrl: "/b-sponsor.png" }]);
    expect(html[1]).toContain("/a-sponsor.png");
    expect(html[2]).toContain("/b-sponsor.png");
    for (const card of html.slice(1, 4)) {
      expect(card).not.toContain("/headline.png");
      expect(card).not.toContain("/other.png");
      expect(card).not.toContain("/club-0.png");
    }
    expect(slides[3].sponsorsOn).toBe(false);
    expect(slides[3].warnings.join(" ")).toContain("No sponsor is assigned");
    const closing = html.at(-1)!;
    for (let i = 0; i < 8; i++) expect(closing).toContain(`/club-${i}.png`);
    expect(closing).toContain("/headline.png"); // Also unassigned to a team.
    expect(closing).not.toContain("/a-sponsor.png");
    expect(closing).not.toContain("/b-sponsor.png");
    expect(closing).not.toContain("/other.png");
  });
  it("respects sponsors off everywhere", () => {
    const slides = build({ ...sponsorBundle, settings: { ...sponsorBundle.settings, sponsorsEnabled: false } });
    expect(slides.every(s => !s.sponsorsOn)).toBe(true);
    expect(slides.every(s => !s.data.sponsors?.length)).toBe(true);
    expect(slides.at(-1)!.input).toMatchObject({ carouselPage: { sponsors: [] } });
  });
  it("never substitutes another sponsor when no presenting sponsor exists", () => {
    const slides = build({ ...sponsorBundle, activeSponsors: sponsorBundle.activeSponsors.filter(s => !s.isPresenting) });
    expect(slides[0].sponsorsOn).toBe(false);
    expect(slides[0].data.presentingSponsorName).toBeUndefined();
  });
  it("shows a name when the assigned sponsor has no logo, and only one when assignments overlap", () => {
    const slides = build({ ...sponsorBundle, activeSponsors: [
      { ...sponsorBundle.activeSponsors[1], logoUrl: "" },
      { ...sponsorBundle.activeSponsors[2], grades: ["A Grade", "B Grade"] },
    ] });
    expect(slides[1].data.sponsors).toHaveLength(1);
    expect(slides[1].warnings.join(" ")).toContain("Multiple sponsors");
    const html = renderPackCard(slides[1].input, "square", true,
      resolveCardTokens({ data: slides[1].data, junior: false, packId: "club-kit-v1" }),
      false, slides[1].data, "club-kit-v1");
    expect(html).toContain("A sponsor");
    expect(html).not.toContain("/b-sponsor.png");
  });
});

describe("weekend dates", () => {
  it.each([
    ["2026-10-05T04:00:00Z", "2026-10-09", "2026-10-11"],
    ["2026-10-09T04:00:00Z", "2026-10-09", "2026-10-11"],
    ["2026-10-10T04:00:00Z", "2026-10-09", "2026-10-11"],
    ["2026-10-11T15:59:59Z", "2026-10-09", "2026-10-11"],
    ["2026-10-11T16:00:00Z", "2026-10-16", "2026-10-18"],
    ["2026-12-31T20:00:00Z", "2027-01-01", "2027-01-03"],
  ])("uses club-local Friday–Sunday at %s", (now, from, to) => {
    expect(weekendRange(new Date(now))).toEqual({ from, to });
  });
  it("uses the requested timezone rather than the host's day", () => {
    expect(weekendRange(new Date("2026-10-11T14:30:00Z"), "Australia/Sydney").from).toBe("2026-10-16");
    expect(weekendRange(new Date("2026-10-11T14:30:00Z"), "Australia/Perth").from).toBe("2026-10-09");
  });
  it("includes already-started games and both boundaries, excludes byes/cancellations/outside range", () => {
    const fixtures = [
      fixture(1, { startAt: "2026-10-08T16:00:00Z" }),
      fixture(2, { startAt: "2026-10-11T15:59:59Z" }),
      fixture(3, { startAt: "2026-10-08T15:59:59Z" }),
      fixture(4, { startAt: "2026-10-11T16:00:00Z" }),
      fixture(5, { opponentName: " BYE " }),
      fixture(6, { notes: "Match cancelled due to weather" }),
      fixture(7, { status: "ABANDONED" } as Partial<Fixture>),
    ];
    expect(fixturesInRange(fixtures, "2026-10-09", "2026-10-11").map(f => f.id)).toEqual([1, 2]);
    expect(validRange("2026-02-30", "2026-03-01")).toBe(false);
    expect(validRange("2026-10-11", "2026-10-09")).toBe(false);
  });
});

describe("strict photos and full ordered sets", () => {
  it("accepts every category only in Club-wide Season 2026, not dates or other grades", () => {
    const photos = [
      photo(1, { grade: null, season: 2026, photoTypes: ["team"] }),
      photo(2, { grade: null, season: 2026, photoTypes: [] }),
      photo(3, { grade: null, season: 2026, photoTypes: ["celebrating"] }),
      photo(4, { season: 2026 }), photo(5, { grade: null, season: 2025 }),
      photo(6, { grade: null, createdAt: "2026-10-10T00:00:00Z" }),
      photo(7, { grade: "U15", season: 2026 }),
    ];
    expect(eligibleCoverPhotos(photos).map(p => p.id)).toEqual([1, 2, 3]);
  });
  it.each(Object.keys(SIZES) as CardSize[])("renders cover photo and preserves other slides in %s", size => {
    const teams = createTeamSlides([fixture()], [photo()]);
    const baseline = buildWeekendSlides(teams, [photo()], bundle, "Weekend", "2026-10-09", "2026-10-11");
    const cover = { selection: { photoId: 10, transform: { focalX: .2, focalY: .7, zoom: 2 } },
      photos: [photo(10, { grade: null, season: 2026, photoTypes: ["team"] })] };
    const slides = buildWeekendSlides(teams, [photo()], bundle, "Weekend", "2026-10-09", "2026-10-11", undefined, cover);
    expect(slides.slice(1)).toEqual(baseline.slice(1));
    expect(slides[0].data.photoTransform).toEqual(cover.selection.transform);
    const html = renderPackCard(slides[0].input, size, false,
      resolveCardTokens({ data: slides[0].data, packId: "club-kit-v1", junior: false }), false, slides[0].data, "club-kit-v1");
    expect(html).toContain("/photos/10.jpg");
    expect(html).toContain("SWIPE FOR EVERY TEAM");
    expect(html).toContain("linear-gradient(180deg,rgba(0,0,0,.76)");
    expect(html).not.toContain("{{");
    const removed = buildWeekendSlides(teams, [photo()], bundle, "Weekend", "2026-10-09", "2026-10-11", undefined,
      { ...cover, selection: { ...cover.selection, photoId: null } });
    expect(removed).toEqual(baseline);
    const missing = buildWeekendSlides(teams, [photo()], bundle, "Weekend", "2026-10-09", "2026-10-11", undefined,
      { ...cover, photos: [] });
    expect(missing[0].data.photoUrl).toBeUndefined();
    expect(missing[0].warnings[0]).toContain("no longer available");
  });
  it("allows action tags only, exact grade only; multi-tag matches; no junior photos", () => {
    const photos = [photo(1), photo(2, { photoTypes: ["bowling"] }), photo(3, { photoTypes: ["fielding", "celebrating"] }),
      photo(4, { grade: "B Grade" }), photo(5, { photoTypes: ["team"] }),
      photo(6, { photoTypes: ["celebrating"] }), photo(7, { grade: null }), photo(8, { grade: "U15" })];
    expect(eligiblePhotos(photos, "A Grade").map(p => p.id)).toEqual([1, 2, 3]);
    expect(eligiblePhotos(photos, "U15")).toEqual([]);
  });
  it("picks once and carries the same photo and transform through repeated builds", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.9);
    const photos = [photo(1), photo(2)];
    const teams = createTeamSlides([fixture()], photos);
    teams[0].transform = { focalX: 0.2, focalY: 0.6, zoom: 2 };
    const one = buildWeekendSlides(teams, photos, bundle, "Club weekend", "2026-10-09", "2026-10-11");
    const two = buildWeekendSlides(teams, photos, bundle, "Club weekend", "2026-10-09", "2026-10-11");
    expect(one).toEqual(two);
    expect(one[1].data.photoUrl).toBe("/photos/2.jpg");
    expect(one[1].data.photoTransform).toEqual(teams[0].transform);
    expect(random).toHaveBeenCalledTimes(1);
    random.mockRestore();
  });
  it("revalidates deleted/reclassified selections without fallback and flags missing details", () => {
    const teams = createTeamSlides([fixture(1, { venue: null, opponentName: "" })], [photo()]);
    const slides = buildWeekendSlides(teams, [photo(1, { grade: "B Grade" })], bundle, "Weekend", "2026-10-09", "2026-10-11");
    expect(slides[1].data.photoUrl).toBeNull();
    expect(slides[1].warnings).toHaveLength(4);
    expect(slides[1].input).toMatchObject({ venue: "Venue TBC", oppositionName: "Opponent TBC" });
  });
  it("keeps duplicate-grade fixtures and all 14 slides, plus every eligible sponsor", () => {
    const teams = createTeamSlides(Array.from({ length: 12 }, (_, i) => fixture(i + 1)), []);
    const slides = buildWeekendSlides(moveTeam(teams, 0, 11), [], bundle, "Weekend", "2026-10-09", "2026-10-11");
    expect(slides).toHaveLength(14);
    expect(slides.map(s => s.id)).toEqual(["title", ...Array.from({ length: 11 }, (_, i) => `fixture-${i + 2}`), "fixture-1", "sponsors"]);
    expect(slides.at(-1)!.input).toMatchObject({ carouselPage: { sponsors: bundle.activeSponsors.map(({ name, logoUrl }) => ({ name, logoUrl })) } });
  });
  it("provides an explicit no-sponsors closing state and branded junior no-photo card", () => {
    const teams = createTeamSlides([fixture(1, { grade: "U15" })], [photo(1, { grade: "U15" })]);
    const slides = buildWeekendSlides(teams, [], { ...bundle, activeSponsors: [] }, "Weekend", "2026-10-09", "2026-10-11");
    expect(slides[1].junior).toBe(true);
    expect(slides[1].data.photoUrl).toBeNull();
    expect(slides.at(-1)!.warnings[0]).toMatch(/No active sponsors/);
  });
  it.each(Object.keys(SIZES) as CardSize[])("renders title, grade and ALL seven sponsors in %s with no sample leakage", size => {
    const slides = buildWeekendSlides(createTeamSlides([fixture()], []), [], bundle, "<Club weekend>", "2026-10-09", "2026-10-11");
    const html = slides.map(sl => renderPackCard(sl.input, size, sl.sponsorsOn, resolveCardTokens({
      data: sl.data, junior: sl.junior, packId: "club-kit-v1",
    }), sl.junior, sl.data, "club-kit-v1"));
    expect(html[0]).toContain("&lt;Club weekend&gt;");
    expect(html[1]).toContain("A Grade");
    for (let i = 1; i <= 7; i++) expect(html[2]).toContain(`/sponsor-${i}.png`);
    for (const card of html) {
      expect(card).not.toContain("{{");
      expect(card).not.toContain("HALLS HEAD");
      expect(card).toContain("Our");
    }
  });
});
