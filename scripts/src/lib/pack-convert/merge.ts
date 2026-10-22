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

import {
  MAX_STACK_DEPTH,
  type GroupLayerV2,
  type LayerBox,
  type StackSpec,
  type TemplateLayerV2,
  type TemplateSize,
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

/** One flex item of a stack: a direct child of the container and the layers it draws. */
export interface StackUnit {
  child: CapturedElement;
  sigs: string[];
}

/** An element and its ancestors, nearest first. */
function pathIn(cap: PackCapture, id: number): CapturedElement[] {
  const byId = new Map(cap.elements.map((e) => [e.id, e]));
  const out: CapturedElement[] = [];
  let e = byId.get(id);
  while (e) {
    out.push(e);
    e = e.parent === null ? undefined : byId.get(e.parent);
  }
  return out;
}

/**
 * A flex container's items in one size's capture: each direct child of the
 * container with every layer it draws (a badge's fill and its text stay
 * together), however deep. Null when the container isn't a flex box there.
 */
export function stackUnits(
  m: SizeMaps,
  containerId: number,
): { container: CapturedElement; units: StackUnit[] } | null {
  const container = m.baseCapture.elements.find((e) => e.id === containerId);
  if (!container || !/flex/.test(container.style.display ?? "")) return null;
  const units = new Map<number, StackUnit>();
  for (const l of m.base.layers) {
    const path = pathIn(m.baseCapture, l.element);
    const at = path.findIndex((e) => e.id === containerId);
    if (at < 1) continue; // not inside, or the container's own paint
    const child = path[at - 1]!;
    const unit = units.get(child.id) ?? { child, sigs: [] };
    unit.sigs.push(l.sig);
    units.set(child.id, unit);
  }
  return { container, units: [...units.values()].sort((a, b) => a.child.id - b.child.id) };
}

/**
 * Flex containers whose children move between presets (in the base capture of
 * one size), with the stack spec and the container's depth in the page.
 */
export function stackContainers(m: SizeMaps): Array<{
  container: CapturedElement;
  depth: number;
  stack: StackSpec;
}> {
  if (!m.minimal) return [];
  const cap = m.baseCapture;
  const minimal = new Map(m.minimal.layers.map((l) => [l.sig, l.box]));
  const W = cap.native.w;
  const pathOf = (id: number) => pathIn(cap, id);
  const flexOf = (id: number): CapturedElement | undefined =>
    pathOf(id)
      .slice(1)
      .find((e) => /flex/.test(e.style.display ?? ""));
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
      depth: pathOf(g.container.id).length,
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

type Geometry = Partial<Record<TemplateSize, LayerBox>>;
type Px = { x: number; y: number; w: number; h: number };

/**
 * Whether a flex layout of the items (their own sizes, the stack's gap,
 * justify and align, as the renderer lays them out) puts each one where the
 * pack drew it, within `tolerance` px. A pack that places items with auto
 * margins or padding the stack can't express fails, and stays as drawn.
 */
export function flexReproduces(
  stack: StackSpec,
  box: Px,
  items: Px[],
  W: number,
  tolerance: number,
): boolean {
  if (!items.length) return true;
  const column = stack.direction === "column";
  const main = (b: Px) => (column ? b.h : b.w);
  const cross = (b: Px) => (column ? b.w : b.h);
  const start = column ? box.y : box.x;
  const crossStart = column ? box.x : box.y;
  const room = main(box);
  const crossRoom = cross(box);
  const gap = ((stack.gap ?? 0) / 100) * W;
  const sizes = items.map(main);
  const used = sizes.reduce((a, b) => a + b, 0);
  const n = items.length;
  const free = room - used - gap * (n - 1);
  let at = start;
  let between = gap;
  switch (stack.justify ?? "start") {
    case "end":
      at = start + free;
      break;
    case "center":
      at = start + free / 2;
      break;
    case "space-between":
      between = n > 1 ? (room - used) / (n - 1) : 0;
      break;
    case "space-around":
      between = (room - used) / n;
      at = start + between / 2;
      break;
    case "space-evenly":
      between = (room - used) / (n + 1);
      at = start + between;
      break;
  }
  return items.every((b, i) => {
    const mainAt = at;
    at += sizes[i]! + between;
    const align = stack.align ?? "start";
    const crossAt =
      align === "center"
        ? crossStart + (crossRoom - cross(b)) / 2
        : align === "end"
          ? crossStart + crossRoom - cross(b)
          : crossStart;
    const [x, y] = column ? [crossAt, mainAt] : [mainAt, crossAt];
    return Math.abs(x - b.x) <= tolerance && Math.abs(y - b.y) <= tolerance;
  });
}

/** A stack across sizes: its spec, depth, box per size and flex items (each with a box per size). */
export interface MergedStack {
  sigs: string[];
  depth: number;
  stack: StackSpec;
  geometry: Geometry;
  units: Array<{ sigs: string[]; geometry: Geometry }>;
}

/** How many groups deep a layer goes (0 for a layer that isn't a group). */
function groupDepth(l: TemplateLayerV2): number {
  return l.kind === "group" ? 1 + Math.max(0, ...(l as GroupLayerV2).children.map(groupDepth)) : 0;
}

/**
 * Wrap stacked layers into groups, innermost stack first: each flex item is
 * its one layer (or inner stack), or a plain group of what one child of the
 * container draws, in that child's box. Items keep their paint order.
 */
export function applyStacks(
  layers: TemplateLayerV2[],
  sigOf: Map<string, string>,
  stacks: MergedStack[],
  prefix = "",
): TemplateLayerV2[] {
  let out = [...layers];
  const holds = (l: TemplateLayerV2, sig: string): boolean =>
    sigOf.get(l.id) === sig ||
    (l.kind === "group" && (l as GroupLayerV2).children.some((c) => holds(c, sig)));
  // Every top-level layer holding the signature: a text split by size is one layer per size.
  const holdersOf = (sig: string) => out.filter((l) => holds(l, sig));
  [...stacks]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.depth - a.s.depth)
    .forEach(({ s, i }) => {
      const items: TemplateLayerV2[] = [];
      const taken = new Set<TemplateLayerV2>();
      s.units.forEach((u, j) => {
        const holders = [...new Set(u.sigs.flatMap(holdersOf))].filter((h) => !taken.has(h));
        if (!holders.length) return;
        holders.forEach((h) => taken.add(h));
        holders.sort((a, b) => out.indexOf(a) - out.indexOf(b));
        // One layer whose box is its element's is the item itself; otherwise (a text's
        // glyph box, several layers) a group in the element's box, as the pack laid it out.
        const sameBox =
          holders.length === 1 &&
          Object.entries(u.geometry).every(([size, b]) => {
            const own = holders[0]!.geometry[size as TemplateSize];
            return (
              !!own &&
              !!b &&
              Math.abs(own.x - b.x) < 0.3 &&
              Math.abs(own.y - b.y) < 0.3 &&
              Math.abs(own.w - b.w) < 0.3 &&
              Math.abs(own.h - b.h) < 0.3
            );
          });
        items.push(
          sameBox
            ? holders[0]!
            : ({
                id: `${prefix}stack${i + 1}-item${j + 1}`,
                kind: "group",
                name: "Stack item",
                geometry: u.geometry,
                children: holders,
              } as GroupLayerV2),
        );
      });
      if (items.length < 2) return;
      // A stack needs a box on every size its members draw on: where the pack lays the
      // block out without flex (no stack there), they keep their own boxes instead.
      const drawnOn = (l: TemplateLayerV2): TemplateSize[] =>
        (l.sizes ?? SIZES).filter((size) => l.geometry[size]);
      if ([...taken].some((h) => drawnOn(h).some((size) => !s.geometry[size]))) return;
      // Groups nest four deep at most: an outer stack that would go deeper keeps its
      // items where the pack drew them (inner stacks, done first, keep their flow).
      if (1 + Math.max(...items.map(groupDepth)) > MAX_STACK_DEPTH) return;
      const at = Math.min(...[...taken].map((h) => out.indexOf(h)));
      const group: GroupLayerV2 = {
        id: `${prefix}stack${i + 1}`,
        kind: "group",
        name: "Stack",
        stack: s.stack,
        geometry: s.geometry,
        children: items,
      };
      out = out.filter((l) => !taken.has(l));
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
  // Containers that stack in any size, by element: the same element in every
  // size's capture (one pack template), so a stack and its items span sizes.
  const specs = new Map<number, { depth: number; stack: StackSpec }>();
  for (const m of maps)
    for (const c of stackContainers(m))
      if (!specs.has(c.container.id)) specs.set(c.container.id, { depth: c.depth, stack: c.stack });
  type Unit = MergedStack["units"][number];
  const stacks = new Map<number, MergedStack & { unitsById: Map<number, Unit> }>();
  // A container stacks only where a flex layout reproduces the pack in every size.
  const rejected = new Set<number>();
  if (specs.size)
    for (const m of maps) {
      // Boxes from the capture the layers' boxes came from, so a bottom-anchored
      // block holds the worst-case title its children are sized for.
      const twins = m.geometry ? alignTrees(new Tree(m.baseCapture), new Tree(m.geometry)) : null;
      const W = m.baseCapture.native.w;
      const H = m.baseCapture.native.h;
      const pxOf = (el: CapturedElement): Px => {
        const twin = twins?.get(el.id);
        return twin && twin.tag === el.tag ? twin.box : el.box;
      };
      const boxOf = (el: CapturedElement): LayerBox => {
        const b = pxOf(el);
        return {
          x: r2((b.x / W) * 100),
          y: r2((b.y / H) * 100),
          w: r2((b.w / W) * 100),
          h: r2((b.h / H) * 100),
        };
      };
      for (const [id, spec] of specs) {
        if (rejected.has(id)) continue;
        const found = stackUnits(m, id);
        if (!found || found.units.length < 2) continue;
        if (
          !flexReproduces(
            spec.stack,
            pxOf(found.container),
            found.units.map((u) => pxOf(u.child)),
            W,
            W * 0.01,
          )
        ) {
          rejected.add(id);
          stacks.delete(id);
          continue;
        }
        const entry = stacks.get(id) ?? {
          sigs: [],
          depth: spec.depth,
          stack: spec.stack,
          geometry: {},
          units: [],
          unitsById: new Map<number, Unit>(),
        };
        entry.geometry[m.size] = boxOf(found.container);
        for (const u of found.units) {
          let unit = entry.unitsById.get(u.child.id);
          if (!unit) {
            unit = { sigs: [], geometry: {} };
            entry.unitsById.set(u.child.id, unit);
            entry.units.push(unit);
          }
          for (const sig of u.sigs) {
            if (!unit.sigs.includes(sig)) unit.sigs.push(sig);
            if (!entry.sigs.includes(sig)) entry.sigs.push(sig);
          }
          unit.geometry[m.size] = boxOf(u.child);
        }
        stacks.set(id, entry);
      }
    }
  return { layers: applyStacks(layers, sigOf, [...stacks.values()], prefix), stacks: stacks.size };
}
