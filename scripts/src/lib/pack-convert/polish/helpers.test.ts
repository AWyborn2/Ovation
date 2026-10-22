import { describe, expect, it } from "vitest";
import type {
  RowsLayerV2,
  TemplateDocumentV2,
  TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import {
  capFontToCell,
  chipCell,
  clampPhotoToArtboard,
  gradeOnRoundLine,
  stripesSvg,
  uniformSponsorGrid,
  widenToNextCell,
} from "./helpers";

const doc = (pages: Record<string, TemplateLayerV2[]>): TemplateDocumentV2 => ({
  formatVersion: 2,
  pages: Object.fromEntries(Object.entries(pages).map(([k, layers]) => [k, { layers }])),
});

describe("look polish helpers", () => {
  it("draws diagonal stripes as lines across the whole box", () => {
    const svg = stripesSvg(100, 50, { period: 10, width: 2, colour: "var(--gold)", opacity: 0.08 });
    expect(svg).toContain('viewBox="0 0 100 50"');
    expect(svg).toContain('stroke="var(--gold)"');
    // Lines every 10·√2 along x + y, until past the far corner (150).
    expect((svg.match(/M/g) ?? []).length).toBe(Math.ceil((150 + 14.14) / 14.14));
  });

  it("puts the round line's grade first, and fits it", () => {
    const d = doc({
      fixture: [
        {
          id: "r",
          kind: "text",
          content: "{{roundLabel}}",
          showWhen: { field: "roundLabel" },
          geometry: { square: { x: 0, y: 0, w: 50, h: 5 } },
        },
      ],
    });
    expect(gradeOnRoundLine(d)).toHaveLength(1);
    const [layer] = d.pages.fixture!.layers as Array<TemplateLayerV2 & { content: string }>;
    expect(layer!.content).toBe("{{grade}} · {{roundLabel}}");
    expect(layer!.showWhen).toBeUndefined();
  });

  it("replaces the sponsors page's grid and its tiles with one uniform grid", () => {
    const d = doc({
      sponsors: [
        { id: "tile", kind: "shape", geometry: { portrait: { x: 20, y: 35, w: 10, h: 5 } } },
        {
          id: "grid",
          kind: "rows",
          rows: { repeat: "sponsors", rowHeight: 5, cells: [] },
          geometry: { portrait: { x: 15, y: 32, w: 70, h: 20 } },
        } as TemplateLayerV2,
        { id: "outside", kind: "shape", geometry: { portrait: { x: 0, y: 90, w: 100, h: 5 } } },
      ],
    });
    uniformSponsorGrid(d, {
      region: { portrait: { x: 13.04, y: 31.12, w: 73.91, h: 30.49 } },
      columns: 3,
      rows: 4,
      gapPx: 15,
      tile: "var(--accent-ink)",
      inset: { x: 18, y: 12 },
    });
    const layers = d.pages.sponsors!.layers;
    expect(layers.map((l) => l.id)).toEqual(["sponsors-grid1", "outside"]);
    const grid = layers[0] as RowsLayerV2;
    expect(grid.rows).toMatchObject({ repeat: "sponsors", columns: 3 });
    // Four rows of logos and three gaps fill the region's height.
    const rowPx = (grid.rows.rowHeight / 100) * 1080;
    const gapPx = ((grid.rows.gap ?? 0) / 100) * 1080;
    expect(4 * rowPx + 3 * gapPx).toBeCloseTo((30.49 / 100) * 1350, 0);
  });

  it("draws a result cell as a chip, plain for the listed variants", () => {
    const d = doc({
      card: [
        {
          id: "wrap",
          kind: "rows",
          rows: {
            repeat: "matches",
            rowHeight: 10,
            cells: [{ field: "outcome", x: 90, w: 7, style: { fontSize: 2 } }],
          },
          geometry: { square: { x: 0, y: 0, w: 100, h: 50 } },
        } as TemplateLayerV2,
      ],
    });
    chipCell(d, "matches", "outcome", {
      fill: "var(--gold)",
      padX: 1,
      y: 37,
      h: 26,
      plain: ["lost"],
    });
    const rows = (d.pages.card!.layers[0] as RowsLayerV2).rows;
    expect(rows.cells[0]).toMatchObject({ x: 89, w: 9, y: 37, h: 26 });
    expect(rows.cells[0]!.style).toMatchObject({ background: "var(--gold)", align: "center" });
    expect(rows.variants?.lost?.outcome).toMatchObject({ background: "#00000000" });
  });

  it("runs a text cell to the next cell, and caps its font to the cell's width", () => {
    const d = doc({
      card: [
        {
          id: "wrap",
          kind: "rows",
          rows: {
            repeat: "matches",
            rowHeight: 10,
            cells: [
              { field: "gradeLabel", x: 2, w: 9, h: 30, style: { fontSize: 4.75 } },
              { field: "gradeLabel", x: 0, w: 100, show: "backdrop" },
              { field: "resultLine", x: 16, w: 70, h: 30 },
              { field: "performers", x: 16, w: 70, y: 40, h: 30 },
            ],
          },
          geometry: { portrait: { x: 6, y: 20, w: 88, h: 60 } },
        } as TemplateLayerV2,
      ],
    });
    expect(widenToNextCell(d, "matches", "gradeLabel", 0.6)).toHaveLength(1);
    const cells = (d.pages.card!.layers[0] as RowsLayerV2).rows.cells;
    // To the result line, less the gap; the backdrop behind the row isn't a neighbour.
    expect(cells[0]).toMatchObject({ x: 2, w: 13.4 });
    expect(cells[1]).toMatchObject({ x: 0, w: 100 });
    // 0.34 × 13.4 % of an 88 %-wide layer: 4.01 % of the artboard.
    expect(capFontToCell(d, "matches", "gradeLabel", 0.34)).toHaveLength(1);
    expect(cells[0]!.style?.fontSize).toBe(4.01);
    // Both are idempotent: a second pass changes nothing.
    expect(widenToNextCell(d, "matches", "gradeLabel", 0.6)).toEqual([]);
    expect(capFontToCell(d, "matches", "gradeLabel", 0.34)).toEqual([]);
  });

  it("keeps a photo that bleeds off the card on it, one layer per size, clip moved in", () => {
    const d = doc({
      card: [
        {
          id: "photo",
          kind: "photo",
          style: {
            clip: {
              polygon: [
                [18, 0],
                [100, 0],
                [100, 100],
                [0, 100],
              ],
            },
          },
          geometry: {
            square: { x: 54, y: 54, w: 52, h: 52 },
            portrait: { x: 54, y: 60, w: 46, h: 40 },
          },
        } as TemplateLayerV2,
      ],
    });
    clampPhotoToArtboard(d);
    const layers = d.pages.card!.layers;
    expect(layers.map((l) => [l.id, l.sizes])).toEqual([
      ["photo-square", ["square"]],
      ["photo-portrait", ["portrait"]],
    ]);
    expect(layers[0]!.geometry.square).toEqual({ x: 54, y: 54, w: 46, h: 46 });
    // The slant's top point (18 % of 52 from 54) in the 46-wide box.
    expect(layers[0]!.style?.clip?.polygon[0]).toEqual([20.35, 0]);
    // A size already on the card keeps its box and clip.
    expect(layers[1]!.geometry.portrait).toEqual({ x: 54, y: 60, w: 46, h: 40 });
    expect(layers[1]!.style?.clip?.polygon[0]).toEqual([18, 0]);
  });
});
