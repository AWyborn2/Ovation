/**
 * Round 9 B13: the sizes a stored design draws, shared by server and web, and
 * the refusal for a size it doesn't draw (never a blank download).
 */
import { describe, expect, it } from "vitest";
import {
  designSizes,
  emptySizeRefusal,
  layerDocumentCoverage,
  pagesCoverage,
} from "./design-sizes";
import { TEMPLATE_SIZE_ORDER } from "./kind-templates";

const box = { x: 5, y: 5, w: 90, h: 20 };
const layer = (sizes?: string[]) => ({
  id: "l",
  kind: "shape",
  ...(sizes ? { sizes } : {}),
  geometry: Object.fromEntries((sizes ?? TEMPLATE_SIZE_ORDER).map((s) => [s, box])),
});
// An OMG T20 Match Summary design: no Story layers (card 1022).
const t20 = { layers: [layer(["square", "portrait", "landscape"])] };
const input = { kind: "matchSummary" };

describe("design sizes", () => {
  it("reads the sizes every drawn page has layers on", () => {
    expect(pagesCoverage([t20 as never])).toEqual(["square", "portrait", "landscape"]);
    expect(
      pagesCoverage([t20 as never, { layers: [layer(["portrait", "story"])] } as never]),
    ).toEqual(["portrait"]);
    expect(pagesCoverage([{ layers: [] } as never])).toEqual([]);
  });

  it("a templated draft draws its document's sizes; a pack draft all four", () => {
    expect(designSizes({ cardInput: input, adjustments: t20, templateVersion: 2 })).toEqual([
      "square",
      "portrait",
      "landscape",
    ]);
    expect(designSizes({ cardInput: input, adjustments: null, templateVersion: null })).toEqual([
      ...TEMPLATE_SIZE_ORDER,
    ]);
    expect(designSizes({ cardInput: input })).toEqual([...TEMPLATE_SIZE_ORDER]);
  });

  it("nothing to read is no coverage, never a guess", () => {
    expect(layerDocumentCoverage(null, "matchSummary", [input])).toEqual([]);
    expect(layerDocumentCoverage({ offsets: {} }, "matchSummary", [input])).toEqual([]);
  });

  it("refuses a download at a size the design doesn't draw, with what to do", () => {
    expect(emptySizeRefusal(t20, input, "story")).toBe(
      "This design has no Story size, so there's nothing to download at Story. Pick a size it has in Format.",
    );
    expect(emptySizeRefusal(t20, input, "portrait")).toBeNull();
    expect(emptySizeRefusal({ layers: [] }, input, "story")).toBeNull();
  });
});
