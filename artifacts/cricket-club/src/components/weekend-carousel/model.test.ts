import { describe, expect, it, vi } from "vitest";
import type { ClubPhoto, Fixture, SocialSettingsBundle } from "@workspace/api-client-react";
import { buildWeekendSlides, carouselRoundLabel, createTeamSlides, eligiblePhotos, eligibleCoverPhotos, fixturesInRange, moveTeam, validRange, weekendRange, type TeamSlide } from "./model";
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

describe("carousel cover round labels", () => {
  it("freezes each selected team grade independently, filling only missing grades from its own fixture", () => {
    const selected = createTeamSlides([
      fixture(1, { grade: "A Grade" }), fixture(2, { grade: "Female A Grade" }),
      fixture(3, { grade: "Western District Female Premier Championship Grade" }),
    ], [], {
      1: { kind: "teamList", grade: "A Grade", gradeRound: "Metadata 1", competitionLine: "", venueDateTime: "", players: [] },
      2: { kind: "teamList", gradeRound: "Do not parse me", competitionLine: "", venueDateTime: "", players: [] },
      3: { kind: "teamList", grade: " ", gradeRound: "", competitionLine: "", venueDateTime: "", players: [] },
    });
    const slides = buildWeekendSlides(selected, [], bundle, "Teams", "2026-10-09", "2026-10-11").slice(1, -1);
    expect(slides.map(s => (s.input as { grade: string }).grade)).toEqual(selected.map(s => s.fixture.grade));
    expect(selected[1].input).not.toHaveProperty("grade");
    const frozen = JSON.parse(JSON.stringify(slides));
    for (const size of ["square", "portrait", "story", "landscape"] as CardSize[]) {
      for (const packId of ["club-kit-v1", "broadcast-dark-v1", "gold-foil-v1", "bold-type-v1", "neon-night-v1", "sunset-v1"]) {
        frozen.forEach((slide: typeof slides[number], i: number) => {
          const html = renderPackCard(slide.input, size, false, resolveCardTokens({ junior: false, packId }), false, slide.data, packId);
          expect(new DOMParser().parseFromString(html, "text/html").querySelector("[data-team-grade]")?.textContent)
            .toBe(selected[i].fixture.grade.toUpperCase());
        });
      }
    }
  });
  const teams = (...rounds: (string | null | undefined)[]) =>
    createTeamSlides(rounds.map((roundLabel, i) => fixture(i + 1, { roundLabel })), []);

  it("normalises numeric rounds and round prefixes across selected grades", () => {
    expect(carouselRoundLabel(teams("5", " ROUND 5 ", "r5", "round. 05"))).toBe("ROUND 5");
    expect(carouselRoundLabel(teams("12"))).toBe("ROUND 12");
    expect(carouselRoundLabel(teams("Grand Final", " grand   final "))).toBe("GRAND FINAL");
  });
  it("never invents one round for mixed or incomplete selections", () => {
    expect(carouselRoundLabel(teams("5", "6"))).toBe("MIXED ROUNDS");
    expect(carouselRoundLabel(teams("5", "Grand Final"))).toBe("MIXED ROUNDS");
    expect(carouselRoundLabel(teams("5", ""))).toBe("");
    expect(carouselRoundLabel(teams(null, undefined, " "))).toBe("");
    expect(carouselRoundLabel([])).toBe("");
  });
  it("uses explicit team-list rounds and summary rounds/stages, not grade numbers", () => {
    const summary = (matchTitle: string): TeamSlide["input"] => ({
      kind: "matchSummary", matchTitle, result: "Won", resultWinner: "club",
      club: { name: "Our Club", primaryColor: "#123", secondaryColor: "#456", textColor: "#fff" },
      opposition: { name: "Visitors", primaryColor: "#123", secondaryColor: "#456", textColor: "#fff" }, innings: [],
    });
    const selected = teams("14", null);
    selected[0].input = summary("A Grade • Grand Final");
    selected[1].input = summary("Under 14 • Grand Final");
    expect(carouselRoundLabel(selected)).toBe("GRAND FINAL");
    selected[1].input = summary("Under 14 • Round 5");
    expect(carouselRoundLabel(selected)).toBe("MIXED ROUNDS");
    selected[0].input = summary("Under 14");
    selected[0].fixture.roundLabel = null;
    expect(carouselRoundLabel(selected)).toBe("");
    const list = teams(null);
    list[0].input = { kind: "teamList", gradeRound: "A Grade", competitionLine: "",
      venueDateTime: "", players: [], roundLabel: "R7" };
    expect(carouselRoundLabel(list)).toBe("ROUND 7");
    list[0].input.roundLabel = "";
    list[0].fixture.roundLabel = "R8";
    expect(carouselRoundLabel(list)).toBe("ROUND 8");
  });
  it("freezes the derived label into the cover without changing team inputs", () => {
    const selected = teams("R5", "5");
    const slides = buildWeekendSlides(selected, [], bundle, "Match day", "2026-10-09", "2026-10-11");
    const frozen = JSON.parse(JSON.stringify(slides));
    selected[0].fixture.roundLabel = "6";
    expect(frozen[0].input.roundLabel).toBe("ROUND 5");
    expect(slides[1].input).toMatchObject({ roundLabel: "R5" });
    expect(slides[2].input).toMatchObject({ roundLabel: "5" });
  });
  it("prefers source metadata over reformatted or conflicting display titles", () => {
    const selected = createTeamSlides([fixture(1, { roundLabel: "14" }), fixture(2, { roundLabel: "14" })], [], {
      1: { kind: "matchSummary", matchTitle: "A Grade: season decider", roundLabel: "Grand Final", innings: [] },
      2: { kind: "matchSummary", matchTitle: "Under 14 • Round 14", roundLabel: " grand   final ", innings: [] },
    });
    expect(carouselRoundLabel(selected)).toBe("GRAND FINAL");
    const slides = buildWeekendSlides(selected, [], bundle, "Results", "2026-10-09", "2026-10-11");
    const frozen = JSON.parse(JSON.stringify(slides));
    expect(frozen[0].input.roundLabel).toBe("GRAND FINAL");
    expect(frozen[1].input).toMatchObject({ matchTitle: "A Grade: season decider", roundLabel: "Grand Final" });
    expect(frozen[1].data).toEqual(JSON.parse(JSON.stringify(slides[1].data)));
    if (selected[0].input?.kind !== "matchSummary") throw new Error("Expected summary source");
    selected[0].input.roundLabel = "Round 5";
    expect(carouselRoundLabel(selected)).toBe("MIXED ROUNDS");
    expect(frozen[0].input.roundLabel).toBe("GRAND FINAL");
  });
  it("uses explicit numeric metadata and does not infer labels for explicitly unknown rounds", () => {
    const selected = createTeamSlides([fixture(1, { roundLabel: "14" })], [], {
      1: { kind: "matchSummary", matchTitle: "A Grade • Grand Final", roundLabel: "R05" },
    });
    expect(carouselRoundLabel(selected)).toBe("ROUND 5");
    if (selected[0].input?.kind !== "matchSummary") throw new Error("Expected summary source");
    selected[0].input.roundLabel = "";
    expect(carouselRoundLabel(selected)).toBe("");
  });
});

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
    // Cover, team and closing-page sponsors keep a 2:1 frame and never crop.
    for (const card of html) {
      const doc = new DOMParser().parseFromString(card, "text/html");
      const frames = doc.querySelectorAll('[data-sponsor-logo-frame="1"]');
      for (const frame of frames) {
        expect(frame.getAttribute("style")).toContain("aspect-ratio:2 / 1");
        const image = frame.querySelector("img");
        expect(image).not.toBeNull();
        expect(image!.getAttribute("style")).toContain("object-fit:contain");
        expect(image!.getAttribute("style")).not.toContain("scale(");
      }
    }
    expect(new DOMParser().parseFromString(closing, "text/html")
      .querySelectorAll('[data-sponsor-logo-frame="1"]')).toHaveLength(9);
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

describe("weekend cover and centred sponsor rows", () => {
  it.each(Object.keys(SIZES) as CardSize[])("replaces the match count and balances four/five logos in %s", size => {
    for (const count of [4, 5]) {
      const slides = buildWeekendSlides(createTeamSlides([fixture()], []), [], {
        ...bundle, activeSponsors: bundle.activeSponsors.slice(0, count),
      }, "Match day", "2026-10-09", "2026-10-11");
      const html = slides.map(sl => renderPackCard(sl.input, size, sl.sponsorsOn,
        resolveCardTokens({ data: sl.data, junior: false, packId: "club-kit-v1" }),
        false, sl.data, "club-kit-v1"));
      expect(html[0]).not.toContain("ROUND 1");
      expect(html[0]).toContain("SWIPE &gt;&gt;");
      expect(html[0]).not.toContain("MATCHES ·");
      const closing = html.at(-1)!;
      expect(closing).toContain("flex-wrap:wrap;justify-content:center");
      expect(closing.match(/data-weekend-sponsor=/g)).toHaveLength(count);
      expect(closing).toContain(count === 4 || size === "portrait" || size === "story"
        ? "flex:0 0 calc((100% - 1.5cqmin) / 2)"
        : "flex:0 0 calc((100% - 3cqmin) / 3)");
      const doc = new DOMParser().parseFromString(closing, "text/html");
      const tiles = [...doc.querySelectorAll<HTMLElement>("[data-weekend-sponsor]")];
      expect(new Set(tiles.map(tile => tile.style.flexBasis)).size).toBe(1);
      for (const tile of tiles) {
        expect(tile.style.aspectRatio).toBe("2 / 1");
        expect(tile.textContent?.trim()).toBe("");
        expect(tile.querySelector("img")?.style.objectFit).toBe("contain");
      }
      expect((doc.querySelector("[data-skeleton-body]") as HTMLElement).style.justifyContent).toBe("center");
    }
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
    expect(html).not.toContain("ROUND 1");
    expect(html).toContain("SWIPE &gt;&gt;");
    expect(html).not.toContain("MATCHES · SWIPE");
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
