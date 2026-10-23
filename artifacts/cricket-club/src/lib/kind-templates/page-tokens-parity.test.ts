/**
 * The carousel pages' token catalogues (`page-tokens.ts`, T1.4) against what
 * the renderer binds for a carousel slide: every text field, image and
 * repeat a title, day or sponsors page lists is bound, so a template box on
 * that page never falls back to a sample or stays empty by mistake.
 */
import { describe, expect, it } from "vitest";
import { pageTokens, type PageKey } from "@workspace/scorecard/kind-templates";
import { applyPackData, bindInput } from "@/lib/pack-render/bind";
import type { PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";

const DATA: PackCardData = {
  brand: { name: "Sample Cricket Club", tagline: "Est. 1979", logoUrl: "https://x.org/c.png" },
  hashtag: "#SAMPLECC",
  presentingSponsorName: "Coastal Plumbing",
  photoUrl: "https://x.org/p.jpg",
};

const SLIDES: Array<{ kind: string; page: PageKey; input: ShareCardInput }> = [
  {
    kind: "matchDay",
    page: "title",
    input: {
      kind: "matchDay",
      roundLabel: "Round 5",
      oppositionName: "",
      homeAway: "HOME",
      venue: "",
      date: "Sat 14 – Sun 15 Dec",
      startTime: "",
      namesResolved: true,
      carouselPage: {
        page: "title",
        title: "Match Day",
        fixtureCount: 6,
        sponsors: [],
        livestream: "club.tv/live",
      },
    } as unknown as ShareCardInput,
  },
  {
    kind: "matchDay",
    page: "sponsors",
    input: {
      kind: "matchDay",
      roundLabel: "",
      oppositionName: "",
      homeAway: "HOME",
      venue: "",
      date: "Sat 14 – Sun 15 Dec",
      startTime: "",
      namesResolved: true,
      carouselPage: {
        page: "sponsors",
        title: "Match Day",
        fixtureCount: 6,
        sponsors: [
          { name: "Coastal Plumbing", logoUrl: "https://x.org/s1.png" },
          { name: "Harbour Motors", logoUrl: "https://x.org/s2.png" },
        ],
        majorCount: 1,
        thankYou: "Thanks to our sponsors",
        cta: "Support those who support us",
        nextHome: { match: "A Grade v Rockingham", when: "Sat 21 Dec" },
        socials: "@sampleclub",
      },
    } as unknown as ShareCardInput,
  },
  {
    kind: "matchDay",
    page: "day",
    input: {
      kind: "matchDay",
      roundLabel: "",
      oppositionName: "",
      homeAway: "HOME",
      venue: "",
      date: "Sat 14 Dec",
      startTime: "",
      junior: true,
      namesResolved: true,
      carouselDay: {
        heading: "SAT 14 DEC",
        fixtures: [
          {
            grade: "U13 Blue",
            opposition: "Rockingham",
            crestUrl: "https://x.org/o.png",
            monogram: "R",
            homeAway: "HOME",
            venue: "Sample Oval",
            startTime: "8:30",
            roundLabel: "Round 5",
          },
        ],
      },
    } as unknown as ShareCardInput,
  },
  {
    kind: "matchSummary",
    page: "day",
    input: {
      kind: "matchSummary",
      matchTitle: "U13 Blue",
      result: "Won by 4 wickets",
      resultWinner: "club",
      club: { name: "Sample", logoUrl: null },
      opposition: { name: "Rockingham", logoUrl: null },
      innings: [],
      junior: true,
      namesResolved: true,
      carouselDay: {
        heading: "SAT 14 DEC",
        results: [
          {
            grade: "U13 Blue",
            opposition: "Rockingham",
            crestUrl: "https://x.org/o.png",
            clubScore: "6/112",
            oppositionScore: "9/108",
            resultWord: "WIN",
            result: "Won by 4 wickets",
            winner: "club",
          },
        ],
      },
    } as unknown as ShareCardInput,
  },
];

/** Tokens the renderer adds after binding: the monogram from the club's name. */
const DERIVED = new Set(["clubMonogram"]);

describe("carousel page tokens are what the renderer binds", () => {
  it.each(SLIDES)("$kind $page", ({ kind, page, input }) => {
    const cat = pageTokens(kind, page)!;
    const bound = bindInput(input, null, null);
    applyPackData(bound, DATA, input.kind);
    for (const field of cat.fields) {
      if (DERIVED.has(field.key)) continue;
      expect(Object.keys(bound.values), `${page}: {{${field.key}}}`).toContain(field.key);
    }
    // Positional sponsor logos are bound for the sponsors the page has, as sponsor1–3 are.
    const sponsorCount =
      (input as { carouselPage?: { sponsors?: unknown[] } }).carouselPage?.sponsors?.length ?? 0;
    for (const image of cat.images) {
      const position = /^weekendSponsor(\d+)$/.exec(image.key);
      if (position && Number(position[1]) >= sponsorCount) continue;
      expect(Object.keys(bound.images), `${page}: image ${image.key}`).toContain(image.key);
    }
    for (const repeat of cat.repeats) {
      const rows = bound.rows[repeat.key];
      expect(rows?.length, `${page}: repeat ${repeat.key}`).toBeGreaterThan(0);
      for (const row of rows ?? []) {
        expect(Object.keys(row.values).sort()).toEqual(repeat.fields.map((f) => f.key).sort());
        if (row.variant) expect(repeat.variants).toContain(row.variant);
      }
    }
  });

  it("marks the major sponsors and each junior result's outcome", () => {
    const sponsors = bindInput(SLIDES[1].input, null, null).rows.sponsors;
    expect(sponsors.map((r) => r.variant)).toEqual(["major", undefined]);
    const day = bindInput(SLIDES[3].input, null, null).rows.dayRows;
    expect(day.map((r) => r.variant)).toEqual(["won"]);
  });
});
