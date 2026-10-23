/**
 * Editor v2's view of a template document (ADR-011, L5-B).
 *
 * A template is a format v2 document: pages, each a list of layers, with
 * stack groups, conditions, text fit, styles, vectors and motion. The editor
 * edits one page at a time as a flat `{ layers }` document, so every existing
 * editing operation (move, resize, arrange, clipboard, undo) works unchanged;
 * this module maps a page in and out of the whole document.
 *
 * A version 1 document (`{ layers }`, the pilot's templates and the starters)
 * opens as its kind's primary page and is saved back as version 1 for as long
 * as nothing version-2-only is used, so its stored shape (and render) stays
 * exactly as it was.
 */
import {
  isDocumentV2,
  kindPages,
  MAX_STACK_DEPTH,
  pageTokens,
  primaryPage,
  tokenContentField,
  isCoreContentField,
  templateDocumentErrors,
  usesMatchGraphicsContent,
  V2_STYLE_KEYS,
  type LayerMotion,
  type PageKey,
  type ShowWhen,
  type StackSpec,
  type TemplateStyleV2,
  type TextFit,
} from "@workspace/scorecard/kind-templates";
import { isContentKind, presetFields, type ContentPreset } from "@workspace/scorecard/card-content";
import type { CardAdjustments, FreeLayer, LayerBox } from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { boxOf, newId, type EditorDoc } from "./document";

/** The v2 fields a layer may carry beyond the editor's `FreeLayer`. */
export type LayerV2Extras = {
  showWhen?: ShowWhen;
  fit?: TextFit;
  motion?: LayerMotion;
  stack?: StackSpec;
  children?: EditorLayer[];
  svg?: string;
  style?: TemplateStyleV2;
};
export type EditorLayer = Omit<FreeLayer, "style" | "kind"> &
  LayerV2Extras & { kind: FreeLayer["kind"] | "group" | "vector" };

/** A whole template as the editor holds it: always pages. */
export type TemplateDoc = Omit<CardAdjustments, "pages" | "formatVersion"> & {
  formatVersion: 2;
  pages: Partial<Record<PageKey, { layers: FreeLayer[] }>>;
};

/** The whole document as the renderer takes it (it reads pages through `normaliseDocument`). */
export const asAdjustments = (doc: TemplateDoc): CardAdjustments =>
  doc as unknown as CardAdjustments;

export type OpenedTemplate = { doc: TemplateDoc; sourceFormat: 1 | 2 };

const asLayers = (v: unknown): FreeLayer[] => (Array.isArray(v) ? (v as FreeLayer[]) : []);

/** Open a stored document: v2 as it is, v1 as its kind's primary page (layers untouched). */
export function openTemplate(document: unknown, kind: string): OpenedTemplate {
  const d = (document ?? {}) as Record<string, unknown>;
  const sponsorLock = d.sponsorLock === true ? { sponsorLock: true } : {};
  if (isDocumentV2(document)) {
    const pages: TemplateDoc["pages"] = {};
    for (const [key, page] of Object.entries(document.pages ?? {})) {
      pages[key as PageKey] = { layers: asLayers((page as { layers?: unknown }).layers) };
    }
    return {
      doc: {
        formatVersion: 2,
        pages,
        ...(document.timeline ? { timeline: document.timeline } : {}),
        ...(document.palettes ? { palettes: document.palettes } : {}),
        ...sponsorLock,
      },
      sourceFormat: 2,
    };
  }
  return {
    doc: {
      formatVersion: 2,
      pages: { [primaryPage(kind)]: { layers: asLayers(d.layers) } },
      ...sponsorLock,
    },
    sourceFormat: 1,
  };
}

/** The pages the editor offers for a kind, primary first. */
export const editorPages = (kind: string): readonly PageKey[] => kindPages(kind);

/** One page as a flat editor document. */
export function pageDoc(doc: TemplateDoc, page: PageKey): EditorDoc {
  return {
    layers: doc.pages[page]?.layers ?? [],
    ...(doc.sponsorLock ? { sponsorLock: true } : {}),
  };
}

/** The whole document with one page replaced (an emptied page is dropped). */
export function withPage(doc: TemplateDoc, page: PageKey, next: EditorDoc): TemplateDoc {
  const pages = { ...doc.pages };
  const layers = next.layers ?? [];
  if (layers.length) pages[page] = { layers };
  else delete pages[page];
  const out: TemplateDoc = { ...doc, pages };
  if (next.sponsorLock) out.sponsorLock = true;
  else delete out.sponsorLock;
  return out;
}

/** Whether a layer (or any child) uses something only format v2 can hold. */
export function layerIsV2Only(layer: EditorLayer): boolean {
  if (layer.kind === "group" || layer.kind === "vector") return true;
  if (layer.showWhen || layer.fit || layer.motion || layer.stack || layer.children) return true;
  if (usesMatchGraphicsContent(layer)) return true;
  const v2Style = (style: unknown) =>
    !!style && V2_STYLE_KEYS.some((k) => (style as Record<string, unknown>)[k] !== undefined);
  if (v2Style(layer.style)) return true;
  // A list's cells and row styles (italic row text) count too.
  const rows = layer.rows;
  return (
    !!rows &&
    ((rows.cells ?? []).some((c) => v2Style(c.style)) ||
      Object.values(rows.variants ?? {}).some((cells) => Object.values(cells).some(v2Style)))
  );
}

/** Whether the document needs format v2 to be stored. */
export function needsV2(doc: TemplateDoc, kind: string): boolean {
  const primary = primaryPage(kind);
  if (doc.timeline || doc.palettes?.length) return true;
  if (
    Object.entries(doc.pages).some(
      ([page, p]) =>
        (page !== primary && (p?.layers.length ?? 0) > 0) ||
        (p?.layers ?? []).some((l) => layerIsV2Only(l as EditorLayer)),
    )
  )
    return true;
  // A v1 form that wouldn't validate (an inserted element binds the venue or an
  // innings, which only v2's catalogue holds) is stored as v2.
  return templateDocumentErrors({ layers: doc.pages[primary]?.layers ?? [] }, kind).length > 0;
}

/** What is saved: version 1 when it was and still can be, else version 2. */
export function storedDocument(doc: TemplateDoc, kind: string, sourceFormat: 1 | 2): unknown {
  if (sourceFormat === 1 && !needsV2(doc, kind)) {
    return {
      layers: doc.pages[primaryPage(kind)]?.layers ?? [],
      ...(doc.sponsorLock ? { sponsorLock: true } : {}),
    };
  }
  const pages: TemplateDoc["pages"] = {};
  for (const [k, p] of Object.entries(doc.pages)) if (p?.layers.length) pages[k as PageKey] = p;
  return {
    formatVersion: 2,
    pages,
    ...(doc.timeline ? { timeline: doc.timeline } : {}),
    ...(doc.palettes?.length ? { palettes: doc.palettes } : {}),
    ...(doc.sponsorLock ? { sponsorLock: true } : {}),
  };
}

// ── Layers anywhere in a page (groups nest) ───────────────────────────────

const layersIn = (doc: EditorDoc) => (doc.layers ?? []) as EditorLayer[];

/** A layer at any depth, with its parent group (null at the top level). */
export function findLayer(
  doc: EditorDoc,
  id: string,
): { layer: EditorLayer; parent: EditorLayer | null } | null {
  const walk = (list: EditorLayer[], parent: EditorLayer | null): ReturnType<typeof findLayer> => {
    for (const l of list) {
      if (l.id === id) return { layer: l, parent };
      if (l.children) {
        const hit = walk(l.children, l);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(layersIn(doc), null);
}

const mapDeep = (list: EditorLayer[], fn: (l: EditorLayer) => EditorLayer): EditorLayer[] =>
  list.map((l) => {
    const next = fn(l);
    return next.children ? { ...next, children: mapDeep(next.children, fn) } : next;
  });

/** Patch a layer wherever it sits; `undefined` values remove the key. */
export function updateDeep(doc: EditorDoc, id: string, patch: Partial<EditorLayer>): EditorDoc {
  return {
    ...doc,
    layers: mapDeep(layersIn(doc), (l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch } as Record<string, unknown>;
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
      return next as EditorLayer;
    }) as FreeLayer[],
  };
}

/** How deep a layer's groups go (a plain layer is 0, a group of plain layers 1). */
export function depthOf(layer: EditorLayer): number {
  if (!layer.children?.length) return layer.kind === "group" ? 1 : 0;
  return 1 + Math.max(...layer.children.map(depthOf));
}

const union = (boxes: LayerBox[]): LayerBox => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
};

const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];

/**
 * Put top-level layers into a new stack group (a column, in their order down
 * the card), boxed to their bounds on every size they are on. Null when they
 * would nest deeper than `MAX_STACK_DEPTH` or aren't all at the top level.
 */
export function makeStack(
  doc: EditorDoc,
  ids: string[],
  size: CardSize,
): { doc: EditorDoc; id: string } | null {
  const top = layersIn(doc);
  const picked = top.filter((l) => ids.includes(l.id));
  if (!picked.length || picked.length !== ids.length) return null;
  if (Math.max(...picked.map(depthOf)) + 1 > MAX_STACK_DEPTH) return null;
  const ordered = [...picked].sort(
    (a, b) => (boxOf(a as FreeLayer, size)?.y ?? 0) - (boxOf(b as FreeLayer, size)?.y ?? 0),
  );
  const geometry: Partial<Record<CardSize, LayerBox>> = {};
  for (const s of SIZES) {
    const boxes = picked.map((l) => l.geometry?.[s]).filter((b): b is LayerBox => !!b);
    if (boxes.length) geometry[s] = union(boxes);
  }
  const sizes = picked.every((l) => !l.sizes)
    ? undefined
    : SIZES.filter((s) => picked.some((l) => !l.sizes || l.sizes.includes(s)));
  const id = newId("stack");
  const group: EditorLayer = {
    id,
    kind: "group",
    name: "Stack",
    stack: { direction: "column", gap: 1, align: "stretch" },
    geometry,
    ...(sizes ? { sizes } : {}),
    children: ordered,
  };
  const at = top.findIndex((l) => ids.includes(l.id));
  const rest = top.filter((l) => !ids.includes(l.id));
  rest.splice(Math.min(at, rest.length), 0, group);
  return { doc: { ...doc, layers: rest as FreeLayer[] }, id };
}

/** Undo a stack: its children go back to the top level where it was. */
export function unstack(doc: EditorDoc, id: string): EditorDoc {
  const top = layersIn(doc);
  const at = top.findIndex((l) => l.id === id);
  const group = top[at];
  if (!group?.children) return doc;
  const next = [...top];
  next.splice(at, 1, ...group.children);
  return { ...doc, layers: next as FreeLayer[] };
}

/** Move a child within its group (−1 up, +1 down). */
export function moveChild(
  doc: EditorDoc,
  groupId: string,
  childId: string,
  delta: -1 | 1,
): EditorDoc {
  const g = findLayer(doc, groupId)?.layer;
  const kids = [...(g?.children ?? [])];
  const i = kids.findIndex((c) => c.id === childId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= kids.length) return doc;
  [kids[i], kids[j]] = [kids[j]!, kids[i]!];
  return updateDeep(doc, groupId, { children: kids });
}

// ── Preview inputs ─────────────────────────────────────────────────────────

/** Remove `path` (dotted) from a copy of `obj`. */
function without(obj: Record<string, unknown>, path: string): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  if (!head || !(head in obj)) return obj;
  const copy = { ...obj };
  if (!rest.length) delete copy[head];
  else if (copy[head] && typeof copy[head] === "object")
    copy[head] = without(copy[head] as Record<string, unknown>, rest.join("."));
  return copy;
}

/**
 * The preview input at a content preset (T5.8): tokens whose content field
 * the preset hides are left out, so the layers they bind drop as on a card.
 * Kinds without presets are unchanged.
 */
export function presetInput(
  input: ShareCardInput,
  kind: string,
  page: PageKey,
  preset: ContentPreset,
): ShareCardInput {
  if (!isContentKind(kind)) return input;
  const visible = presetFields(kind, preset);
  const cat = pageTokens(kind, page);
  let out = input as unknown as Record<string, unknown>;
  for (const token of [...(cat?.fields ?? []), ...(cat?.images ?? []), ...(cat?.repeats ?? [])].map(
    (t) => t.key,
  )) {
    const field = tokenContentField(kind, page, token);
    if (field && !visible.has(field) && !isCoreContentField(kind, field)) out = without(out, token);
  }
  return out as unknown as ShareCardInput;
}

/** The input that draws `page`: bookends and the junior day page are selected by their flag. */
export function pageInput(input: ShareCardInput, kind: string, page: PageKey): ShareCardInput {
  if (page === primaryPage(kind)) return input;
  const base = input as unknown as Record<string, unknown>;
  if (page === "title" || page === "sponsors") {
    return {
      ...base,
      carouselPage: { page, title: "This weekend", dateRange: "Sat 11 – Sun 12 Oct", sponsors: [] },
    } as unknown as ShareCardInput;
  }
  if (page === "day") {
    return {
      ...base,
      junior: true,
      carouselDay: { heading: "Saturday juniors", fixtures: [], results: [] },
    } as unknown as ShareCardInput;
  }
  return input;
}

export const PAGE_LABEL: Record<PageKey, string> = {
  card: "Card",
  fixture: "Fixture",
  title: "Title page",
  day: "Junior day",
  sponsors: "Sponsors page",
  result: "Result",
  team: "Team",
};
