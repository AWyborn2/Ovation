/**
 * Social Studio U16 — the editor's pure core: history, guides, rotation
 * snapping, shortcuts and document operations.
 */
import { describe, it, expect } from "vitest";
import type { FreeLayer } from "@/lib/pack-render";
import { commit, commitFrom, createHistory, redo, undo, HISTORY_CAP } from "../history";
import { snapMove, snapRotation, SNAP_THRESHOLD } from "../guides";
import { actionForKey } from "../shortcuts";
import {
  duplicate,
  group,
  nudge,
  removeLayers,
  selectionFor,
  toggleSelection,
  type EditorDoc,
} from "../document";

const layer = (id: string, over: Partial<FreeLayer> = {}): FreeLayer => ({
  id,
  kind: "shape",
  geometry: { square: { x: 10, y: 10, w: 20, h: 20 } },
  editedAt: { square: 1 },
  ...over,
});

describe("history", () => {
  it("undo and redo restore prior states in order; a new edit clears redo", () => {
    let h = createHistory({ n: 0 });
    h = commit(h, { n: 1 });
    h = commit(h, { n: 2 });
    h = undo(h);
    expect(h.present).toEqual({ n: 1 });
    h = undo(h);
    expect(h.present).toEqual({ n: 0 });
    h = redo(h);
    expect(h.present).toEqual({ n: 1 });
    h = commit(h, { n: 9 });
    expect(h.future).toHaveLength(0);
    expect(redo(h).present).toEqual({ n: 9 });
  });

  it("caps undo at 40 snapshots and ignores no-op commits", () => {
    let h = createHistory({ n: 0 });
    for (let i = 1; i <= 50; i++) h = commit(h, { n: i });
    expect(h.past).toHaveLength(HISTORY_CAP);
    expect(commit(h, { n: 50 })).toBe(h);
  });

  it("a drag commits one undo step back to the state before the gesture", () => {
    let h = createHistory({ x: 0 });
    h = commitFrom({ ...h, present: { x: 7 } }, { x: 0 }, { x: 7 });
    expect(h.past).toEqual([{ x: 0 }]);
    expect(undo(h).present).toEqual({ x: 0 });
  });
});

describe("smart guides", () => {
  it("snaps a box's centre to the page centre within 0.8%", () => {
    const r = snapMove({ x: 40.5, y: 10, w: 20, h: 10 }, []);
    expect(r.x).toBeCloseTo(40);
    expect(r.guides).toContainEqual({ axis: "x", at: 50 });
  });

  it("snaps to another layer's edge, and not beyond the threshold", () => {
    const other = { x: 60, y: 0, w: 10, h: 10 };
    expect(snapMove({ x: 60.5, y: 30, w: 10, h: 10 }, [other]).x).toBe(60);
    // 72–76 sits 2% from the nearest stop (70), beyond the 0.8% threshold.
    const far = snapMove({ x: 72, y: 30, w: 4, h: 4 }, [other]);
    expect(far.x).toBe(72);
    expect(SNAP_THRESHOLD).toBe(0.8);
  });

  it("rotation snaps to 0, ±90 and 180 near those angles", () => {
    expect(snapRotation(3)).toBe(0);
    expect(snapRotation(87)).toBe(90);
    expect(snapRotation(-92)).toBe(-90);
    expect(snapRotation(178)).toBe(180);
    expect(snapRotation(45)).toBe(45);
  });
});

describe("shortcuts", () => {
  const key = (
    k: string,
    mods: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
  ) => actionForKey({ key: k, shiftKey: false, metaKey: false, ctrlKey: false, ...mods });

  it("arrows nudge 0.5% and 2% with Shift", () => {
    expect(key("ArrowLeft")).toEqual({ type: "nudge", dx: -0.5, dy: 0 });
    expect(key("ArrowDown", { shiftKey: true })).toEqual({ type: "nudge", dx: 0, dy: 2 });
  });

  it("maps delete, escape, undo, redo, duplicate and grouping", () => {
    expect(key("Delete")?.type).toBe("delete");
    expect(key("Backspace")?.type).toBe("delete");
    expect(key("Escape")?.type).toBe("escape");
    expect(key("z", { metaKey: true })?.type).toBe("undo");
    expect(key("z", { ctrlKey: true, shiftKey: true })?.type).toBe("redo");
    expect(key("d", { metaKey: true })?.type).toBe("duplicate");
    expect(key("g", { metaKey: true })?.type).toBe("group");
    expect(key("g", { metaKey: true, shiftKey: true })?.type).toBe("ungroup");
    expect(key("a")).toBeNull();
  });
});

describe("document operations", () => {
  const doc: EditorDoc = { layers: [layer("a"), layer("b"), layer("c", { locked: true })] };

  it("nudging moves only the current format and skips locked layers", () => {
    const moved = nudge(doc, "square", ["a", "c"], 2, 0);
    expect(moved.layers![0].geometry.square!.x).toBe(12);
    expect(moved.layers![2].geometry.square!.x).toBe(10);
    expect(moved.layers![0].geometry.landscape).toBeUndefined();
  });

  it("delete removes the selection but never locked layers", () => {
    expect(removeLayers(doc, ["a", "c"]).layers!.map((l) => l.id)).toEqual(["b", "c"]);
  });

  it("shift-click toggles; grouping then clicking a member selects the group", () => {
    expect(toggleSelection(doc, ["a"], "b", null)).toEqual(["a", "b"]);
    expect(toggleSelection(doc, ["a", "b"], "a", null)).toEqual(["b"]);
    const g = group(doc, ["a", "b"]);
    expect(selectionFor(g.doc, "a", null).sort()).toEqual(["a", "b"]);
    // Inside the group, a click selects just that member.
    expect(selectionFor(g.doc, "a", g.group)).toEqual(["a"]);
  });

  it("duplicating offsets the copy and gives grouped copies a fresh group", () => {
    const g = group(doc, ["a", "b"]).doc;
    const r = duplicate(g, "square", ["a", "b"]);
    const copies = r.doc.layers!.filter((l) => r.ids.includes(l.id));
    expect(copies).toHaveLength(2);
    expect(copies[0].geometry.square!.x).toBe(12);
    expect(copies[0].group).toBe(copies[1].group);
    expect(copies[0].group).not.toBe(g.layers![0].group);
  });
});
