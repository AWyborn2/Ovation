/**
 * Reading any stored document as format v2 (ADR-011 §1, T1.2).
 *
 * - A v1 document `{ layers }` (the pilot club's templates and drafts, the
 *   starters) reads as `{ formatVersion: 2, pages: { <kind's primary page>:
 *   { layers } } }`.
 * - A layer's v1 `animation` reads as `motion.in` ("none" as no motion).
 *
 * In memory only: the stored object is never changed, so stored rows are
 * never rewritten. The result records which format it came from, so the
 * renderer can keep v1 documents byte-identical while v2-only rules (the drop
 * rule, conditions, stacks) apply to v2 documents.
 */
import {
  flattenLayers,
  FORMAT_VERSION,
  isDocumentV2,
  MAX_PHOTO_SOURCE_POSITION,
  MOTION_IN_PRESETS,
  PAGE_KEYS,
  PHOTO_SOURCE_PLAYER_PICKS,
  type PhotoLayerSource,
  type PhotoSourcePlayerPick,
  type LayerMotion,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplatePage,
} from "./format";
import { primaryPage, templateKindFor } from "./pages";
import { isPageBackground } from "./svg";

/** A document read as v2, and the format it was stored in. */
export type NormalisedDocument = TemplateDocumentV2 & { sourceFormat: 1 | 2 };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const IN_PRESETS = new Set<string>(MOTION_IN_PRESETS);

/** A v1 `animation` as `motion.in`; null for "none" or anything unknown. */
function motionInFromAnimation(animation: unknown): LayerMotion["in"] | null {
  if (!isObject(animation) || typeof animation.kind !== "string") return null;
  if (!IN_PRESETS.has(animation.kind)) return null;
  const motionIn: NonNullable<LayerMotion["in"]> = {
    preset: animation.kind as NonNullable<LayerMotion["in"]>["preset"],
  };
  if (animation.delayMs !== undefined) motionIn.delayMs = animation.delayMs as number;
  return motionIn;
}

/**
 * One layer read as v2: `animation` becomes `motion.in` (an explicit
 * `motion.in` wins), and a group's children are read the same way. Returns
 * the stored object itself when there is nothing to read differently.
 */
export function normaliseLayer(layer: TemplateLayerV2): TemplateLayerV2 {
  if (!isObject(layer)) return layer;
  const hasAnimation = "animation" in layer;
  const children = (layer as { children?: unknown }).children;
  const nested = layer.kind === "group" && Array.isArray(children);
  if (!hasAnimation && !nested) return layer;
  const { animation, ...rest } = layer;
  const out = { ...rest } as TemplateLayerV2;
  if (hasAnimation && !out.motion?.in) {
    const motionIn = motionInFromAnimation(animation);
    if (motionIn) out.motion = { ...out.motion, in: motionIn };
  }
  if (nested && out.kind === "group") {
    out.children = (children as TemplateLayerV2[]).map(normaliseLayer);
  }
  return out;
}

const readLayers = (layers: unknown): TemplateLayerV2[] =>
  Array.isArray(layers) ? (layers as TemplateLayerV2[]).map(normaliseLayer) : [];

/** The team list row fields that print a player's initial with the surname. */
const NAME_WITH_INITIAL = new Set(["broadcastName", "listName"]);

/**
 * A Team List's player rows as they print today: with the initial (retest 6,
 * item I). Before #636 the template library's Team Lists printed the bare
 * `surname` cell; a club's own copy saved from one of those versions (edited,
 * so it never follows the library) kept printing "FOX" where every other card
 * and look prints "D. FOX". A player row that prints the surname with no cell
 * that carries the initial reads its surname cells as `broadcastName`
 * ("D. FOX"); the row's own role cell, if it has one, stays as it is. A row
 * already printing a name with the initial is left alone, and so is every
 * other repeat. Returns the layer itself when nothing changes.
 */
export function teamListNamesWithInitials(layer: TemplateLayerV2): TemplateLayerV2 {
  if (!isObject(layer)) return layer;
  if (layer.kind === "group" && Array.isArray(layer.children)) {
    const children = layer.children.map(teamListNamesWithInitials);
    return children.some((c, i) => c !== layer.children[i]) ? { ...layer, children } : layer;
  }
  if (layer.kind !== "rows" || !isObject(layer.rows)) return layer;
  const rows = layer.rows as { repeat?: unknown; cells?: unknown; variants?: unknown };
  if (rows.repeat !== "players" || !Array.isArray(rows.cells)) return layer;
  const cells = rows.cells as Array<{ field?: unknown; fallbackFor?: unknown }>;
  if (cells.some((c) => NAME_WITH_INITIAL.has(String(c?.field)))) return layer;
  if (!cells.some((c) => c?.field === "surname")) return layer;
  const rename = (f: unknown) => (f === "surname" ? "broadcastName" : f);
  const variants = isObject(rows.variants)
    ? Object.fromEntries(
        Object.entries(rows.variants).map(([name, styles]) => [
          name,
          isObject(styles)
            ? Object.fromEntries(Object.entries(styles).map(([f, s]) => [rename(f), s]))
            : styles,
        ]),
      )
    : undefined;
  return {
    ...layer,
    rows: {
      ...rows,
      cells: cells.map((c) =>
        isObject(c)
          ? {
              ...c,
              field: rename(c.field),
              ...(c.fallbackFor !== undefined ? { fallbackFor: rename(c.fallbackFor) } : {}),
            }
          : c,
      ),
      ...(variants ? { variants } : {}),
    },
  } as TemplateLayerV2;
}

/** A kind's layers as read: a Team List's player rows print the initial. */
const readKindLayers = (layers: unknown, kind: string): TemplateLayerV2[] => {
  const read = readLayers(layers);
  return templateKindFor(kind) === "teamList" ? read.map(teamListNamesWithInitials) : read;
};

/**
 * Any stored document (or draft adjustments) for `kind`, read as v2. Anything
 * that isn't a v2 document is read as v1; a missing or malformed document is
 * an empty one.
 */
export function normaliseDocument(doc: unknown, kind: string): NormalisedDocument {
  const sponsorLock = isObject(doc) && doc.sponsorLock === true ? { sponsorLock: true } : {};
  if (isDocumentV2(doc)) {
    const pages: Partial<Record<PageKey, TemplatePage>> = {};
    for (const key of PAGE_KEYS) {
      const page = (doc.pages as Record<string, unknown>)[key];
      if (isObject(page))
        pages[key] = {
          layers: readKindLayers(page.layers, kind),
          ...(isPageBackground(page.background) ? { background: page.background } : {}),
        };
    }
    return {
      formatVersion: FORMAT_VERSION,
      pages,
      ...(isObject(doc.timeline) ? { timeline: { ...doc.timeline } } : {}),
      ...(Array.isArray(doc.palettes) ? { palettes: [...doc.palettes] } : {}),
      ...sponsorLock,
      sourceFormat: 2,
    };
  }
  const layers = isObject(doc) ? readKindLayers(doc.layers, kind) : [];
  return {
    formatVersion: FORMAT_VERSION,
    pages: { [primaryPage(kind)]: { layers } },
    ...sponsorLock,
    sourceFormat: 1,
  };
}

/** A page's layers (empty when the document hasn't that page). */
export function documentPageLayers(doc: TemplateDocumentV2, page: PageKey): TemplateLayerV2[] {
  return doc.pages[page]?.layers ?? [];
}

/** The pages a document has, in standard order. */
export function documentPages(doc: TemplateDocumentV2): PageKey[] {
  return PAGE_KEYS.filter((key) => doc.pages[key] !== undefined);
}

const PLAYER_PICKS = new Set<string>(PHOTO_SOURCE_PLAYER_PICKS);

/**
 * A photo layer's source (photo layer sources), read leniently: a source the
 * validator would reject reads as none, so the layer shows the card's photo.
 */
export function readPhotoSource(layer: unknown): PhotoLayerSource | null {
  if (!isObject(layer) || layer.kind !== "photo" || !isObject(layer.source)) return null;
  const s = layer.source;
  if (s.kind === "collection") {
    const id = s.collectionId;
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0
      ? { kind: "collection", collectionId: id }
      : null;
  }
  if (s.kind !== "player" || typeof s.pick !== "string" || !PLAYER_PICKS.has(s.pick)) return null;
  if (s.pick !== "position") return { kind: "player", pick: s.pick as PhotoSourcePlayerPick };
  const n = s.position;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_PHOTO_SOURCE_POSITION
    ? { kind: "player", pick: "position", position: n }
    : null;
}

/** A photo layer that has a source, with the key its resolved photo is stored under. */
export type SourcedPhotoLayer = { key: string; source: PhotoLayerSource };

/**
 * The photo layers of a stored document (any page, groups included) that have
 * a source, once per key. A layer's key is its id; the per-size copies of one
 * element (`link`) share their link, so they show the same photo.
 */
export function sourcedPhotoLayers(doc: unknown, kind: string): SourcedPhotoLayer[] {
  const normalised = normaliseDocument(doc, kind);
  const out: SourcedPhotoLayer[] = [];
  const seen = new Set<string>();
  for (const key of PAGE_KEYS) {
    for (const layer of flattenLayers(normalised.pages[key]?.layers ?? [])) {
      const source = readPhotoSource(layer);
      if (!source) continue;
      const k = photoLayerKey(layer);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ key: k, source });
    }
  }
  return out;
}

/** The key a photo layer's resolved photo is stored under: its link, else its id. */
export function photoLayerKey(layer: { id: string; link?: string }): string {
  return layer.link ? `link:${layer.link}` : layer.id;
}
