/**
 * Library element documents (editable-elements plan, D1): a fragment of v2
 * layers, checked by v2's layer rules with every kind's tokens in scope.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ELEMENT_CATEGORIES,
  ELEMENT_CATEGORY_LABELS,
  MAX_ELEMENT_LAYERS,
  MIN_ELEMENT_PAINT,
  colourAlpha,
  paintStrength,
} from "./elements";
import { elementDocumentErrors } from "./validate";

const box = { x: 0, y: 80, w: 100, h: 12 };
const band = {
  id: "band",
  kind: "shape",
  geometry: { square: box, story: box },
  style: {
    fill: { type: "linear", angle: 90, stops: [{ color: "var(--gold)" }, { color: "#000" }] },
    clip: {
      polygon: [
        [0, 0],
        [100, 0],
        [94, 100],
        [0, 100],
      ],
    },
  },
};

const element = (layers: unknown[], extra: Record<string, unknown> = {}) => ({
  formatVersion: 2,
  layers,
  ...extra,
});

describe("elementDocumentErrors", () => {
  it("accepts a fragment of v2 layers", () => {
    const label = {
      id: "label",
      kind: "text",
      content: "{{grade}}",
      geometry: { square: { x: 4, y: 82, w: 60, h: 8 } },
    };
    expect(elementDocumentErrors(element([band, label], { palettes: ["club-kit"] }))).toEqual([]);
  });

  it("accepts a group with its children", () => {
    const group = {
      id: "chip",
      kind: "group",
      geometry: { square: { x: 4, y: 4, w: 20, h: 8 } },
      children: [{ ...band, id: "chip-bg" }],
    };
    expect(elementDocumentErrors(element([group]))).toEqual([]);
  });

  it("names what's wrong", () => {
    expect(elementDocumentErrors(null)).toEqual(["An element needs a list of layers."]);
    expect(elementDocumentErrors(element([]))).toContain("An element needs at least one layer.");
    expect(elementDocumentErrors({ ...element([band]), formatVersion: 1 })).toContain(
      "formatVersion must be 2.",
    );
    expect(elementDocumentErrors({ ...element([band]), pages: {} }).join(" ")).toMatch(/pages/);
    expect(elementDocumentErrors(element([band], { palettes: ["neon"] })).join(" ")).toMatch(
      /palettes/,
    );
    expect(elementDocumentErrors(element([band, band])).join(" ")).toMatch(/repeats the id/);
    const unknownToken = { ...band, id: "t", kind: "text", content: "{{notAField}}" };
    expect(elementDocumentErrors(element([unknownToken]))).not.toEqual([]);
  });

  it(`holds at most ${MAX_ELEMENT_LAYERS} layers`, () => {
    const many = Array.from({ length: MAX_ELEMENT_LAYERS + 1 }, (_, i) => ({
      ...band,
      id: `b${i}`,
    }));
    expect(elementDocumentErrors(element(many)).join(" ")).toMatch(/at most 120 layers/);
  });

  it("accepts a converted look's decorations as they are", () => {
    const file = path.resolve(__dirname, "../../../template-bundles/club-kit/matchDay.json");
    const { document } = JSON.parse(readFileSync(file, "utf8")) as {
      document: { pages: Record<string, { layers: Array<{ kind: string }> }> };
    };
    const decorations = Object.values(document.pages)[0]!.layers.filter(
      (l) => l.kind === "shape" || l.kind === "vector",
    );
    expect(decorations.length).toBeGreaterThan(0);
    const fragment = element(decorations.slice(0, MAX_ELEMENT_LAYERS), {
      palettes: ["club-kit"],
    });
    expect(elementDocumentErrors(fragment)).toEqual([]);
  });

  it("labels every category", () => {
    for (const c of ELEMENT_CATEGORIES) expect(ELEMENT_CATEGORY_LABELS[c]).toBeTruthy();
  });
});

describe("paintStrength", () => {
  const shape = (style: Record<string, unknown>) => [{ kind: "shape", style }];

  it("reads colours, gradients, borders and opacity", () => {
    expect(colourAlpha("#0A0C10")).toBe(1);
    expect(colourAlpha("#00000000")).toBe(0);
    expect(colourAlpha("rgba(255,255,255,.07)")).toBeCloseTo(0.07);
    expect(colourAlpha("var(--gold)")).toBe(1);
    expect(paintStrength(shape({ fill: "var(--gold)" }))).toBe(1);
    expect(paintStrength(shape({ fill: "#140F08B8", opacity: 0.74 }))).toBeCloseTo(0.53, 2);
    expect(
      paintStrength(
        shape({ fill: { type: "linear", stops: [{ color: "#0000" }, { color: "#ffffff80" }] } }),
      ),
    ).toBeCloseTo(0.5, 1);
    const hairline = shape({
      fill: "#00000000",
      border: { width: 0.09, color: "var(--gold)", sides: ["top"] },
      opacity: 0.35,
    });
    expect(paintStrength(hairline)).toBeLessThan(MIN_ELEMENT_PAINT);
  });

  it("counts text, pictures and children through a group's opacity", () => {
    expect(paintStrength([{ kind: "text", content: "{{grade}}" }])).toBe(1);
    expect(paintStrength([{ kind: "text", content: " " }])).toBe(0);
    expect(paintStrength([{ kind: "photo" }])).toBe(1);
    const group = {
      kind: "group",
      style: { opacity: 0.5 },
      children: [{ kind: "shape", style: { fill: "#fff" } }],
    };
    expect(paintStrength([group])).toBe(0.5);
    expect(paintStrength([{ kind: "shape", hidden: true, style: { fill: "#fff" } }])).toBe(0);
  });
});
