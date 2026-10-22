/**
 * Library element documents (editable-elements plan, D1): a fragment of v2
 * layers, checked by v2's layer rules with every kind's tokens in scope.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ELEMENT_CATEGORIES, ELEMENT_CATEGORY_LABELS, MAX_ELEMENT_LAYERS } from "./elements";
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
