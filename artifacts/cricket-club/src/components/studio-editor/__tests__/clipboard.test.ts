/**
 * studio-editor-multiselect — copy and paste: what a copy holds, where a
 * paste lands (offset over the original, placed across sizes), new ids and
 * groups, template-only rules, and session storage per mode.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { placeBoxOnSize } from "@workspace/scorecard/kind-templates";
import type { FreeLayer, LayerBox } from "@/lib/pack-render";
import { copyLayers, pasteLayers, PASTE_OFFSET, readClipboard, writeClipboard } from "../clipboard";
import { boxOf, layersOf, type EditorDoc } from "../document";

const box = (x: number, y: number, w: number, h: number): LayerBox => ({ x, y, w, h });
const layer = (id: string, b: LayerBox, over: Partial<FreeLayer> = {}): FreeLayer => ({
  id,
  kind: "shape",
  geometry: { square: b },
  editedAt: { square: 1 },
  ...over,
});
const docOf = (...layers: FreeLayer[]): EditorDoc => ({ layers });

beforeEach(() => window.sessionStorage.clear());

describe("copy", () => {
  it("holds the selected layers on this size, in stacking order, with this size's box", () => {
    const doc = docOf(
      layer("a", box(1, 1, 10, 10)),
      layer("b", box(2, 2, 10, 10), { sizes: ["story"], geometry: { story: box(2, 2, 10, 10) } }),
      layer("c", box(3, 3, 10, 10), { locked: true }),
    );
    const clip = copyLayers(doc, "square", ["c", "a", "b"], "template")!;
    expect(clip.size).toBe("square");
    expect(clip.layers.map((l) => l.id)).toEqual(["a", "c"]);
    expect(clip.layers[0].geometry).toEqual({ square: box(1, 1, 10, 10) });
    expect(clip.layers[0].editedAt).toBeUndefined();
    expect(copyLayers(doc, "square", [], "template")).toBeNull();
  });
});

describe("paste", () => {
  const original = layer("a", box(10, 10, 20, 20), {
    kind: "text",
    content: "{{runs}}",
    locked: true,
    group: "g1",
  });
  const partner = layer("b", box(40, 10, 10, 10), { group: "g1" });

  it("adds new, unlocked layers with new ids and their own group", () => {
    const doc = docOf(original, partner);
    const clip = copyLayers(doc, "square", ["a", "b"], "template")!;
    const r = pasteLayers(doc, clip, "square");
    expect(r.ids).toHaveLength(2);
    const pasted = layersOf(r.doc).slice(2);
    expect(pasted.map((l) => l.id)).toEqual(r.ids);
    expect(r.ids).not.toContain("a");
    expect(pasted[0].locked).toBeUndefined();
    expect(pasted[0].group).toBeTruthy();
    expect(pasted[0].group).not.toBe("g1");
    expect(pasted[1].group).toBe(pasted[0].group);
    // A bound field stays bound.
    expect(pasted[0].content).toBe("{{runs}}");
  });

  it("offsets a paste over its original, and cascades repeated pastes", () => {
    const doc = docOf(layer("a", box(10, 10, 20, 20)));
    const clip = copyLayers(doc, "square", ["a"], "draft")!;
    const once = pasteLayers(doc, clip, "square");
    expect(boxOf(layersOf(once.doc)[1], "square")).toEqual(
      box(10 + PASTE_OFFSET, 10 + PASTE_OFFSET, 20, 20),
    );
    const twice = pasteLayers(once.doc, clip, "square");
    expect(boxOf(layersOf(twice.doc)[2], "square")).toEqual(
      box(10 + 2 * PASTE_OFFSET, 10 + 2 * PASTE_OFFSET, 20, 20),
    );
  });

  it("keeps the position when pasted into another document", () => {
    const clip = copyLayers(docOf(layer("a", box(10, 10, 20, 20))), "square", ["a"], "draft")!;
    const r = pasteLayers(docOf(), clip, "square");
    expect(boxOf(layersOf(r.doc)[0], "square")).toEqual(box(10, 10, 20, 20));
  });

  it("places a copy from another size the way Add to other sizes does", () => {
    const clip = copyLayers(docOf(layer("a", box(10, 10, 20, 20))), "square", ["a"], "draft")!;
    const r = pasteLayers(docOf(), clip, "story", {}, 5);
    const pasted = layersOf(r.doc)[0];
    expect(pasted.geometry).toEqual({
      story: placeBoxOnSize(box(10, 10, 20, 20), "square", "story"),
    });
    expect(pasted.editedAt).toEqual({ story: 5 });
    expect(pasted.sizes).toBeUndefined();
  });

  it("puts a template paste on this size only", () => {
    const clip = copyLayers(docOf(layer("a", box(10, 10, 20, 20))), "square", ["a"], "template")!;
    const r = pasteLayers(docOf(), clip, "portrait", { kind: "century", onlyOnSize: true });
    expect(layersOf(r.doc)[0].sizes).toEqual(["portrait"]);
  });

  it("skips copies using fields or a list the target card doesn't have", () => {
    const doc = docOf(
      layer("t", box(0, 0, 10, 10), { kind: "text", content: "{{runs}}" }),
      layer("s", box(0, 0, 10, 10)),
      layer("r", box(0, 0, 10, 10), {
        kind: "rows",
        rows: { repeat: "players", rowHeight: 8, cells: [{ field: "name", x: 0, w: 100 }] },
      }),
    );
    const clip = copyLayers(doc, "square", ["t", "s", "r"], "template")!;
    const intoTotw = pasteLayers(docOf(), clip, "square", { kind: "teamOfWeek" });
    // Team of the week has a Players list but no runs field.
    expect(intoTotw.skipped).toBe(1);
    expect(layersOf(intoTotw.doc).map((l) => l.kind)).toEqual(["shape", "rows"]);
    const intoCentury = pasteLayers(docOf(), clip, "square", { kind: "century" });
    expect(layersOf(intoCentury.doc).map((l) => l.kind)).toEqual(["text", "shape"]);
  });
});

describe("clipboard storage", () => {
  it("keeps templates and drafts apart, in session storage", () => {
    const clip = copyLayers(docOf(layer("a", box(1, 1, 5, 5))), "square", ["a"], "template")!;
    writeClipboard(clip);
    expect(readClipboard("template")).toEqual(clip);
    expect(readClipboard("draft")).toBeNull();
    expect(window.sessionStorage.length).toBe(1);
  });
});
