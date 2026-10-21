import { describe, expect, it } from "vitest";
import type { TemplateSize } from "@workspace/scorecard/kind-templates";
import type { PackCapture } from "@workspace/scorecard/pack-capture";
import type { MappedLayer, MapResult } from "./map";
import { mergePage, paintOrder, type SizeMaps } from "./merge";

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
