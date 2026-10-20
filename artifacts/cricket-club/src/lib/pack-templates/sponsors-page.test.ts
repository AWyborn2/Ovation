/**
 * The sponsors page layout (ADR-010 P6): the logo grid's size, flat and
 * tiered, and the room the optional blocks take from it. The worst case (many
 * sponsors, three major, every block on) renders in both packs at every size
 * and every logo stays a legible size.
 */
import { describe, expect, it } from "vitest";
import { renderPackCard, resolveCardTokens } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import {
  FLAT_SPONSORS_PAGE,
  MAJOR_SCALE,
  sponsorGridHeight,
  sponsorGridMetrics,
  sponsorsPageLayout,
} from "./sponsors-page";
import { CONTENT_LAYOUT_SIZES, CONTENT_PACK_IDS } from "./content-layouts";
import { buildPackData } from "@/lib/pack-card-data";

const budget = { thankYou: 4, cta: 5, nextHome: 13, socials: 5, minGrid: 18 };
const flatCols = (n: number) => (n <= 2 ? Math.max(n, 1) : n === 4 ? 2 : n <= 9 ? 3 : 4);

describe("sponsor grid sizing", () => {
  it("no optional block leaves the grid its full height", () => {
    expect(sponsorGridHeight(48, { count: 5, ...FLAT_SPONSORS_PAGE }, budget)).toBe(48);
  });

  it("each block takes its share, down to the floor", () => {
    const all = {
      count: 5,
      majorCount: 0,
      thankYou: true,
      cta: true,
      nextHome: true,
      socials: true,
    };
    expect(sponsorGridHeight(70, all, budget)).toBe(70 - 27);
    expect(sponsorGridHeight(40, all, budget)).toBe(18);
    expect(sponsorGridHeight(48, { ...all, cta: false, socials: false }, budget)).toBe(31);
  });

  it("a flat grid is the page as it was, for every sponsor count", () => {
    for (let count = 1; count <= 24; count++) {
      const cols = flatCols(count);
      const rows = Math.ceil(count / cols);
      const tile = Math.max(1, (48 - Math.max(0, rows - 1) * 1.5) / Math.max(rows, 1));
      const { major, standard } = sponsorGridMetrics({
        count,
        majorCount: 0,
        height: 48,
        gap: 1.5,
        cols: flatCols,
        majorCols: 3,
      });
      expect(major).toBeNull();
      expect(standard).toEqual({
        cols,
        rows,
        tileHeight: tile,
        width: tile * 2 * cols + (cols - 1) * 1.5,
      });
    }
  });

  it("a tiered grid prints major tiles larger and stays inside its height", () => {
    for (let count = 1; count <= 20; count++)
      for (let majorCount = 1; majorCount <= Math.min(count, 4); majorCount++) {
        const height = 40;
        const { major, standard } = sponsorGridMetrics({
          count,
          majorCount,
          height,
          gap: 1.5,
          cols: flatCols,
          majorCols: 2,
        });
        expect(major!.cols * major!.rows).toBeGreaterThanOrEqual(majorCount);
        const used =
          major!.rows * major!.tileHeight +
          (major!.rows - 1) * 1.5 +
          (standard ? standard.rows * standard.tileHeight + standard.rows * 1.5 : 0);
        expect(used).toBeLessThanOrEqual(height + 1e-9);
        if (standard) expect(major!.tileHeight / standard.tileHeight).toBeCloseTo(MAJOR_SCALE);
        else expect(standard).toBeNull();
      }
  });

  it("caps a grid at the pack's maximum width", () => {
    const { standard } = sponsorGridMetrics({
      count: 2,
      majorCount: 0,
      height: 74,
      gap: 1.5,
      cols: flatCols,
      majorCols: 2,
      maxWidth: 96,
    });
    expect(standard!.width).toBe(96);
  });

  it("reads the layout from a card input, clamping the major count", () => {
    expect(
      sponsorsPageLayout({ sponsors: [1, 2], majorCount: 5, thankYou: "x", socials: "" }),
    ).toEqual({
      count: 2,
      majorCount: 2,
      thankYou: true,
      cta: false,
      nextHome: false,
      socials: false,
    });
  });
});

describe("worst-case sponsors page", () => {
  const sponsors = Array.from({ length: 16 }, (_, i) => ({
    name: `Partner ${i}`,
    logoUrl: `https://s.test/p${i}.png`,
  }));
  const input = {
    kind: "matchDay",
    roundLabel: "ROUND 3",
    oppositionName: "",
    homeAway: "HOME",
    venue: "",
    date: "FRI 9 OCT – SUN 11 OCT",
    startTime: "",
    namesResolved: true,
    carouselPage: {
      page: "sponsors",
      title: "Round three",
      fixtureCount: 12,
      sponsors,
      majorCount: 3,
      thankYou: "THANK YOU TO OUR SPONSORS",
      cta: "SUPPORT THE BUSINESSES THAT SUPPORT US",
      nextHome: {
        match: "Western District Female Premier Championship v Rockingham Mandurah Districts",
        when: "SAT 17 OCT · 10:00 AM · Mike Barnett Sports Complex Oval 2",
      },
      socials: "@ourcricketclubofficial · Our Cricket Club Official · ourcricketclub.com.au",
      hasCoverPhoto: true,
    },
  } as unknown as ShareCardInput;
  const data = buildPackData({
    brand: { name: "Our Cricket Club", primaryColour: "#009900", backgroundColour: "#001122" },
    photoUrl: "https://photos.test/bg.jpg",
  } as Parameters<typeof buildPackData>[0]);

  /** Tile height (cqmin) of a grid, from its max width and column count. */
  function tileHeights(html: string, role: string, inner: number): number[] {
    const grid = html.match(
      new RegExp(`data-weekend-sponsor-grid="${role}" style="[^"]*max-width:([\\d.]+)cqmin`),
    );
    const tile = html
      .slice(html.indexOf(`data-weekend-sponsor-grid="${role}"`))
      .match(/flex:0 0 calc\(\(100% - ([\d.]+)cqmin\) \/ (\d+)\)/);
    if (!grid || !tile) return [];
    const width = Math.min(Number(grid[1]), inner);
    return [(width - Number(tile[1])) / Number(tile[2]) / 2];
  }

  it.each(CONTENT_PACK_IDS)("%s keeps every logo legible at every size", (packId) => {
    for (const size of CONTENT_LAYOUT_SIZES) {
      const html = renderPackCard(
        input,
        size,
        false,
        resolveCardTokens({ junior: false, data, packId }),
        false,
        data,
        packId,
      );
      const where = `${packId} ${size}`;
      for (let i = 0; i < 16; i++) expect(html, where).toContain(`https://s.test/p${i}.png`);
      expect(html, where).toContain("https://photos.test/bg.jpg");
      expect(html, where).not.toContain("{{");
      const inner = size === "landscape" ? 150 : 88;
      const [major] = tileHeights(html, "major", inner);
      const [standard] = tileHeights(html, "standard", inner);
      expect(major, where).toBeGreaterThan(standard);
      expect(standard, `${where}: standard tile ${standard}cqmin`).toBeGreaterThanOrEqual(3);
    }
  });
});
