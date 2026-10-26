/**
 * A layer's design signature (editable-elements plan, C2): what it draws, not
 * where. The same piece of a design on any page, kind or look has the same
 * signature, so the element library finds each distinct decoration once.
 *
 * Part of the design: the kind, content, binding, drawing, rows, style and
 * motion, and a group's stack and children (by their own designs). Not part
 * of it: ids, names, boxes and sizes, conditions, visibility, locks, links,
 * groups and edit times. A converted pack's per-size copies of one element
 * differ in style (a size's own font size), so they have different
 * signatures and share a `link` instead.
 */
import type { TemplateDocumentV2, TemplateLayerV2 } from "./format";

/** Where a layer is and how it's handled, rather than what it draws. */
const PLACE_KEYS = new Set([
  "id",
  "name",
  "hidden",
  "locked",
  "group",
  "link",
  "sig",
  "sizes",
  "geometry",
  "editedAt",
  "showWhen",
  "animation",
]);

/** JSON with keys sorted, so key order never changes a signature. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The layer without its place, its children's designs in place of the children. */
function design(layer: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(layer)) {
    if (PLACE_KEYS.has(k)) continue;
    out[k] =
      k === "children" && Array.isArray(v)
        ? v.map((c) => (c && typeof c === "object" ? design(c as Record<string, unknown>) : c))
        : v;
  }
  return out;
}

/** 32-bit FNV-1a from `seed`. */
function fnv(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A layer's design signature: `<kind>:<hash>`, 64 bits of hash in base 36. */
export function layerSignature(layer: TemplateLayerV2): string {
  const text = stable(design(layer as unknown as Record<string, unknown>));
  const hash = [0x811c9dc5, 0x9747b28c]
    .map((seed) => fnv(text, seed).toString(36).padStart(7, "0"))
    .join("");
  return `${String(layer.kind)
    .toLowerCase()
    .replace(/[^a-z]/g, "")}:${hash}`;
}

/**
 * Every layer of a v2 document, groups' children included, given its design
 * signature (`sig`), in place; returns how many changed. A v1 document is
 * left alone.
 */
export function signDocument(doc: TemplateDocumentV2): number {
  if (!doc || typeof doc !== "object" || !doc.pages) return 0;
  let changed = 0;
  const visit = (layers: TemplateLayerV2[]) => {
    for (const layer of layers) {
      if (layer.kind === "group" && Array.isArray(layer.children)) visit(layer.children);
      const sig = layerSignature(layer);
      if (layer.sig !== sig) {
        layer.sig = sig;
        changed++;
      }
    }
  };
  for (const page of Object.values(doc.pages)) if (page?.layers) visit(page.layers);
  return changed;
}
