/**
 * Portrait and Story sizes plan, Stage 2: which sizes a draft may save as its
 * design size. Pure (no database); the design's sizes come from Stage 1's
 * `designSizes` (tested in draft-sizes.test.ts).
 */
import { describe, expect, it } from "vitest";
import { designSizeRefusal } from "./draft-design-size";

const box = { x: 5, y: 5, w: 90, h: 20 };
const newLayer = {
  id: "n",
  kind: "shape",
  sizes: ["portrait", "story"],
  geometry: { portrait: box, story: box },
};
const allLayer = {
  id: "a",
  kind: "shape",
  geometry: { square: box, portrait: box, story: box, landscape: box },
};
const card = { kind: "milestone", playerName: "Sam", value: 100 };
const fresh = { cardInput: card, adjustments: { layers: [newLayer] }, templateVersion: 1 };

describe("designSizeRefusal", () => {
  it("always lets Portrait and Story be saved", () => {
    expect(designSizeRefusal(fresh, "portrait")).toBeNull();
    expect(designSizeRefusal(fresh, "story")).toBeNull();
  });

  it("refuses an older size a new design has no layers on", () => {
    expect(designSizeRefusal(fresh, "square")).toBe(
      "Square is an older size this design doesn't have. Design it at Portrait or Story.",
    );
    expect(designSizeRefusal(fresh, "landscape")).toMatch(/^Landscape is an older size/);
  });

  it("allows an older size the design has layers on", () => {
    expect(
      designSizeRefusal({ ...fresh, adjustments: { layers: [allLayer] } }, "landscape"),
    ).toBeNull();
  });

  it("allows an older size the draft already has saved", () => {
    expect(designSizeRefusal(fresh, "square", "square")).toBeNull();
  });

  it("allows every size on a pack-based draft (it draws all four, as before)", () => {
    const pack = { cardInput: card, adjustments: null, templateVersion: null };
    expect(designSizeRefusal(pack, "square")).toBeNull();
    expect(designSizeRefusal(pack, "landscape")).toBeNull();
  });

  it("reads a page set from every page it has", () => {
    const pages = {
      cardInput: card,
      adjustments: {
        formatVersion: 2,
        set: "free",
        pages: [
          { id: "p1", slot: "page", kind: "milestone", page: "card", layers: [newLayer] },
          { id: "p2", slot: "page", kind: "milestone", page: "card", layers: [allLayer] },
        ],
      },
      templateVersion: 1,
    };
    expect(designSizeRefusal(pages, "square")).not.toBeNull();
    expect(designSizeRefusal(pages, "story")).toBeNull();
  });
});
