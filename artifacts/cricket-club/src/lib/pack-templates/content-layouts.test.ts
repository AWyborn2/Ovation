/**
 * The fit grid (ADR-010 T2.5): every pack on the content contract × preset ×
 * size × Match Day slide, rendered with worst-case content through the same
 * path the carousel and the publish renderer use. It fails when a visible
 * field has no box or does not show, a hidden field still shows, a template
 * sample leaks, or a name would be cut off with "…".
 *
 * CI has no browser, so fit is checked against each name box's declared
 * capacity (`data-fit`, P1's shared rule: shrink to MIN_FIT, then two lines),
 * the same numbers the renderer sizes by.
 */
import { describe, expect, it } from "vitest";
import type { ClubPhoto, Fixture, SocialSettingsBundle } from "@workspace/api-client-react";
import {
  CONTENT_FIELDS,
  CONTENT_PRESETS,
  ladderContent,
  lastMeetingContent,
  contentInput,
  dayHeading,
  dayResultRow,
  matchDayDayContent,
  matchDayFixtureContent,
  milestoneWatchContent,
  presetFields,
  type ContentPreset,
} from "@workspace/scorecard/card-content";
import { renderPackCard, resolveCardTokens } from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { buildPackData } from "@/lib/pack-card-data";
import { MIN_FIT, balancedLongestLine } from "@/lib/pack-render/name-fit";
import { buildWeekendSlides, createTeamSlides } from "@/components/weekend-carousel/model";
import {
  CONTENT_LAYOUT_SIZES,
  CONTENT_PACK_IDS,
  contentCapacity,
  contentLayout,
  dayCapacity,
} from "./content-layouts";

// Worst-case content: the longest names and labels the pilot clubs produce.
const LONG_OPPONENT = "Rockingham Mandurah Districts Cricket Club Inc";
const fixture: Fixture = {
  id: 1,
  grade: "Western District Female Premier Championship Grade",
  roundLabel: "Round 3",
  opponentName: LONG_OPPONENT,
  opponentLogoUrl: "https://crest.test/rmd.png",
  venue: "Mike Barnett Sports Complex Oval 2",
  startAt: "2026-10-10T02:00:00Z",
  isHome: false,
  source: "manual",
  createdAt: "",
};
// Worst-case optional data (P5): double-digit places, a long margin, a long name.
const OPTIONAL_DATA = {
  ladder: ladderContent({
    teams: 14,
    tableName: null,
    club: { rank: 12 },
    opposition: { rank: 13 },
  })!,
  lastMeeting: lastMeetingContent({
    outcome: "won",
    margin: "10 wickets (DLS method)",
    date: "2026-02-07",
    season: "2025/26",
  })!,
  milestoneWatch: milestoneWatchContent({
    playerName: "Alexander Featherstonehaugh-Smith",
    stat: "wickets",
    tier: 100,
    gap: 3,
  })!,
};
const content = {
  [fixture.id]: {
    ...matchDayFixtureContent({
      ...fixture,
      roundLabel: fixture.roundLabel ?? null,
      opponentLogoUrl: fixture.opponentLogoUrl ?? null,
      venue: fixture.venue ?? null,
      startAt: new Date(fixture.startAt),
    }),
    ...OPTIONAL_DATA,
  } as unknown as Record<string, unknown>,
};
const LIVESTREAM = "https://www.youtube.com/@RockinghamMandurahDistrictsCricketClub/live";
const teamPhoto: ClubPhoto = {
  id: 5,
  grade: fixture.grade,
  photoTypes: ["batting"],
  url: "https://photos.test/team.jpg",
  thumbUrl: "https://photos.test/team-thumb.jpg",
  width: 1000,
  height: 800,
  playerIds: [],
  createdAt: "",
  season: null,
  takenAt: null,
  matchFormat: null,
};
const coverPhoto: ClubPhoto = {
  ...teamPhoto,
  id: 6,
  grade: null,
  season: 2026,
  url: "https://photos.test/cover.jpg",
};
const bundle = {
  settings: { sponsorsEnabled: true, clubHashtag: "#OURCLUB", livestreamUrl: LIVESTREAM },
  brand: { name: "Our Cricket Club", primaryColour: "#009900", backgroundColour: "#001122" },
  activeSponsors: [
    {
      name: "Presenting Partner",
      logoUrl: "https://s.test/presenting.png",
      isPresenting: true,
      tier: "major",
    },
    {
      name: "Team Partner",
      logoUrl: "https://s.test/team.png",
      grades: [fixture.grade],
      tier: "standard",
    },
    { name: "Club Partner", logoUrl: "https://s.test/club.png", tier: "standard" },
  ],
} as unknown as SocialSettingsBundle;

// The sponsors page's sources (P6), worst case: the longest next home game and socials.
const backgroundPhoto: ClubPhoto = { ...coverPhoto, id: 7, url: "https://photos.test/bg.jpg" };
const sponsorsPage = {
  backgroundPhoto,
  nextHomeGame: matchDayFixtureContent({
    ...fixture,
    id: 2,
    isHome: true,
    roundLabel: "Round 4",
    opponentLogoUrl: null,
    venue: fixture.venue ?? null,
    startAt: new Date("2026-10-17T02:00:00Z"),
  }),
  socials: ["@ourcricketclubofficial", "Our Cricket Club Official", "ourcricketclub.com.au"],
};

function slidesFor(preset: ContentPreset) {
  const teams = createTeamSlides([fixture], [teamPhoto], content);
  teams[0].photoId = teamPhoto.id;
  return buildWeekendSlides(
    teams,
    [teamPhoto],
    bundle,
    "Round three — every team, every ground, all weekend",
    "2026-10-09",
    "2026-10-11",
    "Australia/Perth",
    {
      selection: { photoId: coverPhoto.id, transform: { focalX: 0.5, focalY: 0.5, zoom: 1 } },
      photos: [coverPhoto],
    },
    presetFields("matchDay", preset),
    sponsorsPage,
  );
}

const SAMPLES = /MARINERS|Rushton Park|THIS SATURDAY|BAR &amp; KITCHEN|YOUR CLUB|SAMPLE CLUB/;

/** A name box's text fits its declared capacity without "…" (P1's shared rule). */
function fitsWithoutEllipsis(text: string, capacity: number): boolean {
  const words = text.trim().split(/\s+|(?<=-)/);
  if (text.length <= capacity / MIN_FIT) return true;
  return balancedLongestLine(words) <= capacity / MIN_FIT;
}

describe("content layout contract", () => {
  it.each(CONTENT_PACK_IDS)("%s has a box for every Match Day field", (packId) => {
    const slots = new Set(contentLayout(packId, "matchDay").slots);
    for (const f of CONTENT_FIELDS.matchDay) expect(slots.has(f.key), f.key).toBe(true);
  });

  it("declares how many junior fixtures share a day slide at every size and preset (P3)", () => {
    for (const packId of CONTENT_PACK_IDS)
      for (const size of CONTENT_LAYOUT_SIZES)
        for (const preset of CONTENT_PRESETS) {
          const n = contentCapacity(packId, "matchDay", size, preset);
          expect(n, `${packId} ${size} ${preset}`).toBeGreaterThanOrEqual(2);
          expect(dayCapacity(packId, "matchDay", size, preset)).toBe(n);
          expect(dayCapacity(packId, "results", size, preset)).toBeGreaterThanOrEqual(2);
        }
    // Team lists never share a slide.
    expect(dayCapacity("club-kit-v1", "teamList", "story", "standard")).toBe(1);
    // A pack not on the contract splits as Club Kit.
    expect(dayCapacity("sunset-v1", "results", "square", "standard")).toBe(
      dayCapacity("club-kit-v1", "results", "square", "standard"),
    );
  });

  it("a pack not on the contract lays out as Club Kit", () => {
    expect(contentLayout("sunset-v1", "matchDay")).toBe(contentLayout("club-kit-v1", "matchDay"));
    expect(contentLayout(null, "matchDay")).toBe(contentLayout("club-kit-v1", "matchDay"));
  });
});

describe.each(CONTENT_PACK_IDS)("fit grid: %s", (packId) => {
  describe.each(CONTENT_PRESETS)("%s preset", (preset) => {
    const visible = presetFields("matchDay", preset);
    const slides = slidesFor(preset);
    const show = (k: string) => visible.has(k);

    it.each(CONTENT_LAYOUT_SIZES)(
      "renders every slide at %s with only its visible fields",
      (size) => {
        expect(slides.map((s) => s.id)).toEqual(["title", "fixture-1", "sponsors"]);
        for (const slide of slides) {
          const html = renderPackCard(
            slide.input,
            size,
            slide.sponsorsOn,
            resolveCardTokens({ junior: slide.junior, data: slide.data, packId }),
            slide.junior,
            slide.data,
            packId,
          );
          const doc = new DOMParser().parseFromString(html, "text/html");
          const text = (doc.body.textContent ?? "").replace(/\s+/g, " ");
          const where = `${packId} ${preset} ${size} ${slide.id}`;
          expect(html, where).not.toContain("{{");
          expect(html, where).not.toContain("data-drop-if-field");
          expect(html, where).not.toMatch(SAMPLES);
          expect(text, where).not.toMatch(/TBC/);

          if (slide.id === "title") {
            expect(text, where).toMatch(/SAT 10 OCT|FRI 9 OCT/);
            expect(text.includes("ROUND 3"), where).toBe(show("title.round"));
            expect(html.includes(coverPhoto.url), where).toBe(show("title.coverPhoto"));
            // The presenting sponsor shows as its logo, or its name when it has none.
            expect(
              text.includes("Presenting Partner") || html.includes("https://s.test/presenting.png"),
              where,
            ).toBe(show("title.presentingSponsor"));
            // The livestream link: shortened, one line (it ellipses rather than wraps).
            const live = doc.querySelector("[data-livestream]");
            expect(!!live, where).toBe(show("title.livestream"));
            if (live) {
              expect(live.textContent, where).toContain("WATCH LIVE");
              expect(live.textContent, where).toContain(
                "youtube.com/@rockinghammandurahdistrictscricketclub/live",
              );
              expect(live.innerHTML, where).toMatch(/white-space:nowrap/);
            }
          }
          if (slide.id === "fixture-1") {
            const upper = text.toUpperCase();
            for (const value of ["ROCKINGHAM MANDURAH DISTRICTS", "SAT 10 OCT", "10:00 AM", "AWAY"])
              expect(upper, `${where}: ${value}`).toContain(value);
            expect(upper.includes("MIKE BARNETT SPORTS COMPLEX OVAL 2"), where).toBe(true);
            expect(upper.includes("WESTERN DISTRICT FEMALE PREMIER CHAMPIONSHIP"), where).toBe(
              true,
            );
            expect(upper.includes("ROUND 3"), where).toBe(show("fixture.round"));
            expect(html.includes("https://crest.test/rmd.png"), where).toBe(
              show("fixture.oppositionCrest"),
            );
            expect(html.includes("https://s.test/team.png"), where).toBe(
              show("fixture.teamSponsor"),
            );
            expect(html.includes(teamPhoto.url), where).toBe(show("fixture.photo"));
            // Optional data (P5): shown exactly when its field is on; one line each.
            expect(upper.includes("12TH"), where).toBe(show("fixture.ladder"));
            expect(upper.includes("13TH"), where).toBe(show("fixture.ladder"));
            expect(text.includes(OPTIONAL_DATA.lastMeeting.line), where).toBe(
              show("fixture.lastMeeting"),
            );
            expect(text.includes(OPTIONAL_DATA.milestoneWatch.line), where).toBe(
              show("fixture.milestoneWatch"),
            );
            for (const line of doc.querySelectorAll("[data-content-line]"))
              expect(line.innerHTML, `${where}: one line`).toMatch(/white-space:nowrap/);
            // The raw register name never prints; the short name does, uncut.
            expect(text, where).not.toContain("Cricket Club Inc");
            const boxes = [...doc.querySelectorAll("[data-fit]")];
            expect(boxes.length, where).toBeGreaterThan(0);
            for (const box of boxes) {
              const value = (box.textContent ?? "").trim();
              const capacity = Number(box.getAttribute("data-fit"));
              expect(
                fitsWithoutEllipsis(value, capacity),
                `${where}: "${value}" in ${capacity}`,
              ).toBe(true);
            }
          }
          if (slide.id === "sponsors") {
            expect(html, where).toContain("https://s.test/club.png");
            // P6 options: each block shows exactly when its field is on.
            expect(html.includes("https://s.test/team.png"), where).toBe(
              show("sponsors.teamSponsors"),
            );
            expect(html.includes('data-weekend-sponsor-grid="major"'), where).toBe(
              show("sponsors.tiers"),
            );
            expect(text.includes("THANK YOU TO OUR SPONSORS"), where).toBe(
              show("sponsors.thankYou"),
            );
            expect(text.includes("SUPPORT THE BUSINESSES THAT SUPPORT US"), where).toBe(
              show("sponsors.thankYou"),
            );
            expect(text.includes("OUR SPONSORS"), where).toBe(true);
            expect(text.includes("NEXT HOME GAME"), where).toBe(show("sponsors.nextHomeGame"));
            expect(text.includes("SAT 17 OCT"), where).toBe(show("sponsors.nextHomeGame"));
            expect(text.includes("@ourcricketclubofficial"), where).toBe(
              show("sponsors.nextHomeGame"),
            );
            expect(html.includes(backgroundPhoto.url), where).toBe(show("sponsors.background"));
            for (const box of doc.querySelectorAll("[data-fit]")) {
              const value = (box.textContent ?? "").trim();
              const capacity = Number(box.getAttribute("data-fit"));
              expect(
                fitsWithoutEllipsis(value, capacity),
                `${where}: "${value}" in ${capacity}`,
              ).toBe(true);
            }
          }
        }
      },
    );
  });
});

describe("hidden fields leave no gaps", () => {
  it("Minimal drops the round line and its separator in both packs", () => {
    const [, fixtureSlide] = slidesFor("minimal");
    for (const packId of CONTENT_PACK_IDS) {
      const html = renderPackCard(
        fixtureSlide.input,
        "square",
        fixtureSlide.sponsorsOn,
        resolveCardTokens({ junior: false, data: fixtureSlide.data, packId }),
        false,
        fixtureSlide.data,
        packId,
      );
      expect(html).not.toMatch(/SAT 10 OCT\s*·\s*</);
    }
  });
});

describe("optional data with nothing to say leaves no box", () => {
  it("a visible data field without data drops its line and its label in both packs", () => {
    const bare = {
      [fixture.id]: matchDayFixtureContent({
        ...fixture,
        roundLabel: fixture.roundLabel ?? null,
        opponentLogoUrl: fixture.opponentLogoUrl ?? null,
        venue: fixture.venue ?? null,
        startAt: new Date(fixture.startAt),
      }) as unknown as Record<string, unknown>,
    };
    const teams = createTeamSlides([fixture], [teamPhoto], bare);
    const slides = buildWeekendSlides(
      teams,
      [teamPhoto],
      { ...bundle, settings: { ...bundle.settings, livestreamUrl: null } } as SocialSettingsBundle,
      "Round three",
      "2026-10-09",
      "2026-10-11",
      "Australia/Perth",
      undefined,
      presetFields("matchDay", "full"),
    );
    for (const packId of CONTENT_PACK_IDS)
      for (const slide of slides) {
        const html = renderPackCard(
          slide.input,
          "square",
          slide.sponsorsOn,
          resolveCardTokens({ junior: false, data: slide.data, packId }),
          false,
          slide.data,
          packId,
        );
        expect(html, `${packId} ${slide.id}`).not.toMatch(/LAST MET|LADDER|WATCH LIVE|TBC/);
        expect(html, `${packId} ${slide.id}`).not.toContain("data-content-line");
        expect(html, `${packId} ${slide.id}`).not.toContain("data-ladder-place");
      }
  });
});

/**
 * The junior day slides (P3): every pack × preset × size at its declared
 * capacity, with worst-case names. Every row prints, every name box fits its
 * declared capacity under the shared name-fit rule, and hidden fields stay
 * hidden.
 */
const juniorFixture = (i: number) =>
  matchDayFixtureContent(
    {
      ...fixture,
      id: 100 + i,
      grade: "Under 17 Girls",
      roundLabel: fixture.roundLabel ?? null,
      opponentName: i % 2 ? LONG_OPPONENT : "Secret Harbour Comets Cricket Club",
      opponentLogoUrl: `https://crest.test/${i}.png`,
      venue: fixture.venue ?? null,
      startAt: new Date(`2026-10-10T0${i % 4}:30:00Z`),
      isHome: i % 2 === 0,
    },
    {
      junior: true,
      juniorTeamName: "Blue Thunder",
      gradeLabel: "Under 17 Girls Development — Blue Thunder",
    },
  );

function renderDay(input: Record<string, unknown>, size: CardSize, packId: string) {
  const data = buildPackData({ brand: bundle.brand, hashtag: "#OURCLUB" });
  const html = renderPackCard(
    input as unknown as ShareCardInput,
    size,
    false,
    resolveCardTokens({ junior: true, data, packId }),
    true,
    data,
    packId,
  );
  return { html, doc: new DOMParser().parseFromString(html, "text/html") };
}

function expectNamesFit(doc: Document, where: string) {
  const boxes = [...doc.querySelectorAll("[data-fit]")];
  expect(boxes.length, where).toBeGreaterThan(0);
  for (const box of boxes) {
    const value = (box.textContent ?? "").trim();
    const capacity = Number(box.getAttribute("data-fit"));
    expect(fitsWithoutEllipsis(value, capacity), `${where}: "${value}" in ${capacity}`).toBe(true);
  }
}

describe.each(CONTENT_PACK_IDS)("junior day fit grid: %s", (packId) => {
  describe.each(CONTENT_PRESETS)("Match Day, %s preset", (preset) => {
    const visible = presetFields("matchDay", preset);
    it.each(CONTENT_LAYOUT_SIZES)("lays out a full day at %s", (size) => {
      const n = contentCapacity(packId, "matchDay", size, preset);
      const day = matchDayDayContent(Array.from({ length: n }, (_, i) => juniorFixture(i)));
      const { html, doc } = renderDay(contentInput(day, visible), size, packId);
      const where = `${packId} ${preset} ${size}`;
      expect(html, where).not.toContain("{{");
      expect(html, where).not.toMatch(SAMPLES);
      expect(doc.querySelectorAll("[data-day-row]").length, where).toBe(n);
      const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").toUpperCase();
      expect(text, where).toContain("SAT 10 OCT");
      expect(text, where).toContain("ROCKINGHAM MANDURAH DISTRICTS");
      expect(text, where).toContain("SECRET HARBOUR COMETS");
      expect(text, where).not.toContain("CRICKET CLUB");
      // Ground, side and round on one line, joined by a real middle dot (never a replacement glyph).
      expect(text, where).toContain("OVAL 2 · AWAY");
      expect(text, where).not.toContain("\uFFFD");
      expect(text.includes("ROUND 3"), where).toBe(visible.has("fixture.round"));
      expect(html.includes("https://crest.test/0.png"), where).toBe(
        visible.has("fixture.oppositionCrest"),
      );
      expectNamesFit(doc, where);
    });
  });

  it.each(CONTENT_LAYOUT_SIZES)("Results: lays out a full day at %s", (size) => {
    const n = dayCapacity(packId, "results", size, "standard");
    const results = Array.from({ length: n }, (_, i) =>
      dayResultRow({
        matchTitle: "Under 17 Girls • Round 3",
        grade: "Under 17 Girls Development",
        result: "Rockingham Mandurah Districts won by 112 runs",
        resultWinner: i % 2 ? "opposition" : "club",
        opposition: {
          name: LONG_OPPONENT,
          primaryColor: "",
          secondaryColor: "",
          textColor: "",
          logoUrl: `https://crest.test/r${i}.png`,
        },
        innings: [
          {
            teamKey: "club",
            inningsNum: 1,
            totalRuns: "212",
            wickets: "10",
            overs: "40",
            topBatters: [],
            topBowlers: [],
          },
          {
            teamKey: "opposition",
            inningsNum: 1,
            totalRuns: "213",
            wickets: "9",
            overs: "39.5",
            topBatters: [],
            topBowlers: [],
          },
        ],
        junior: true,
      }),
    );
    const input = {
      kind: "matchSummary",
      matchTitle: "Under 17 Girls • Round 3",
      result: "",
      resultWinner: "club",
      club: { name: "Our Cricket Club", primaryColor: "", secondaryColor: "", textColor: "" },
      opposition: { name: LONG_OPPONENT, primaryColor: "", secondaryColor: "", textColor: "" },
      innings: [],
      junior: true,
      carouselDay: { heading: dayHeading("2026-10-10"), results },
    };
    const { html, doc } = renderDay(input, size, packId);
    const where = `${packId} results ${size}`;
    expect(html, where).not.toContain("{{");
    expect(html, where).not.toMatch(SAMPLES);
    expect(doc.querySelectorAll("[data-day-row]").length, where).toBe(n);
    const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").toUpperCase();
    for (const v of [
      "SAT 10 OCT",
      "10/212",
      "9/213",
      "WIN",
      "RESULT",
      "ROCKINGHAM MANDURAH DISTRICTS",
    ])
      expect(text, `${where}: ${v}`).toContain(v);
    expect(text, where).not.toContain("CRICKET CLUB INC");
    expect(html, where).toContain("https://crest.test/r0.png");
    expectNamesFit(doc, where);
  });
});
