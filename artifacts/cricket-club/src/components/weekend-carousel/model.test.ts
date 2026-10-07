import { describe, expect, it, vi } from "vitest";
import type { ClubPhoto, Fixture, SocialSettingsBundle } from "@workspace/api-client-react";
import { buildWeekendSlides, createTeamSlides, eligiblePhotos, fixturesInRange, moveTeam, validRange, weekendRange } from "./model";
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
    expect(slides[1].warnings).toHaveLength(3);
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
