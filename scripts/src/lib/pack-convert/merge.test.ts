import { describe, expect, it } from "vitest";
import type { TemplateLayerV2, TemplateSize } from "@workspace/scorecard/kind-templates";
import type { PackCapture } from "@workspace/scorecard/pack-capture";
import type { MappedLayer, MapResult } from "./map";
import { applyStacks, flexReproduces, mergePage, paintOrder, type SizeMaps } from "./merge";

const shape = (sig: string, y = 0): MappedLayer => ({
  sig,
  layer: { kind: "shape", style: { fill: "#000000" } } as MappedLayer["layer"],
  box: { x: 0, y, w: 100, h: 10 },
  element: 0,
});
const result = (layers: MappedLayer[]): MapResult => ({
  layers,
  polish: [],
  untokenised: [],
  motion: {},
});
const size = (s: TemplateSize, layers: MappedLayer[], extra: Partial<SizeMaps> = {}): SizeMaps => ({
  size: s,
  base: result(layers),
  baseCapture: {} as PackCapture,
  ...extra,
});

describe("paintOrder", () => {
  it("puts a layer only one size draws where that size painted it", () => {
    expect(
      paintOrder([
        ["bg", "squareBand", "photo", "text"],
        ["bg", "storyBand1", "storyBand2", "photo", "text"],
      ]),
    ).toEqual(["bg", "squareBand", "storyBand1", "storyBand2", "photo", "text"]);
  });

  it("falls back to first-seen order when sizes disagree", () => {
    expect(
      paintOrder([
        ["a", "b", "c"],
        ["a", "c", "b"],
      ]),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("mergePage", () => {
  it("keeps story-only shapes under the photo and header", () => {
    const { layers } = mergePage([
      size("square", [shape("bg"), shape("photo"), shape("header")]),
      size("story", [shape("bg"), shape("band", 50), shape("photo"), shape("header")]),
    ]);
    const both = ["square", "story"];
    expect(layers.map((l) => l.sizes)).toEqual([both, ["story"], both, both]);
    expect(layers[1]!.geometry.story).toEqual({ x: 0, y: 50, w: 100, h: 10 });
  });

  it("paints a no-photo fallback where the capture without the photo drew it", () => {
    const on = [shape("bg"), shape("photo"), shape("text")];
    const off = [shape("bg"), shape("fallback", 20), shape("text")];
    const { layers } = mergePage([
      size("square", on, { photo: { on: result(on), off: result(off) } }),
    ]);
    const fallback = layers.findIndex((l) => l.showWhen?.photo === false);
    expect(fallback).toBe(1);
    expect(layers.map((l) => l.geometry.square?.y)).toEqual([0, 20, 0, 0]);
  });
});

describe("applyStacks", () => {
  const box = { square: { x: 0, y: 0, w: 10, h: 10 } };
  const layer = (id: string) => ({ id, kind: "shape", geometry: box }) as TemplateLayerV2;
  it("nests an inner row in its column and keeps a badge's fill and text as one item", () => {
    const layers = ["bg", "fill", "text", "link", "swipe"].map(layer);
    const sigOf = new Map(layers.map((l) => [l.id, `sig:${l.id}`]));
    const row = {
      sigs: ["sig:fill", "sig:text", "sig:link"],
      depth: 3,
      stack: { direction: "row" as const },
      geometry: box,
      units: [
        { sigs: ["sig:fill", "sig:text"], geometry: box },
        { sigs: ["sig:link"], geometry: box },
      ],
    };
    const column = {
      sigs: ["sig:fill", "sig:text", "sig:link", "sig:swipe"],
      depth: 2,
      stack: { direction: "column" as const },
      geometry: box,
      units: [
        { sigs: ["sig:fill", "sig:text", "sig:link"], geometry: box },
        { sigs: ["sig:swipe"], geometry: box },
      ],
    };
    const out = applyStacks(layers, sigOf, [column, row]);
    const shape = (l: TemplateLayerV2): unknown =>
      l.kind === "group"
        ? { [l.id]: (l as { children: TemplateLayerV2[] }).children.map(shape) }
        : l.id;
    expect(out.map(shape)).toEqual([
      "bg",
      { stack1: [{ stack2: [{ "stack2-item1": ["fill", "text"] }, "link"] }, "swipe"] },
    ]);
  });
});

describe("flexReproduces", () => {
  const box = { x: 0, y: 0, w: 1000, h: 400 };
  it("accepts items a column lays out where the pack drew them, and refuses auto-margin layouts", () => {
    const column = {
      direction: "column" as const,
      justify: "end" as const,
      align: "start" as const,
    };
    // Bottom-anchored: 100 + 50 tall items, 10 px gap (1% of 1000 wide), ending at 400.
    const drawn = [
      { x: 0, y: 240, w: 600, h: 100 },
      { x: 0, y: 350, w: 300, h: 50 },
    ];
    expect(flexReproduces({ ...column, gap: 1 }, box, drawn, 1000, 10)).toBe(true);
    // The pack pushed the second item down with an auto margin: no stack reproduces it.
    const pushed = [
      { x: 0, y: 0, w: 600, h: 100 },
      { x: 0, y: 350, w: 300, h: 50 },
    ];
    expect(flexReproduces({ ...column, justify: "start", gap: 1 }, box, pushed, 1000, 10)).toBe(
      false,
    );
  });

  it("spreads a space-between row to both ends", () => {
    const row = {
      direction: "row" as const,
      justify: "space-between" as const,
      align: "center" as const,
    };
    const drawn = [
      { x: 0, y: 180, w: 200, h: 40 },
      { x: 800, y: 175, w: 200, h: 50 },
    ];
    expect(flexReproduces(row, box, drawn, 1000, 10)).toBe(true);
  });
});
