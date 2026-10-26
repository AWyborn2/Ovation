/**
 * A fresh conversion's links and skews carried onto a hand-polished
 * document (editable-elements plan, C4). A look polished by hand (Club Kit,
 * Broadcast Dark, Duotone) can't be re-converted without losing the polish,
 * so what the converter now adds is copied across instead.
 *
 * Each polished layer is matched to the fresh layer that is plainly the same
 * one: the same kind, content and paint (fill), on all of its sizes, with
 * its box within `NEAR` on each (for a skewed panel, its centre: the fresh
 * layer is the panel's own box, the polished one its clipped bounding box).
 * Ids aren't used: the converter numbers layers in paint order, which moves
 * when it changes. A polished layer with no such match is left as it is.
 *
 * - `link`: polished layers matched to one fresh layer (its per-size
 *   copies) or to one fresh link group are linked, when each is on sizes
 *   the others aren't.
 * - `skew`: a panel cut to its skewed corners (C1's clip) becomes its own
 *   box with the skew.
 */
import type {
  LayerBox,
  TemplateDocumentV2,
  TemplateLayerV2,
  TemplateSize,
} from "@workspace/scorecard/kind-templates";

/** How far apart (percent of the artboard) two boxes of the same layer may be. */
const NEAR = 0.6;

const leaves = (layers: TemplateLayerV2[]): TemplateLayerV2[] =>
  layers.flatMap((l) => (l.kind === "group" ? leaves(l.children ?? []) : [l]));

const sizesOf = (l: TemplateLayerV2) =>
  (l.sizes ?? (Object.keys(l.geometry) as TemplateSize[])).filter((s) => l.geometry[s]);

/** What a layer is, apart from its sizes' own lengths: kind, content and paint. */
function identity(l: TemplateLayerV2): string {
  const x = l as TemplateLayerV2 & {
    content?: string;
    bind?: string;
    svg?: string;
    rows?: { repeat?: string };
  };
  return JSON.stringify([
    l.kind,
    x.content ?? x.bind ?? null,
    x.svg ?? null,
    x.rows?.repeat ?? null,
    l.style?.fill ?? null,
    l.style?.textFill ?? null,
  ]);
}

const centre = (b: LayerBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** How far a fresh layer is from a polished one over the polished one's sizes; null if not near. */
function distance(mine: TemplateLayerV2, fresh: TemplateLayerV2): number | null {
  const byCentre = !!fresh.style?.skew && !mine.style?.skew;
  let total = 0;
  for (const s of sizesOf(mine)) {
    const [a, b] = [mine.geometry[s], fresh.geometry[s]];
    if (!a || !b) return null;
    const d = byCentre
      ? [centre(a).x - centre(b).x, centre(a).y - centre(b).y]
      : [a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h];
    if (d.some((v) => Math.abs(v) > NEAR)) return null;
    total += d.reduce((t, v) => t + Math.abs(v), 0);
  }
  return total;
}

export type TransplantResult = {
  /** Polished layers matched to a fresh one, and those left as they were. */
  matched: number;
  unmatched: number;
  /** Groups of copies linked, and the layers in them. */
  links: number;
  linkedLayers: number;
  skews: number;
};

/** Copy `fresh`'s links and skews onto `doc`, page by page, in place. */
export function transplant(doc: TemplateDocumentV2, fresh: TemplateDocumentV2): TransplantResult {
  const result: TransplantResult = {
    matched: 0,
    unmatched: 0,
    links: 0,
    linkedLayers: 0,
    skews: 0,
  };
  if (!doc.pages || !fresh.pages) return result;
  for (const [key, page] of Object.entries(doc.pages)) {
    const theirs = fresh.pages[key as keyof typeof fresh.pages];
    if (!page?.layers) continue;
    const candidates = new Map<string, TemplateLayerV2[]>();
    for (const l of leaves(theirs?.layers ?? []))
      candidates.set(identity(l), [...(candidates.get(identity(l)) ?? []), l]);

    // Each polished layer's fresh twin: the nearest of the same kind, content and paint.
    const twins = new Map<TemplateLayerV2, TemplateLayerV2>();
    for (const m of leaves(page.layers)) {
      let best: { l: TemplateLayerV2; d: number } | null = null;
      for (const l of candidates.get(identity(m)) ?? []) {
        const d = distance(m, l);
        if (d !== null && (!best || d < best.d)) best = { l, d };
      }
      if (best) twins.set(m, best.l);
      else result.unmatched++;
    }
    result.matched += twins.size;

    // Skews: the slanted panel's own box in place of its clipped bounding box.
    for (const [m, l] of twins) {
      const skew = l.style?.skew;
      if (!skew || m.style?.skew || !m.style?.clip) continue;
      const { clip: _clip, ...style } = m.style;
      m.style = { ...style, skew };
      for (const s of sizesOf(m)) m.geometry[s] = l.geometry[s];
      result.skews++;
    }

    // Links: copies of one fresh layer, or of one fresh link group.
    const byLink = new Map<string, TemplateLayerV2[]>();
    for (const [m, l] of twins) {
      const link = l.link ?? l.id;
      byLink.set(link, [...(byLink.get(link) ?? []), m]);
    }
    for (const [link, members] of byLink) {
      if (members.length < 2) continue;
      // Copies are on different sizes; two on one size are layers of their own.
      const sizes = members.flatMap(sizesOf);
      if (new Set(sizes).size !== sizes.length) continue;
      for (const m of members) m.link = link;
      result.links++;
      result.linkedLayers += members.length;
    }
  }
  return result;
}
