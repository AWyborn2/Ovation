/**
 * Linked layers (editable-elements plan, Stream C's `link`): a converted pack
 * draws one element as a copy per size, each on its own sizes with that
 * size's box, font size, corners and clip. The copies share a link id, and
 * the editor treats them as one element: an edit to one copy's content or
 * style reaches the others, while each keeps its own geometry.
 */
import type { FreeLayer } from "@/lib/pack-render";
import { childrenOf, type EditorDoc } from "./document";

/** Settings each copy keeps for its own size (or that aren't the element's look). */
const OWN = new Set([
  "id",
  "geometry",
  "editedAt",
  "sizes",
  "link",
  "children",
  "hidden",
  "locked",
  "group",
  "photo",
  "clip",
  "signature",
  "rows",
]);
/** Style settings each copy keeps for its own size. */
const OWN_STYLE = new Set(["fontSize", "radius"]);

type Patch = { fields: Record<string, unknown>; style: Record<string, unknown> };

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function walk(list: FreeLayer[], fn: (l: FreeLayer) => void): void {
  for (const l of list) {
    fn(l);
    walk(childrenOf(l), fn);
  }
}

/** What an edit changed on a copy that its linked copies should take too; null for nothing. */
function patchOf(was: FreeLayer, now: FreeLayer): Patch | null {
  const fields: Record<string, unknown> = {};
  const style: Record<string, unknown> = {};
  const a = was as unknown as Record<string, unknown>;
  const b = now as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (OWN.has(k) || k === "style" || same(a[k], b[k])) continue;
    fields[k] = b[k];
  }
  const sa = (was.style ?? {}) as Record<string, unknown>;
  const sb = (now.style ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (OWN_STYLE.has(k) || same(sa[k], sb[k])) continue;
    style[k] = sb[k];
  }
  return Object.keys(fields).length || Object.keys(style).length ? { fields, style } : null;
}

function applyPatch(l: FreeLayer, p: Patch): FreeLayer {
  const next = { ...l } as Record<string, unknown>;
  for (const [k, v] of Object.entries(p.fields)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  if (Object.keys(p.style).length) {
    const style = { ...(l.style ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(p.style)) {
      if (v === undefined) delete style[k];
      else style[k] = v;
    }
    next.style = style;
  }
  return next as unknown as FreeLayer;
}

function mapDeep(list: FreeLayer[], fn: (l: FreeLayer) => FreeLayer): FreeLayer[] {
  return list.map((l) => {
    const next = fn(l);
    const kids = childrenOf(next);
    return kids.length ? ({ ...next, children: mapDeep(kids, fn) } as FreeLayer) : next;
  });
}

/**
 * `next` with every content or style change made to a linked copy (since
 * `prev`) copied to the other copies sharing its link. Geometry and the
 * per-size settings stay each copy's own.
 */
export function syncLinks(prev: EditorDoc, next: EditorDoc): EditorDoc {
  const before = new Map<string, FreeLayer>();
  walk(prev.layers ?? [], (l) => {
    if (l.link) before.set(l.id, l);
  });
  if (!before.size) return next;
  const patches = new Map<string, { from: string; patch: Patch }[]>();
  walk(next.layers ?? [], (l) => {
    const was = l.link ? before.get(l.id) : undefined;
    if (!was || was === l || was.link !== l.link) return;
    const patch = patchOf(was, l);
    if (patch) patches.set(l.link!, [...(patches.get(l.link!) ?? []), { from: l.id, patch }]);
  });
  if (!patches.size) return next;
  return {
    ...next,
    layers: mapDeep(next.layers ?? [], (l) => {
      const list = l.link ? patches.get(l.link) : undefined;
      if (!list) return l;
      return list.reduce((acc, p) => (p.from === l.id ? acc : applyPatch(acc, p.patch)), l);
    }),
  };
}

/** The link ids of `ids` (at any depth) that other layers on the page still share. */
export function sharedLinks(prev: EditorDoc, next: EditorDoc, ids: string[]): string[] {
  const links = new Set<string>();
  walk(prev.layers ?? [], (l) => {
    if (ids.includes(l.id) && l.link) links.add(l.link);
  });
  const left = new Set<string>();
  walk(next.layers ?? [], (l) => {
    if (l.link && links.has(l.link)) left.add(l.link);
  });
  return [...left];
}

/** The page without any layer (at any depth) sharing one of `links`. */
export function removeLinked(doc: EditorDoc, links: string[]): EditorDoc {
  const drop = (list: FreeLayer[]): FreeLayer[] =>
    list
      .filter((l) => !(l.link && links.includes(l.link)) || l.locked)
      .map((l) => {
        const kids = childrenOf(l);
        return kids.length ? ({ ...l, children: drop(kids) } as FreeLayer) : l;
      });
  return { ...doc, layers: drop(doc.layers ?? []) };
}
