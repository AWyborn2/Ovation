/**
 * studio-editor-multiselect — the pure arrange geometry: match size, align,
 * distribute, group resize (with type scaling), select all and the marquee
 * hit test. Every action changes the current size only and leaves locked and
 * hidden layers alone.
 */
import { describe, it, expect } from "vitest";
import type { FreeLayer, LayerBox } from "@/lib/pack-render";
import {
  align,
  distribute,
  contains,
  mapBox,
  matchSize,
  resizeBounds,
  resizeGroup,
  scaleLayerType,
  selectAll,
  unitCount,
} from "../arrange";
import { boxOf, layersOf, type EditorDoc } from "../document";

const box = (x: number, y: number, w: number, h: number): LayerBox => ({ x, y, w, h });
const layer = (id: string, b: LayerBox, over: Partial<FreeLayer> = {}): FreeLayer => ({
  id,
  kind: "shape",
  geometry: { square: b, story: { ...b } },
  ...over,
});
const docOf = (...layers: FreeLayer[]): EditorDoc => ({ layers });
const sq = (doc: EditorDoc, id: string) =>
  boxOf(
    layersOf(doc).find((l) => l.id === id)!,
    "square",
  )!;
const story = (doc: EditorDoc, id: string) =>
  boxOf(
    layersOf(doc).find((l) => l.id === id)!,
    "story",
  )!;
const close = (b: LayerBox, want: LayerBox) => {
  for (const k of ["x", "y", "w", "h"] as const) expect(b[k]).toBeCloseTo(want[k], 6);
};

describe("matchSize", () => {
  const doc = docOf(layer("a", box(10, 10, 20, 10)), layer("b", box(50, 50, 10, 30)));

  it("matches the first-selected layer's size, keeping each centre", () => {
    const next = matchSize(doc, "square", ["a", "b"], "both", "first");
    close(sq(next, "a"), box(10, 10, 20, 10));
    // b's centre (55, 65) stays put.
    close(sq(next, "b"), box(45, 60, 20, 10));
  });

  it("follows selection order, not stacking order", () => {
    const next = matchSize(doc, "square", ["b", "a"], "both", "first");
    close(sq(next, "a"), box(15, 0, 10, 30));
  });

  it("matches only the width or only the height", () => {
    const w = matchSize(doc, "square", ["a", "b"], "width", "first");
    close(sq(w, "b"), box(45, 50, 20, 30));
    const h = matchSize(doc, "square", ["a", "b"], "height", "first");
    close(sq(h, "b"), box(50, 60, 10, 10));
  });

  it("matches to the largest", () => {
    const next = matchSize(doc, "square", ["a", "b"], "height", "largest");
    close(sq(next, "a"), box(10, 0, 20, 30));
  });

  it("changes the current size only and stamps it", () => {
    const next = matchSize(doc, "square", ["a", "b"], "both", "first");
    close(story(next, "b"), box(50, 50, 10, 30));
    expect(layersOf(next).find((l) => l.id === "b")!.editedAt?.square).toBeTypeOf("number");
    expect(layersOf(next).find((l) => l.id === "b")!.editedAt?.story).toBeUndefined();
  });

  it("leaves locked and hidden layers alone, and needs two layers", () => {
    const locked = docOf(
      layer("a", box(10, 10, 20, 10)),
      layer("b", box(50, 50, 10, 30), { locked: true }),
      layer("c", box(0, 0, 5, 5), { hidden: true }),
    );
    expect(matchSize(locked, "square", ["a", "b", "c"], "both", "first")).toBe(locked);
  });

  it("scales a group as one unit", () => {
    const g = docOf(
      layer("a", box(0, 0, 10, 10), { group: "g1" }),
      layer("b", box(10, 0, 10, 10), { group: "g1" }),
      layer("c", box(50, 50, 40, 40)),
    );
    expect(unitCount(g, "square", ["a", "b", "c"])).toBe(2);
    const next = matchSize(g, "square", ["c", "a", "b"], "width", "first");
    // The group (20 wide, centre x 10) becomes 40 wide around the same centre.
    close(sq(next, "a"), box(-10, 0, 20, 10));
    close(sq(next, "b"), box(10, 0, 20, 10));
    // Editing inside the group, its layers are units of their own.
    expect(unitCount(g, "square", ["a", "b"], "g1")).toBe(2);
  });
});

describe("align", () => {
  const doc = docOf(layer("a", box(10, 10, 20, 10)), layer("b", box(40, 30, 10, 30)));

  it("lines layers up on an edge or centre of their bounds", () => {
    close(sq(align(doc, "square", ["a", "b"], "left"), "b"), box(10, 30, 10, 30));
    close(sq(align(doc, "square", ["a", "b"], "right"), "a"), box(30, 10, 20, 10));
    close(sq(align(doc, "square", ["a", "b"], "center"), "b"), box(25, 30, 10, 30));
    close(sq(align(doc, "square", ["a", "b"], "top"), "b"), box(40, 10, 10, 30));
    close(sq(align(doc, "square", ["a", "b"], "bottom"), "a"), box(10, 50, 20, 10));
    close(sq(align(doc, "square", ["a", "b"], "middle"), "a"), box(10, 30, 20, 10));
  });

  it("lines a single layer up with the page", () => {
    close(sq(align(doc, "square", ["a"], "center"), "a"), box(40, 10, 20, 10));
    close(sq(align(doc, "square", ["a"], "bottom"), "a"), box(10, 90, 20, 10));
  });
});

describe("distribute", () => {
  it("spaces three or more layers with equal gaps, outermost fixed", () => {
    const doc = docOf(
      layer("a", box(0, 0, 10, 10)),
      layer("b", box(20, 0, 20, 10)),
      layer("c", box(90, 0, 10, 10)),
    );
    const next = distribute(doc, "square", ["c", "a", "b"], "horizontal");
    close(sq(next, "a"), box(0, 0, 10, 10));
    close(sq(next, "b"), box(40, 0, 20, 10));
    close(sq(next, "c"), box(90, 0, 10, 10));
    expect(distribute(doc, "square", ["a", "b"], "vertical")).toBe(doc);
  });
});

describe("group resize", () => {
  it("maps each box from the old bounds to the new", () => {
    close(mapBox(box(10, 10, 10, 10), box(0, 0, 40, 40), box(0, 0, 80, 20)), box(20, 5, 20, 5));
  });

  it("keeps proportions from a corner and pins the opposite corner", () => {
    const start = box(10, 10, 40, 20);
    close(resizeBounds(start, "se", 40, 0), box(10, 10, 80, 40));
    close(resizeBounds(start, "nw", -40, 0), box(-30, -10, 80, 40));
    close(resizeBounds(start, "ne", 0, 10), box(10, 20, 20, 10));
  });

  it("stretches one axis from an edge, never below the minimum", () => {
    const start = box(10, 10, 40, 20);
    close(resizeBounds(start, "e", 10, 99), box(10, 10, 50, 20));
    close(resizeBounds(start, "n", 0, -10), box(10, 0, 40, 30));
    close(resizeBounds(start, "w", 60, 0), box(48, 10, 2, 20));
    const tiny = resizeBounds(start, "se", -100, -100);
    expect(tiny.h).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  it("scales type from a corner, from the gesture's start so it never compounds", () => {
    const text = layer("t", box(0, 0, 50, 10), { kind: "text", style: { fontSize: 6 } });
    const other = layer("o", box(50, 0, 50, 10));
    const doc = docOf(text, other);
    const from = box(0, 0, 100, 10);
    const half = box(0, 0, 50, 5);
    let next = resizeGroup(doc, "square", [text, other], from, half, true);
    next = resizeGroup(next, "square", [text, other], from, half, true);
    const t = layersOf(next).find((l) => l.id === "t")!;
    expect(t.style?.fontSize).toBe(3);
    close(sq(next, "t"), box(0, 0, 25, 5));
    close(sq(next, "o"), box(25, 0, 25, 5));
    // Other sizes keep their boxes; the font size is shared by every size.
    close(story(next, "t"), box(0, 0, 50, 10));
    const edge = resizeGroup(doc, "square", [text, other], from, half, false);
    expect(layersOf(edge).find((l) => l.id === "t")!.style?.fontSize).toBe(6);
  });

  it("scales a list's rows and cell type, within the validator's limits", () => {
    const rows = layer("r", box(0, 0, 50, 50), {
      kind: "rows",
      rows: {
        repeat: "players",
        rowHeight: 8,
        gap: 1,
        cells: [{ field: "name", x: 0, w: 100, style: { fontSize: 3 } }],
        variants: { club: { name: { fontSize: 4 } } },
      },
    });
    const up = scaleLayerType(rows, 2).rows!;
    expect(up.rowHeight).toBe(16);
    expect(up.gap).toBe(2);
    expect(up.cells[0].style?.fontSize).toBe(6);
    expect(up.variants?.club?.name?.fontSize).toBe(8);
    const huge = scaleLayerType(
      layer("t", box(0, 0, 1, 1), { kind: "text", style: { fontSize: 60 } }),
      4,
    );
    expect(huge.style?.fontSize).toBe(80);
  });
});

describe("select all and marquee", () => {
  it("selects every visible, unlocked layer on the size", () => {
    const doc = docOf(
      layer("a", box(0, 0, 10, 10)),
      layer("b", box(0, 0, 10, 10), { locked: true }),
      layer("c", box(0, 0, 10, 10), { hidden: true }),
      layer("d", box(0, 0, 10, 10), { sizes: ["story"] }),
    );
    expect(selectAll(doc, "square")).toEqual(["a"]);
  });

  it("picks boxes wholly inside the marquee", () => {
    expect(contains(box(0, 0, 10, 10), box(2, 2, 8, 8))).toBe(true);
    expect(contains(box(0, 0, 10, 10), box(9, 9, 5, 5))).toBe(false);
    // A full-card background is only picked by a marquee round the whole card.
    expect(contains(box(-5, -5, 90, 90), box(0, 0, 100, 100))).toBe(false);
  });
});
