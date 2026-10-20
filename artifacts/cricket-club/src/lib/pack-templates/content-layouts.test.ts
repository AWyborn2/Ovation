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
  matchDayFixtureContent,
  presetFields,
  type ContentPreset,
} from "@workspace/scorecard/card-content";
import { renderPackCard, resolveCardTokens } from "@/lib/pack-render";
import { MIN_FIT, balancedLongestLine } from "@/lib/pack-render/name-fit";
import { buildWeekendSlides, createTeamSlides } from "@/components/weekend-carousel/model";
import {
  CONTENT_LAYOUT_SIZES,
  CONTENT_PACK_IDS,
  contentCapacity,
  contentLayout,
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
const content = {
  [fixture.id]: matchDayFixtureContent({
    ...fixture,
    roundLabel: fixture.roundLabel ?? null,
    opponentLogoUrl: fixture.opponentLogoUrl ?? null,
    venue: fixture.venue ?? null,
    startAt: new Date(fixture.startAt),
  }) as unknown as Record<string, unknown>,
};
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
const coverPhoto: ClubPhoto = { ...teamPhoto, id: 6, grade: null, season: 2026, url: "https://photos.test/cover.jpg" };
const bundle = {
  settings: { sponsorsEnabled: true, clubHashtag: "#OURCLUB" },
  brand: { name: "Our Cricket Club", primaryColour: "#009900", backgroundColour: "#001122" },
  activeSponsors: [
    { name: "Presenting Partner", logoUrl: "https://s.test/presenting.png", isPresenting: true },
    { name: "Team Partner", logoUrl: "https://s.test/team.png", grades: [fixture.grade] },
    { name: "Club Partner", logoUrl: "https://s.test/club.png" },
  ],
} as unknown as SocialSettingsBundle;

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
    { selection: { photoId: coverPhoto.id, transform: { focalX: 0.5, focalY: 0.5, zoom: 1 } }, photos: [coverPhoto] },
    presetFields("matchDay", preset),
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

  it("declares one fixture per slide at every size and preset (junior days share a slide in P3)", () => {
    for (const packId of CONTENT_PACK_IDS)
      for (const size of CONTENT_LAYOUT_SIZES)
        for (const preset of CONTENT_PRESETS)
          expect(contentCapacity(packId, "matchDay", size, preset)).toBe(1);
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

    it.each(CONTENT_LAYOUT_SIZES)("renders every slide at %s with only its visible fields", (size) => {
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
        }
        if (slide.id === "fixture-1") {
          const upper = text.toUpperCase();
          for (const value of ["ROCKINGHAM MANDURAH DISTRICTS", "SAT 10 OCT", "10:00 AM", "AWAY"])
            expect(upper, `${where}: ${value}`).toContain(value);
          expect(upper.includes("MIKE BARNETT SPORTS COMPLEX OVAL 2"), where).toBe(true);
          expect(upper.includes("WESTERN DISTRICT FEMALE PREMIER CHAMPIONSHIP"), where).toBe(true);
          expect(upper.includes("ROUND 3"), where).toBe(show("fixture.round"));
          expect(html.includes("https://crest.test/rmd.png"), where).toBe(
            show("fixture.oppositionCrest"),
          );
          expect(html.includes("https://s.test/team.png"), where).toBe(show("fixture.teamSponsor"));
          expect(html.includes(teamPhoto.url), where).toBe(show("fixture.photo"));
          // The raw register name never prints; the short name does, uncut.
          expect(text, where).not.toContain("Cricket Club Inc");
          const boxes = [...doc.querySelectorAll("[data-fit]")];
          expect(boxes.length, where).toBeGreaterThan(0);
          for (const box of boxes) {
            const value = (box.textContent ?? "").trim();
            const capacity = Number(box.getAttribute("data-fit"));
            expect(fitsWithoutEllipsis(value, capacity), `${where}: "${value}" in ${capacity}`).toBe(
              true,
            );
          }
        }
        if (slide.id === "sponsors") {
          expect(html, where).toContain("https://s.test/club.png");
        }
      }
    });
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
