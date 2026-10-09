import { describe, expect, it } from "vitest";
import {
  addLayerToSizes,
  documentRowsCapacity,
  emptySizes,
  layerOnSize,
  layersForSize,
  placeBoxOnSize,
  rowsCapacity,
  sizesWithLayers,
  type TemplateLayerBase,
} from "./document";

const layer = (over: Partial<TemplateLayerBase> = {}): TemplateLayerBase => ({
  id: "a",
  kind: "text",
  geometry: { square: { x: 10, y: 10, w: 20, h: 20 } },
  ...over,
});

describe("per-size presence", () => {
  it("treats a layer with no sizes as on every size", () => {
    expect(layerOnSize(layer(), "story")).toBe(true);
  });

  it("limits a layer with sizes to those sizes", () => {
    const l = layer({ sizes: ["square"] });
    expect(layerOnSize(l, "square")).toBe(true);
    expect(layerOnSize(l, "story")).toBe(false);
  });

  it("lists layers per size and the sizes that are empty", () => {
    const doc = {
      layers: [
        layer({ id: "a", sizes: ["square"] }),
        layer({ id: "b", sizes: ["square", "portrait"] }),
      ],
    };
    expect(layersForSize(doc, "square").map((l) => l.id)).toEqual(["a", "b"]);
    expect(sizesWithLayers(doc)).toEqual(["square", "portrait"]);
    expect(emptySizes(doc)).toEqual(["story", "landscape"]);
  });

  it("reports every size empty for a document with no layers", () => {
    expect(emptySizes({})).toEqual(["square", "portrait", "story", "landscape"]);
  });
});

describe("placeBoxOnSize", () => {
  it("returns the same box on the same size", () => {
    expect(placeBoxOnSize({ x: 1, y: 2, w: 3, h: 4 }, "square", "square")).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    });
  });

  it("keeps the centre and the pixel aspect ratio from square to story", () => {
    const box = placeBoxOnSize({ x: 40, y: 40, w: 20, h: 20 }, "square", "story");
    // A 216x216px logo stays square: 20% of 1080 wide, 11.25% of 1920 tall.
    expect(box.w).toBeCloseTo(20);
    expect(box.h).toBeCloseTo(11.25);
    expect(box.x + box.w / 2).toBeCloseTo(50);
    expect(box.y + box.h / 2).toBeCloseTo(50);
  });

  it("scales down onto a smaller landscape canvas and stays inside it", () => {
    const box = placeBoxOnSize({ x: 0, y: 80, w: 100, h: 20 }, "square", "landscape");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.h).toBeLessThanOrEqual(100);
    expect(box.x + box.w).toBeLessThanOrEqual(100);
  });

  it("keeps rotation", () => {
    expect(
      placeBoxOnSize({ x: 0, y: 0, w: 10, h: 10, rotate: 15 }, "square", "portrait").rotate,
    ).toBe(15);
  });
});

describe("addLayerToSizes", () => {
  it("places the layer on each target size and drops `sizes` once it is everywhere", () => {
    const next = addLayerToSizes(layer({ sizes: ["square"] }), "square", [
      "portrait",
      "story",
      "landscape",
    ]);
    expect(next.sizes).toBeUndefined();
    expect(Object.keys(next.geometry).sort()).toEqual(["landscape", "portrait", "square", "story"]);
  });

  it("leaves a size that already has the layer alone", () => {
    const own = { x: 70, y: 70, w: 5, h: 5 };
    const start = layer({
      sizes: ["square", "portrait"],
      geometry: { square: { x: 0, y: 0, w: 20, h: 20 }, portrait: own },
    });
    const next = addLayerToSizes(start, "square", ["portrait", "story"]);
    expect(next.geometry.portrait).toEqual(own);
    expect(next.sizes).toEqual(["square", "portrait", "story"]);
  });

  it("does nothing when the source size has no box", () => {
    const start = layer({ sizes: ["portrait"], geometry: {} });
    expect(addLayerToSizes(start, "square", ["story"])).toBe(start);
  });
});

describe("rows capacity", () => {
  const rowsLayer = (h: number): TemplateLayerBase =>
    layer({
      kind: "rows",
      geometry: { square: { x: 0, y: 0, w: 100, h } },
      rows: { repeat: "rows", rowHeight: 10, cells: [] },
    });

  it("fits five 10%-high rows in a 50%-tall square layer", () => {
    expect(rowsCapacity(rowsLayer(50), "square")).toBe(5);
  });

  it("accounts for the gap between rows", () => {
    const l = rowsLayer(50);
    l.rows!.gap = 2.5;
    // (540 + 27) / (108 + 27) = 4.2
    expect(rowsCapacity(l, "square")).toBe(4);
  });

  it("is zero on a size without a box or when the layer isn't on that size", () => {
    expect(rowsCapacity(rowsLayer(50), "story")).toBe(0);
    expect(rowsCapacity({ ...rowsLayer(50), sizes: ["portrait"] }, "square")).toBe(0);
  });

  it("finds the document capacity for a repeat key, or null when there is no rows layer", () => {
    const doc = { layers: [rowsLayer(50)] };
    expect(documentRowsCapacity(doc, "square", "rows")).toBe(5);
    expect(documentRowsCapacity(doc, "square", "leaders")).toBeNull();
  });
});
