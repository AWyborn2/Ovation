import { describe, it, expect } from "vitest";
import {
  renderPackCard,
  resolvePackTokens,
  brandDefaultTokens,
  resolveCardTokens,
  packColourModeFor,
} from "@/lib/pack-render";
import { resolveTemplate } from "./templates";
import { listPackManifests } from "../pack-templates/registry";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";
import { JUNIOR_PANEL } from "./types";
import type { ShareCardInput, MatchSummaryInnings, CardSize } from "@/lib/share-card";

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });
const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];
const team = (name: string) => ({
  name,
  primaryColor: "#123",
  secondaryColor: "#456",
  textColor: "#fff",
});
const inn = (k: "club" | "opposition", n: 1 | 2, runs: string): MatchSummaryInnings => ({
  teamKey: k,
  inningsNum: n,
  totalRuns: runs,
  wickets: "6",
  overs: "50",
  topBatters: [{ name: `Bat${k}${n}`, runs: 71, balls: 90, notOut: true }],
  topBowlers: [{ name: `Bowl${k}${n}`, wickets: 4, runs: 22, overs: "10" }],
});
const innings = [
  inn("club", 1, "201"),
  inn("opposition", 1, "180"),
  inn("club", 2, "150"),
  inn("opposition", 2, "131"),
];
const detail: ShareCardInput = {
  kind: "matchSummary",
  matchTitle: "A Grade",
  result: "Won by 40 runs",
  resultWinner: "club",
  club: team("Halls Head"),
  opposition: team("Mariners"),
  innings,
  carouselDetail: true,
};
const weekend = (page: "title" | "sponsors"): ShareCardInput =>
  ({
    kind: "matchDay",
    roundLabel: "ROUND 5",
    oppositionName: "X",
    homeAway: "HOME",
    venue: "V",
    date: "SAT",
    startTime: "1pm",
    carouselPage: {
      page,
      title: "Big Weekend",
      fixtureCount: 4,
      hasCoverPhoto: true,
      sponsors: [1, 2, 3, 4, 5].map((i) => ({ name: `S${i}`, logoUrl: `https://x/${i}.png` })),
    },
  }) as ShareCardInput;

describe("carousel templates across packs", () => {
  it("renders the six recovered Held numbers, including the twelfth, across packs and formats", () => {
    const numbers = ["77", "18", "39", "102", "75", "105"];
    const input = {
      kind: "teamList",
      grade: "A Grade",
      numbering: "shirt",
      players: [
        ...numbers.map((shirtNumber, i) => ({
          order: i === 5 ? 12 : i + 1,
          surname: `HELD${i}`,
          shirtNumber,
        })),
        { order: 6, surname: "UNNUMBERED" },
      ],
    } as ShareCardInput;
    for (const pack of CAROUSEL_PACK_IDS)
      for (const size of SIZES) {
        const html = renderPackCard(input, size, false, tokens, false, null, pack);
        for (const n of numbers) expect(html, `${pack}/${size}`).toContain(`>${n}<`);
        expect(html).toContain("UNNUMBERED");
      }
  });
  it("renders refreshed playing numbers in every carousel pack and export format without changing frozen inputs", () => {
    const frozen = {
      kind: "teamList",
      grade: "A Grade",
      numbering: "shirt",
      venueDateTime: "Oval · Saturday",
      players: [
        { order: 1, surname: "SMITH", role: "C/WK", shirtNumber: "36" },
        { order: 2, surname: "UNNUMBERED" },
      ],
    } as ShareCardInput;
    const refreshed = {
      ...frozen,
      players: [
        { order: 1, surname: "SMITH", role: "C/WK", shirtNumber: "88" },
        { order: 2, surname: "UNNUMBERED" },
      ],
    } as ShareCardInput;
    for (const pack of CAROUSEL_PACK_IDS)
      for (const size of SIZES) {
        const html = renderPackCard(refreshed, size, false, tokens, false, null, pack);
        expect(html, `${pack}/${size}`).toContain(">88<");
        expect(html, `${pack}/${size}`).not.toContain(">36<");
        expect(html, `${pack}/${size}`).toContain("UNNUMBERED");
        const previous = renderPackCard(frozen, size, false, tokens, false, null, pack);
        expect(previous, `${pack}/${size} frozen`).toContain(">36<");
        expect(previous, `${pack}/${size} frozen`).not.toContain(">88<");
      }
  });
  it("validates exactly the registered built-in packs", () => {
    expect([...CAROUSEL_PACK_IDS].sort()).toEqual(
      listPackManifests()
        .map((p) => p.packId)
        .sort(),
    );
  });
  for (const pack of listPackManifests()) {
    it(`${pack.packId}: detail and weekend render in all formats`, () => {
      for (const size of SIZES) {
        const d = renderPackCard(detail, size, false, tokens, false, null, pack.packId);
        expect(d.match(/data-innings="/g)?.length).toBe(4);
        for (const v of ["201", "180", "150", "131", "Batclub1", "Bowlopposition2"])
          expect(d).toContain(v);
        const t = renderPackCard(weekend("title"), size, false, tokens, false, null, pack.packId);
        expect(t).toContain("Big Weekend");
        expect(t).toContain("ROUND 5");
        expect(t).not.toContain("ROUND 1");
        const s = renderPackCard(
          weekend("sponsors"),
          size,
          false,
          tokens,
          false,
          null,
          pack.packId,
        );
        expect(s.match(/data-sponsor-logo-frame="1"/g)?.length).toBe(5);
        expect(s).toContain("aspect-ratio:2 / 1");
      }
    });
    it(`${pack.packId}: frozen covers show mixed rounds, finals or no round in every format`, () => {
      for (const size of SIZES) {
        for (const roundLabel of [
          "MIXED ROUNDS",
          "GRAND FINAL",
          "ROUND 12",
          "PRELIMINARY FINAL — WESTERN DISTRICT CHAMPIONSHIP",
          "WWWWMMMMWWWWMMMMWWWW",
          "",
          undefined,
        ]) {
          const input = JSON.parse(JSON.stringify({ ...weekend("title"), roundLabel }));
          const html = renderPackCard(input, size, false, tokens, false, null, pack.packId);
          const text = new DOMParser().parseFromString(html, "text/html").body.textContent;
          expect(html).not.toContain("ROUND 1<");
          expect(html).not.toContain("{{roundLabel}}");
          if (roundLabel) expect(text).toContain(roundLabel);
          else expect(text).not.toMatch(/\bROUND\b/);
          const label = new DOMParser()
            .parseFromString(html, "text/html")
            .querySelector('[data-carousel-cover-label="1"]');
          expect(label).not.toBeNull();
          expect(label?.textContent).toBe(roundLabel ?? "");
          expect(label?.getAttribute("style")).toContain("max-width:100%");
          expect(label?.getAttribute("style")).toContain("overflow-wrap:anywhere");
          expect(text).toContain("SWIPE");
        }
      }
    });
  }
  it("non Club Kit packs do not use the Club Kit look", () => {
    const html = renderPackCard(detail, "square", false, tokens, false, null, "sunset-v1");
    expect(html).toContain("data-pack-skeleton");
  });
  it("uses frozen per-pack colour choices and the ordinary junior token rules", () => {
    for (const packId of CAROUSEL_PACK_IDS) {
      for (const mode of ["club", "pack"] as const) {
        const data = {
          brand: { name: "Purple Club", primaryColour: "#AB55D1", backgroundColour: "#18243A" },
          packColourModes: { [packId]: mode },
          photoUrl: null,
        };
        const before = JSON.stringify(data);
        expect(packColourModeFor(data, packId)).toBe(packId === "club-kit-v1" ? "club" : mode);
        for (const junior of [false, true]) {
          const resolved = resolveCardTokens({ data, packId, junior });
          if (junior) expect(resolved.panel).toBe(JUNIOR_PANEL);
          for (const size of SIZES) {
            const html = renderPackCard(detail, size, false, resolved, junior, data, packId);
            expect(html).toContain(resolved.accent);
            expect(html.match(/data-innings="/g)).toHaveLength(4);
          }
        }
        expect(JSON.stringify(data)).toBe(before);
      }
    }
  });
  it("absent pack means Club Kit; invalid explicit id throws", () => {
    expect(resolveTemplate(detail)?.kind).toBe("matchSummary");
    expect(() => resolveTemplate(detail, "nope")).toThrow();
    expect(() => resolveTemplate(weekend("title"), "")).toThrow();
    expect(() => resolveTemplate(weekend("title"), "constructor")).toThrow();
  });
});

describe("carouselContent variant", () => {
  const md = (extra: object): ShareCardInput =>
    ({
      kind: "matchDay",
      roundLabel: "R1",
      oppositionName: "X",
      homeAway: "HOME",
      venue: "V",
      date: "SAT",
      startTime: "1pm",
      ...extra,
    }) as ShareCardInput;
  for (const pack of listPackManifests()) {
    it(`${pack.packId}: matchDay contained logos${pack.packId === "club-kit-v1" ? "" : " and photo slot"}`, () => {
      const plain = renderPackCard(md({}), "square", false, tokens, false, null, pack.packId);
      const c = renderPackCard(
        md({ carouselContent: true }),
        "square",
        false,
        tokens,
        false,
        null,
        pack.packId,
      );
      expect(c).not.toMatch(/data-slot-type="logo" data-shape="(circle|rounded)"/);
      if (pack.packId !== "club-kit-v1") {
        expect(plain).not.toContain("data-carousel-photo");
        const withPhoto = renderPackCard(
          md({ carouselContent: true }),
          "square",
          false,
          tokens,
          false,
          { imagesOverride: { photo: "https://x/p.jpg" } } as never,
          pack.packId,
        );
        expect(withPhoto).toContain("https://x/p.jpg");
        expect(withPhoto).toContain("data-carousel-photo");
        const t = resolveTemplate(md({ carouselContent: true }), pack.packId)!;
        expect(t.fields.some((f) => f.key === "photo")).toBe(true);
      }
    });
  }
  it("rejects invalid pack ids", () => {
    expect(() => resolveTemplate(md({ carouselContent: true }), "nope")).toThrow();
    expect(resolveTemplate(md({ carouselContent: true }))?.formats).toEqual(
      resolveTemplate(md({ carouselContent: true }), "club-kit-v1")?.formats,
    );
  });
});
