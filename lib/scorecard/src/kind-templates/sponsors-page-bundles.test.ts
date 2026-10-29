/**
 * Every look's Match Day sponsors page (Halls Head, Oct 2026): its sponsors
 * are one tiled grid (`rows.layout: "tiles"`) that grows into the next home
 * game's space when there's no game, "NEXT HOME GAME" prints only with a game,
 * and the page carries no footer strip repeating its own sponsors.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseDocument } from "./normalise";
import { flattenLayers, type TemplateLayerV2 } from "./format";

const BUNDLES = path.resolve(__dirname, "../../../template-bundles");

function sponsorsPages(): Array<{ look: string; layers: TemplateLayerV2[] }> {
  const out: Array<{ look: string; layers: TemplateLayerV2[] }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const file = path.join(BUNDLES, look, "matchDay.json");
    if (!statSync(path.join(BUNDLES, look)).isDirectory() || !existsSync(file)) continue;
    const doc = normaliseDocument(
      (JSON.parse(readFileSync(file, "utf8")) as { document: unknown }).document,
      "matchDay",
    );
    const page = doc.pages?.sponsors;
    if (page) out.push({ look, layers: flattenLayers(page.layers) });
  }
  return out;
}

const content = (l: TemplateLayerV2) => ("content" in l ? String(l.content ?? "") : "");

describe("Match Day sponsors pages", () => {
  const pages = sponsorsPages();

  it("finds the looks", () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  for (const { look, layers } of pages) {
    it(`${look}: a tiled grid, no fixed slots, no footer strip`, () => {
      const tiles = layers.filter((l) => l.kind === "rows" && l.rows?.layout === "tiles");
      expect(tiles.length).toBeGreaterThanOrEqual(1);
      for (const t of tiles) expect(t.kind === "rows" && t.rows.repeat).toBe("sponsors");
      expect(layers.filter((l) => /\{\{weekendSponsor\d+\}\}/.test(content(l)))).toEqual([]);
      expect(layers.filter((l) => /^[^{}]*\bBY\s*$/i.test(content(l)))).toEqual([]);
    });

    it(`${look}: "NEXT HOME GAME" only with a game; every box has an area`, () => {
      for (const l of layers.filter((x) => /^\s*NEXT HOME GAME\s*$/i.test(content(x))))
        expect(l.showWhen?.field).toBe("nextHomeMatch");
      for (const l of layers)
        for (const box of Object.values(l.geometry)) {
          expect(box!.w).toBeGreaterThan(0);
          expect(box!.h).toBeGreaterThan(0);
        }
    });

    it(`${look}: with or without a game, the grid ends above the call to action`, () => {
      const tiles = layers.filter((l) => l.kind === "rows" && l.rows?.layout === "tiles");
      const ctas = layers.filter((l) => content(l).includes("{{sponsorCta}}"));
      for (const t of tiles)
        for (const cta of ctas) {
          // Only a grid and a call to action that can show together.
          const clash =
            (t.showWhen?.field && cta.showWhen?.noField === t.showWhen.field) ||
            (t.showWhen?.noField && cta.showWhen?.field === t.showWhen.noField);
          if (clash) continue;
          for (const [size, box] of Object.entries(t.geometry)) {
            const c = cta.geometry[size as keyof typeof cta.geometry];
            if (!c || (cta.sizes && !cta.sizes.includes(size as never))) continue;
            expect(box!.y + box!.h).toBeLessThanOrEqual(c.y + 0.01);
          }
        }
    });
  }
});
