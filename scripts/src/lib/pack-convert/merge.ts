/**
 * Merge a template page's captures into one page of layers (L4-A2, tasks
 * T4.6 and T4.9).
 *
 * - Sizes: the same layer (by signature) across the four sizes becomes one
 *   layer with a box per size. Where its style differs between sizes (a
 *   pack's story layout sets a larger font), it splits into one layer per
 *   style, each on its own sizes.
 * - Conditions: a layer only in the no-photo capture shows when there is no
 *   photo, one only with the photo when there is one, and the same for
 *   sponsors. A `data-drop-if-field` ancestor becomes `showWhen.field`.
 * - Stacks: a flex container whose children move between presets (a hidden
 *   optional field closes its gap) becomes a stack group of those children.
 */

import type {
  GroupLayerV2,
  LayerBox,
  StackSpec,
  TemplateLayerV2,
  TemplateSize,
} from "@workspace/scorecard/kind-templates";
import type { CapturedElement, PackCapture } from "@workspace/scorecard/pack-capture";
import { px, r2 } from "./css";
import { Tree, alignTrees, type MappedLayer, type MapResult } from "./map";

export const SIZES: readonly TemplateSize[] = ["square", "portrait", "story", "landscape"];

/** One size's mapped base capture, with the captures its branches and presets are compared against. */
export interface SizeMaps {
  size: TemplateSize;
  base: MapResult;
  baseCapture: PackCapture;
  /** The worst-case capture the layers took their boxes from (absent when it draws another design). */
  geometry?: PackCapture;
  /** The same page at the Minimal preset (content kinds), for stacks. */
  minimal?: MapResult;
  /** Standard preset with and without the photo / sponsors, for conditions. */
  photo?: { on: MapResult; off: MapResult };
  sponsors?: { on: MapResult; off: MapResult };
}

type LayerNoGeo = MappedLayer["layer"] & { showWhen?: TemplateLayerV2["showWhen"] };

interface Placed {
  sig: string;
  layer: LayerNoGeo;
  box: LayerBox;
  element: number;
}

/** Whether a layer binds a token (so the drop rule already hides it when the token is empty). */
function binds(layer: LayerNoGeo, token: string): boolean {
  const json = JSON.stringify(layer);
  return json.includes(`{{${token}}}`) || (layer.kind === "photo" && token === "photo");
}

const isShape = (sig: string) => sig.startsWith("shape:");
const baseSig = (sig: string) => sig.replace(/#\d+$/, "");

/** Layers in `extra` that `ref` lacks: by signature, shapes only when their kind is missing entirely. */
function onlyIn(extra: MapResult, ref: MapResult): MappedLayer[] {
  const refSigs = new Set(ref.layers.map((l) => l.sig));
  const refBases = new Set(ref.layers.map((l) => baseSig(l.sig)));
  return extra.layers.filter((l) =>
    isShape(l.sig) ? !refBases.has(baseSig(l.sig)) : !refSigs.has(l.sig),
  );
}

/** One size's layers, with conditions from the branches and drop fields. */
function sizeLayers(m: SizeMaps): Placed[] {
  const out: Placed[] = m.base.layers.map((l) => ({
    sig: l.sig,
    layer: withDrop(l),
    box: l.box,
    element: l.element,
  }));
  const seen = new Set(out.map((p) => p.sig));
  const condition = (
    pair: { on: MapResult; off: MapResult } | undefined,
    key: "photo" | "sponsors",
  ) => {
    if (!pair) return;
    // Only when off: add, shown when there is none, in the off capture's paint order.
    const extra = new Map<MappedLayer, Placed>();
    for (const l of onlyIn(pair.off, pair.on)) {
      const sig = `${l.sig}|${key}-off`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      extra.set(l, {
        sig,
        layer: { ...withDrop(l), showWhen: { ...withDrop(l).showWhen, [key]: false } },
        box: l.box,
        element: l.element,
      });
    }
    insertInPaintOrder(out, pair.off.layers, extra);
    // Only when on: condition the base layer (unless it binds the photo itself).
    for (const l of onlyIn(pair.on, pair.off)) {
      const hit = out.find((p) => p.sig === l.sig);
      if (!hit || (key === "photo" && binds(hit.layer, "photo"))) continue;
      if (key === "sponsors" && /\{\{sponsor/.test(JSON.stringify(hit.layer))) continue;
      hit.layer = { ...hit.layer, showWhen: { ...hit.layer.showWhen, [key]: true } };
    }
  };
  condition(m.photo, "photo");
  condition(m.sponsors, "sponsors");
  return out;
}

/**
 * Insert `extra` into `out` where its capture painted it: after the nearest
 * earlier layer of `captured` that `out` already has, so a fallback drawn
 * under the photo isn't painted over everything.
 */
function insertInPaintOrder(
  out: Placed[],
  captured: MappedLayer[],
  extra: Map<MappedLayer, Placed>,
) {
  let cursor = -1;
  for (const l of captured) {
    const add = extra.get(l);
    if (add) {
      out.splice(++cursor, 0, add);
      continue;
    }
    const at = out.findIndex((p) => p.sig === l.sig);
    if (at >= 0) cursor = at;
  }
}

function withDrop(l: MappedLayer): LayerNoGeo {
  const layer = { ...l.layer } as LayerNoGeo;
  if (l.dropIfField && !binds(layer, l.dropIfField))
    layer.showWhen = { ...layer.showWhen, field: l.dropIfField };
  return layer;
}

/**
 * One paint order that keeps every size's: a layer only one size draws (a
 * story's angled band) goes where that size painted it, not on top of the
 * layers all sizes share. Ties go to the order the layers were first seen;
 * sizes that disagree fall back to it.
 */
export function paintOrder(lists: string[][]): string[] {
  const first = new Map<string, number>();
  for (const list of lists) for (const sig of list) if (!first.has(sig)) first.set(sig, first.size);
  const after = new Map<string, Set<string>>();
  const before = new Map<string, number>();
  for (const sig of first.keys()) before.set(sig, 0);
  for (const list of lists)
    for (let i = 1; i < list.length; i++) {
      const [a, b] = [list[i - 1]!, list[i]!];
      const next = after.get(a) ?? new Set<string>();
      if (a === b || next.has(b)) continue;
      next.add(b);
      after.set(a, next);
      before.set(b, before.get(b)! + 1);
    }
  const left = new Set(first.keys());
  const order: string[] = [];
  const byFirst = (a: string, b: string) => first.get(a)! - first.get(b)!;
  while (left.size) {
    const ready = [...left].filter((s) => before.get(s) === 0).sort(byFirst);
    // A cycle (two sizes stacking the same pair differently): take the earliest seen.
    const sig = ready[0] ?? [...left].sort(byFirst)[0]!;
    left.delete(sig);
    order.push(sig);
    for (const b of after.get(sig) ?? []) before.set(b, before.get(b)! - 1);
  }
  return order;
}

/** Layers across sizes: one per signature and style, a box per size. */
export function mergeSizes(
  perSize: Array<{ size: TemplateSize; layers: Placed[] }>,
  /** Layer ids are unique in a document: each page's are prefixed with it. */
  prefix = "",
): TemplateLayerV2[] {
  const bySig = new Map<string, Array<{ size: TemplateSize; p: Placed }>>();
  for (const { size, layers } of perSize)
    for (const p of layers) {
      if (!bySig.has(p.sig)) bySig.set(p.sig, []);
      bySig.get(p.sig)!.push({ size, p });
    }
  const order = paintOrder(perSize.map(({ layers }) => layers.map((p) => p.sig)));
  const out: TemplateLayerV2[] = [];
  let n = 0;
  for (const sig of order) {
    const groups = new Map<string, Array<{ size: TemplateSize; p: Placed }>>();
    for (const entry of bySig.get(sig)!) {
      const key = JSON.stringify(entry.p.layer);
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    for (const entries of groups.values()) {
      const sizes = SIZES.filter((s) => entries.some((e) => e.size === s));
      const geometry: Partial<Record<TemplateSize, LayerBox>> = {};
      for (const e of entries) geometry[e.size] = e.p.box;
      out.push({
        ...(entries[0]!.p.layer as object),
        id: `${prefix}l${++n}`,
        ...(sizes.length < SIZES.length ? { sizes } : {}),
        geometry,
      } as TemplateLayerV2);
    }
  }
  return out;
}

// ── Stacks ──────────────────────────────────────────────────────────────────

const moved = (a: LayerBox, b: LayerBox) => Math.abs(a.x - b.x) > 0.3 || Math.abs(a.y - b.y) > 0.3;

/**
 * Flex containers whose children move between presets, with the signatures
 * of the layers they hold (in the base capture of one size).
 */
export function stackContainers(
  m: SizeMaps,
): Array<{ container: CapturedElement; sigs: string[]; stack: StackSpec }> {
  if (!m.minimal) return [];
  const cap = m.baseCapture;
  const byId = new Map(cap.elements.map((e) => [e.id, e]));
  const minimal = new Map(m.minimal.layers.map((l) => [l.sig, l.box]));
  const W = cap.native.w;
  const flexOf = (id: number): CapturedElement | undefined => {
    let e = byId.get(id);
    while (e && e.parent !== null) {
      e = byId.get(e.parent);
      if (e && /flex/.test(e.style.display ?? "")) return e;
    }
    return undefined;
  };
  const groups = new Map<
    number,
    { container: CapturedElement; sigs: string[]; moves: boolean; conditional: boolean }
  >();
  for (const l of m.base.layers) {
    const c = flexOf(l.element);
    if (!c || c.id === 0) continue;
    const g = groups.get(c.id) ?? { container: c, sigs: [], moves: false, conditional: false };
    g.sigs.push(l.sig);
    const was = minimal.get(l.sig);
    if (!was) g.conditional = true;
    else if (moved(was, l.box)) g.moves = true;
    groups.set(c.id, g);
  }
  const out = [];
  for (const g of groups.values()) {
    if (!g.moves || !g.conditional || g.sigs.length < 2) continue;
    const st = g.container.style;
    const direction = (st["flex-direction"] ?? "row").startsWith("column") ? "column" : "row";
    const gapPx = px(direction === "column" ? st["row-gap"] : st["column-gap"]);
    const align =
      (
        {
          "flex-start": "start",
          start: "start",
          center: "center",
          "flex-end": "end",
          end: "end",
          stretch: "stretch",
        } as Record<string, StackSpec["align"]>
      )[st["align-items"] ?? "stretch"] ?? "stretch";
    const justify =
      (
        {
          "flex-start": "start",
          start: "start",
          center: "center",
          "flex-end": "end",
          end: "end",
          "space-between": "space-between",
          "space-around": "space-around",
          "space-evenly": "space-evenly",
        } as Record<string, StackSpec["justify"]>
      )[st["justify-content"] ?? "flex-start"] ?? "start";
    out.push({
      container: g.container,
      sigs: g.sigs,
      stack: {
        direction,
        ...(Number.isFinite(gapPx) && gapPx > 0 ? { gap: r2((gapPx / W) * 100) } : {}),
        align,
        justify,
      } as StackSpec,
    });
  }
  return out;
}

/**
 * Wrap stacked layers into groups: each stack's layers (matched by
 * signature in the merged list) move into a group with the container's box.
 */
export function applyStacks(
  layers: TemplateLayerV2[],
  sigOf: Map<string, string>,
  stacks: Array<{
    sigs: string[];
    stack: StackSpec;
    geometry: Partial<Record<TemplateSize, LayerBox>>;
  }>,
  prefix = "",
): TemplateLayerV2[] {
  let out = [...layers];
  stacks.forEach((s, i) => {
    const members = out.filter((l) => s.sigs.includes(sigOf.get(l.id) ?? ""));
    if (members.length < 2) return;
    const at = out.indexOf(members[0]!);
    const group: GroupLayerV2 = {
      id: `${prefix}stack${i + 1}`,
      kind: "group",
      name: "Stack",
      stack: s.stack,
      geometry: s.geometry,
      children: members,
    };
    out = out.filter((l) => !members.includes(l));
    out.splice(Math.min(at, out.length), 0, group);
  });
  return out;
}

/** The page's layers from its per-size captures. */
export function mergePage(
  maps: SizeMaps[],
  prefix = "",
): { layers: TemplateLayerV2[]; stacks: number } {
  const perSize = maps.map((m) => ({ size: m.size, layers: sizeLayers(m) }));
  const layers = mergeSizes(perSize, prefix);
  // Signature of each merged layer, by id, for the stack pass.
  const sigOf = new Map<string, string>();
  for (const l of layers) {
    for (const { size, layers: placed } of perSize) {
      const box = l.geometry[size];
      const hit = box && placed.find((p) => p.box === box);
      if (hit) {
        sigOf.set(l.id, hit.sig);
        break;
      }
    }
  }
  const stacks = new Map<
    string,
    { sigs: string[]; stack: StackSpec; geometry: Partial<Record<TemplateSize, LayerBox>> }
  >();
  for (const m of maps) {
    // The container's box from the capture its children's boxes came from, so a
    // bottom-anchored block holds the worst-case title its children are sized for.
    const twins = m.geometry ? alignTrees(new Tree(m.baseCapture), new Tree(m.geometry)) : null;
    for (const s of stackContainers(m)) {
      const key = [...s.sigs].sort().join("|");
      const entry = stacks.get(key) ?? { sigs: s.sigs, stack: s.stack, geometry: {} };
      const W = m.baseCapture.native.w;
      const H = m.baseCapture.native.h;
      const twin = twins?.get(s.container.id);
      const b = twin && twin.tag === s.container.tag ? twin.box : s.container.box;
      entry.geometry[m.size] = {
        x: r2((b.x / W) * 100),
        y: r2((b.y / H) * 100),
        w: r2((b.w / W) * 100),
        h: r2((b.h / H) * 100),
      };
      stacks.set(key, entry);
    }
  }
  return { layers: applyStacks(layers, sigOf, [...stacks.values()], prefix), stacks: stacks.size };
}
