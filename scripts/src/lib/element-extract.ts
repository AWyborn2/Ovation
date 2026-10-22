/**
 * Element extraction (editable-elements plan, D2): every distinct decoration
 * in the ten looks, de-duplicated, named and sorted into the Elements panel's
 * categories, for `lib/template-bundles/elements/<look>.json`.
 *
 * - **Decorations** are top-level shapes and vectors, and groups (a group with
 *   text fields is a data block). Text, photos, images (the crest, sponsor
 *   logos), rows and v1 `element` boxes are left out: C3 splits the `ck.*`
 *   boxes into native layers, and a re-run picks those up.
 * - **One decoration, one element.** A look stores a decoration once per card
 *   size, with slightly different numbers. The signature ignores ids, names,
 *   positions and exact sizes and keeps what you see: kind, fill type (solid,
 *   gradient, see-through stops; not the colour, which a club recolours), the clip's shape rounded to a 25 % grid, borders, effects,
 *   and the box's proportion (wide, tall or squarish). The converter's `sig`
 *   (Stream C2) isn't used: it is exact per size and colour, so it would keep
 *   every per-size copy apart. Copies with the same
 *   signature in the same template page merge their per-size geometry when
 *   their style is identical, so an element can land at every size.
 * - **Categories** come from the box (in percent of the card) and the style:
 *   thin lines are rules, wide or angled strips bands, small pills badges,
 *   radial gradients, fades and whole-card patterns glows, polygon vectors
 *   slashes, boxes around the club crest crest frames, anything on the
 *   sponsors page sponsor strips. A plain full-card fill is the card's
 *   background, not a decoration, and is left out.
 * - Signatures are per look: a decoration in two looks is two elements,
 *   since each look draws it in its own colours. An exact copy of an earlier
 *   look's decoration is that look's, and converted looks come first (the
 *   starters borrow their pages), so it's credited to the look that made it.
 * - The most-used decorations are kept, up to `PER_CATEGORY` a look and
 *   category.
 */
import { createHash } from "node:crypto";
import {
  DERIVED_PALETTE_PREFIX,
  ELEMENT_CATEGORIES,
  TEMPLATE_SIZE_ORDER,
  elementDocumentErrors,
  type DerivedPalette,
  type ElementCategory,
  type ElementDocument,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";

/** Elements kept per look and category, most used first. */
export const PER_CATEGORY = 16;

/** The starters, credited last: their carousel pages are borrowed from converted looks. */
export const STARTER_LOOKS = ["club-kit-classic", "broadcast-classic", "clubhouse"];

type Box = { x: number; y: number; w: number; h: number };
type Layer = {
  id?: string;
  name?: string;
  kind?: string;
  content?: unknown;
  geometry?: Partial<Record<TemplateSize, Box>>;
  style?: Record<string, unknown>;
  svg?: string;
  children?: Layer[];
  [key: string]: unknown;
};

/** One look's templates, as the extraction reads them. */
export type LookInput = {
  slug: string;
  name: string;
  templates: Array<{ kind: string; document: unknown }>;
};

export type ExtractedElement = {
  slug: string;
  name: string;
  category: ElementCategory;
  tags: string[];
  signature: string;
  document: ElementDocument;
};

export type ElementFile = { look: string; elements: ExtractedElement[] };

export type ExtractSummary = {
  candidates: number;
  distinct: number;
  kept: number;
  invalid: Array<{ slug: string; error: string }>;
};

/** Layer keys that say where a layer is or what it's called, not what it looks like. */
const PLACEMENT_KEYS = new Set([
  "id",
  "name",
  "geometry",
  "sizes",
  "editedAt",
  "locked",
  "hidden",
  "motion",
  "showWhen",
  // Stream C2's design signature and per-size link id.
  "sig",
  "link",
]);

/** A page's layers, for a v1 (`{ layers }`) or v2 (`{ pages }`) document. */
function pagesOf(document: unknown): Array<[string, Layer[]]> {
  const doc = document as { layers?: Layer[]; pages?: Record<string, { layers?: Layer[] }> };
  if (doc.pages) return Object.entries(doc.pages).map(([page, p]) => [page, p.layers ?? []]);
  return [["card", doc.layers ?? []]];
}

/** The box a layer is judged by: its square geometry, else its first size. */
function refBox(layer: Layer): [TemplateSize, Box] | null {
  for (const size of ["square", ...TEMPLATE_SIZE_ORDER] as TemplateSize[]) {
    const b = layer.geometry?.[size];
    if (b && [b.x, b.y, b.w, b.h].every((n) => typeof n === "number")) return [size, b];
  }
  return null;
}

const tokensIn = (layer: Layer): string[] => {
  const out: string[] = [];
  const walk = (l: Layer) => {
    if (typeof l.content === "string")
      for (const m of l.content.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) out.push(m[1]!);
    l.children?.forEach(walk);
  };
  walk(layer);
  return out;
};

const hasKind = (layer: Layer, kind: string): boolean =>
  layer.kind === kind || (layer.children ?? []).some((c) => hasKind(c, kind));

/** A number rounded for the signature: proportions and clips to a coarse grid. */
const grid = (n: number, step: number) => Math.round(n / step) * step;

const COLOUR = /^(#[0-9a-f]{3,8}|var\(--|rgba?\(|hsla?\(|transparent$)/i;
const TRANSPARENT = /^(#[0-9a-f]{6}00|#[0-9a-f]{3}0|transparent)$|,\s*0(\.0+)?\s*\)$/i;

/** The box's proportion, coarsely: what a resized copy keeps. */
function proportion(b: Box): string {
  const r = b.w / Math.max(b.h, 0.01);
  return r >= 2.5 ? "wide" : r <= 0.4 ? "tall" : "even";
}

/** A style with what varies per size (widths, radii, blurs, clip points) rounded away. */
function lookOf(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    if (key === "polygon")
      return value.map((p) => (Array.isArray(p) ? p.map((n) => grid(Number(n), 25)) : p));
    return value.map((v) => lookOf(v, key));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      if (PLACEMENT_KEYS.has(k)) continue;
      out[k] = lookOf((value as Record<string, unknown>)[k], k);
    }
    return out;
  }
  if (typeof value === "number") {
    // Angles, gradient stops and opacity keep their meaning across sizes.
    if (["angle", "at", "opacity", "amount"].includes(key)) return grid(value, 5);
    return value > 0 ? "n" : value;
  }
  // Colours are brand tokens or the look's own: a club recolours either, so
  // only whether a colour is see-through tells two decorations apart.
  if (typeof value === "string" && COLOUR.test(value.trim()))
    return TRANSPARENT.test(value.trim()) ? "clear" : "colour";
  // A label's words (one chip per card kind) are edited per card; its fields aren't.
  if (key === "content" && typeof value === "string" && !/\{\{/.test(value)) return "words";
  return value;
}

/** What makes two decorations the same element. */
export function decorationSignature(layer: Layer): string {
  const box = refBox(layer)?.[1];
  const body = JSON.stringify([lookOf(layer), box ? proportion(box) : "none"]);
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

const exactStyle = (layer: Layer) =>
  JSON.stringify(Object.fromEntries(Object.entries(layer).filter(([k]) => !PLACEMENT_KEYS.has(k))));

/** The first colour a layer paints with. */
function mainColour(layer: Layer): string | null {
  const s = layer.style ?? {};
  const fill = s.fill ?? s.background ?? s.textFill;
  if (typeof fill === "string") return fill;
  if (fill && typeof fill === "object" && Array.isArray((fill as { stops?: unknown }).stops)) {
    const stop = (fill as { stops: Array<{ color?: unknown }> }).stops[0];
    if (typeof stop?.color === "string") return stop.color;
  }
  const border = s.border as { color?: unknown } | undefined;
  if (typeof border?.color === "string") return border.color;
  if (layer.kind === "vector" && typeof layer.svg === "string") {
    const m = /var\((--[\w-]+)/.exec(layer.svg);
    if (m) return `var(${m[1]})`;
  }
  for (const c of layer.children ?? []) {
    const found = mainColour(c);
    if (found) return found;
  }
  return null;
}

/** A plain word for a colour: the brand token it uses, or light, dark or tinted. */
export function colourWord(colour: string | null): string {
  if (!colour) return "Plain";
  const token = /var\((--[\w-]+)/.exec(colour)?.[1];
  if (token) {
    if (token === "--gold") return "Gold";
    if (token.startsWith("--panel")) return "Panel";
    if (token === "--ink") return "Ink";
    if (token === "--accent-ink") return "Accent";
    if (/chalk|white|light/.test(token)) return "Chalk";
    if (/glow/.test(token)) return "Glow";
    return "Kit";
  }
  const hex = /^#([0-9a-f]{6})/i.exec(colour)?.[1];
  if (hex) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const light = (Math.max(r!, g!, b!) + Math.min(r!, g!, b!)) / 2;
    return light > 0.8 ? "White" : light < 0.2 ? "Dark" : "Tinted";
  }
  return "Plain";
}

type Features = {
  box: Box;
  radial: boolean;
  fade: boolean;
  gradient: boolean;
  clip: boolean;
  outline: boolean;
  rounded: boolean;
  effect: boolean;
  texture: boolean;
};

function featuresOf(layer: Layer, box: Box): Features {
  const s = layer.style ?? {};
  const fill = s.fill as { type?: string; stops?: Array<{ color?: string }> } | undefined;
  // A v1 layer's gradient is CSS text in `background`.
  const css =
    typeof s.background === "string" && /gradient\(/i.test(s.background) ? s.background : "";
  const gradient = (!!fill && typeof fill === "object") || !!css;
  const transparentStop =
    (fill?.stops ?? []).some(
      (st) => typeof st.color === "string" && /^#[0-9a-f]{6}00$|transparent/i.test(st.color),
    ) || /transparent|#[0-9a-f]{6}00\b|,\s*0(\.0+)?\s*\)/i.test(css);
  const shadows = (s.boxShadow as Array<{ blur?: number }> | undefined) ?? [];
  return {
    box,
    radial: fill?.type === "radial" || /radial-gradient\(/i.test(css),
    fade: gradient && transparentStop,
    gradient,
    clip: !!s.clip,
    outline: !!s.border && !s.fill && !s.background,
    rounded: typeof s.radius === "number" && s.radius > 0,
    effect: shadows.some((sh) => (sh.blur ?? 0) >= 2) || Array.isArray(s.filter),
    texture: !!s.overlay,
  };
}

/** Whether a box sits around the crest on the same size, as a ring or plate behind it. */
function framesCrest(box: Box, crests: Box[]): boolean {
  return crests.some((c) => {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const inside = box.x <= cx && cx <= box.x + box.w && box.y <= cy && cy <= box.y + box.h;
    const ratio = box.w / Math.max(c.w, 0.01);
    return inside && ratio >= 0.9 && ratio <= 2 && box.h / Math.max(c.h, 0.01) >= 0.9;
  });
}

/** The category for a decoration, or null when it isn't one (a background, a speck). */
export function categorise(
  layer: Layer,
  page: string,
  crests: Box[],
): { category: ElementCategory; noun: string } | null {
  const ref = refBox(layer);
  if (!ref) return null;
  const f = featuresOf(layer, ref[1]);
  const { w, h } = f.box;
  const name = `${layer.name ?? ""} ${layer.id ?? ""}`.toLowerCase();
  if (layer.kind === "group") {
    if (tokensIn(layer).some((t) => /^sponsor/i.test(t)) || page === "sponsors")
      return { category: "sponsor-strips", noun: "sponsor strip" };
    if (hasKind(layer, "text")) return { category: "data-blocks", noun: "data block" };
  }
  if (Math.max(w, h) < 2) return null;
  const fullCard = w >= 97 && h >= 97;
  if (f.texture) return { category: "glows", noun: "texture" };
  if (f.radial || (f.effect && !fullCard)) return { category: "glows", noun: "glow" };
  // A starter names its fades ("Photo fade", "Ground tint"), which may blend to a colour.
  if (f.fade || (f.gradient && /fade|tint|glow|shade/.test(name)))
    return { category: "glows", noun: "fade" };
  // A whole-card vector is a pattern (Gold Foil's stripes); a plain fill is the background.
  if (fullCard) return layer.kind === "vector" ? { category: "glows", noun: "pattern" } : null;
  if (/sponsor/.test(name) || page === "sponsors")
    return { category: "sponsor-strips", noun: w >= h * 2.5 ? "sponsor strip" : "sponsor tile" };
  if (/crest|logo/.test(name) || framesCrest(f.box, crests))
    return { category: "crest-frames", noun: f.rounded ? "crest ring" : "crest plate" };
  if (layer.kind === "vector" && /<polygon/i.test(layer.svg ?? ""))
    return { category: "bands", noun: "slash" };
  const thin = Math.min(w, h);
  if (thin <= 1.6 && Math.max(w, h) >= thin * 3)
    return { category: "rules", noun: w >= h ? "rule" : "divider" };
  if (f.outline && w >= 20 && h >= 20) return { category: "frames", noun: "frame" };
  if (w <= 35 && h <= 15)
    return { category: "badges", noun: f.rounded && f.box.h <= 15 ? "pill" : "chip" };
  if (f.clip) return { category: "bands", noun: "slash" };
  if (w >= h * 2.5 || h >= w * 2.5) return { category: "bands", noun: w >= h ? "band" : "column" };
  if (f.outline) return { category: "frames", noun: "frame" };
  return { category: "frames", noun: f.rounded ? "panel" : "block" };
}

/** A starter layer's own name ("Accent slash"), when it has a real one. */
function ownName(layer: Layer): string | null {
  const n = (layer.name ?? "").trim();
  if (!n || /^(card|fixture|result|day|title|sponsors|team)-l\d+/i.test(n)) return null;
  if (/^(item|stack item|layer)\b/i.test(n)) return null;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A layer and its children with fresh, simple ids: `e1`, `e1-1`, ... */
function withIds(layer: Layer, id: string): Layer {
  const out: Layer = { ...layer, id };
  delete out.name;
  delete out.motion;
  delete out.showWhen;
  delete out.editedAt;
  delete out.locked;
  delete out.hidden;
  delete out.sig;
  delete out.link;
  if (layer.children) out.children = layer.children.map((c, i) => withIds(c, `${id}-${i + 1}`));
  return out;
}

/** The derived palettes a layer's colours draw on. */
function palettesFor(layer: Layer): DerivedPalette[] | undefined {
  const text = JSON.stringify(layer);
  const used = (Object.entries(DERIVED_PALETTE_PREFIX) as Array<[DerivedPalette, string]>)
    .filter(([, prefix]) => text.includes(`var(${prefix}`))
    .map(([p]) => p);
  return used.length > 0 ? used : undefined;
}

type Occurrence = {
  look: string;
  kind: string;
  page: string;
  layer: Layer;
  category: ElementCategory;
  noun: string;
  palettes: DerivedPalette[] | undefined;
};

/** Converted looks first, then the starters, each in slug order. */
export function lookOrder(looks: LookInput[]): LookInput[] {
  const rank = (s: string) => (STARTER_LOOKS.includes(s) ? 1 : 0);
  return [...looks].sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));
}

export function extractElements(looks: LookInput[]): {
  files: ElementFile[];
  summary: ExtractSummary;
} {
  const summary: ExtractSummary = { candidates: 0, distinct: 0, kept: 0, invalid: [] };
  // Per look: signature -> its copies. A copy an earlier look already has,
  // exactly, is that look's (the starters borrow converted looks' pages).
  const bySignature = new Map<string, Map<string, Occurrence[]>>();
  const earlier = new Set<string>();
  const ordered = lookOrder(looks);
  for (const look of ordered) {
    const mine = new Map<string, Occurrence[]>();
    const exact = new Set<string>();
    for (const t of [...look.templates].sort((a, b) => a.kind.localeCompare(b.kind))) {
      for (const [page, layers] of pagesOf(t.document)) {
        const crests = layers
          .filter((l) => l.kind === "image" && /\{\{\s*clubLogo\s*\}\}/.test(String(l.content)))
          .map((l) => refBox(l)?.[1])
          .filter((b): b is Box => !!b);
        for (const layer of layers) {
          if (!["shape", "vector", "group"].includes(layer.kind ?? "")) continue;
          if (layer.kind === "group" && !hasKind(layer, "shape") && !hasKind(layer, "vector"))
            continue;
          const sorted = categorise(layer, page, crests);
          if (!sorted) continue;
          summary.candidates += 1;
          const key = exactStyle(layer);
          exact.add(key);
          if (earlier.has(key)) continue;
          const sig = decorationSignature(layer);
          const list = mine.get(sig) ?? [];
          list.push({
            look: look.slug,
            kind: t.kind,
            page,
            layer,
            ...sorted,
            palettes: palettesFor(layer),
          });
          mine.set(sig, list);
        }
      }
    }
    for (const key of exact) earlier.add(key);
    bySignature.set(look.slug, mine);
    summary.distinct += mine.size;
  }

  const files: ElementFile[] = [];
  for (const look of ordered) {
    const mine = bySignature.get(look.slug)!;
    // Most used first.
    const candidates = [...mine]
      .map(([sig, occ]) => ({ sig, uses: occ.length, first: occ[0]! }))
      .sort((a, b) => b.uses - a.uses || a.sig.localeCompare(b.sig));
    const names = new Set<string>();
    const slugs = new Set<string>();
    const kept: ExtractedElement[] = [];
    for (const category of ELEMENT_CATEGORIES) {
      const inCategory = candidates.filter((c) => c.first.category === category);
      let n = 0;
      for (const { sig, first } of inCategory) {
        if (n >= PER_CATEGORY) break;
        const merged = mergeSizes(first, mine.get(sig)!);
        let name =
          ownName(first.layer) ?? `${colourWord(mainColour(first.layer))} ${first.noun}`.trim();
        for (let i = 2; names.has(name.toLowerCase()); i++)
          name = `${name.replace(/ \d+$/, "")} ${i}`;
        let slug = `${look.slug}/${category}/${slugify(name)}`;
        for (let i = 2; slugs.has(slug); i++)
          slug = `${look.slug}/${category}/${slugify(name)}-${i}`;
        const document: ElementDocument = {
          formatVersion: 2,
          layers: [withIds(merged, "e1")] as unknown as ElementDocument["layers"],
          ...(first.palettes ? { palettes: first.palettes } : {}),
        };
        const errors = elementDocumentErrors(document);
        if (errors.length > 0) {
          summary.invalid.push({ slug, error: errors[0]! });
          continue;
        }
        names.add(name.toLowerCase());
        slugs.add(slug);
        kept.push({
          slug,
          name,
          category,
          tags: tagsFor(look.slug, category, first, name),
          signature: sig,
          document,
        });
        n += 1;
      }
    }
    summary.kept += kept.length;
    if (kept.length > 0) files.push({ look: look.slug, elements: kept });
  }
  return { files, summary };
}

/**
 * The first copy, with the sizes it lacks taken from other copies on the same
 * template page whose style is identical (a look's per-size copies).
 */
function mergeSizes(first: Occurrence, all: Occurrence[]): Layer {
  const geometry = { ...(first.layer.geometry ?? {}) };
  const style = exactStyle(first.layer);
  for (const o of all) {
    if (o.look !== first.look || o.kind !== first.kind || o.page !== first.page) continue;
    if (exactStyle(o.layer) !== style) continue;
    for (const size of TEMPLATE_SIZE_ORDER) {
      if (!geometry[size] && o.layer.geometry?.[size]) geometry[size] = o.layer.geometry[size];
    }
  }
  const merged: Layer = { ...first.layer, geometry };
  // A layer's `sizes` lists where it shows; it follows the merged geometry.
  if (Array.isArray(first.layer.sizes))
    merged.sizes = TEMPLATE_SIZE_ORDER.filter((size) => geometry[size]);
  return merged;
}

function tagsFor(look: string, category: ElementCategory, o: Occurrence, name: string): string[] {
  const box = refBox(o.layer)![1];
  const f = featuresOf(o.layer, box);
  const tags = [
    look,
    category,
    ...name.toLowerCase().split(/\s+/),
    o.layer.kind ?? "",
    f.gradient ? "gradient" : "",
    f.clip ? "angled" : "",
    f.outline ? "outline" : "",
    f.rounded ? "rounded" : "",
  ];
  return [...new Set(tags.filter((t) => t && t.length <= 24))].slice(0, 12);
}

/** A Club Kit panel piece as native layers (`native-ck-pieces.ts`). */
export type PieceInput = {
  id: string;
  label: string;
  keywords: string;
  layers: unknown[];
};

/** Where each Club Kit piece sits among the panel's categories. */
export const PIECE_CATEGORIES: Record<string, ElementCategory> = {
  "ck.background": "frames",
  "ck.frame-side": "frames",
  "ck.frame-top": "frames",
  "ck.trim": "bands",
  "ck.watermark": "crest-frames",
  "ck.crest": "crest-frames",
  "ck.club-lockup": "crest-frames",
  "ck.kind-chip": "badges",
  "ck.tricolour-rule": "rules",
  "ck.hashtag": "badges",
  "ck.sponsor-strip": "sponsor-strips",
  "ck.eyebrow": "data-blocks",
  "ck.headline": "data-blocks",
  "ck.result-word": "data-blocks",
  "ck.big-number": "data-blocks",
  "ck.player-name": "data-blocks",
  "ck.meta": "data-blocks",
  "ck.score-bars": "data-blocks",
  "ck.result-line": "data-blocks",
  "ck.stat-cells": "data-blocks",
  "ck.leader-rows": "data-blocks",
  "ck.grade-rows": "data-blocks",
  "ck.xi-list": "data-blocks",
  "ck.trading-card": "frames",
  "ck.prem-stars": "badges",
  "ck.premiers-lockup": "data-blocks",
  "ck.gf-panel": "data-blocks",
  "ck.junior-rows": "data-blocks",
  "ck.junior-privacy": "data-blocks",
};

/** One signature for a piece's layers: the layer itself, or a group of them. */
const piecesSignature = (layers: Layer[]): string =>
  decorationSignature(
    layers.length === 1
      ? layers[0]!
      : { kind: "group", geometry: layers[0]?.geometry, children: layers },
  );

/**
 * The Club Kit pieces added to `look`'s elements, named as the panel named
 * them. A piece the extraction already found (the starters drew seven of them,
 * split by C3) is left out, by signature against every look's elements.
 */
export function addPieces(
  files: ElementFile[],
  pieces: PieceInput[],
  look: string,
): { added: string[]; duplicates: string[]; invalid: Array<{ slug: string; error: string }> } {
  const seen = new Set(
    files.flatMap((f) => f.elements.map((e) => piecesSignature(e.document.layers as Layer[]))),
  );
  let file = files.find((f) => f.look === look);
  if (!file) {
    file = { look, elements: [] };
    files.push(file);
  }
  const slugs = new Set(file.elements.map((e) => e.slug));
  const out = {
    added: [] as string[],
    duplicates: [] as string[],
    invalid: [] as Array<{ slug: string; error: string }>,
  };
  for (const piece of pieces) {
    const category = PIECE_CATEGORIES[piece.id];
    if (!category) continue;
    const layers = piece.layers as Layer[];
    const signature = piecesSignature(layers);
    if (seen.has(signature)) {
      out.duplicates.push(piece.id);
      continue;
    }
    const name = piece.label.replace(/\s+—\s+/, ", ");
    let slug = `${look}/${category}/${slugify(name)}`;
    for (let i = 2; slugs.has(slug); i++) slug = `${look}/${category}/${slugify(name)}-${i}`;
    const copies = layers.map((l, i) => withIds(l, `e${i + 1}`));
    const palettes = palettesFor({ kind: "group", children: copies });
    const document: ElementDocument = {
      formatVersion: 2,
      layers: copies as unknown as ElementDocument["layers"],
      ...(palettes ? { palettes } : {}),
    };
    const errors = elementDocumentErrors(document);
    if (errors.length > 0) {
      out.invalid.push({ slug, error: errors[0]! });
      continue;
    }
    seen.add(signature);
    slugs.add(slug);
    const tags = [look, category, "club kit", ...piece.keywords.toLowerCase().split(/\s+/)];
    file.elements.push({
      slug,
      name,
      category,
      tags: [...new Set(tags.filter((t) => t && t.length <= 24))].slice(0, 12),
      signature,
      document,
    });
    out.added.push(piece.id);
  }
  return out;
}
