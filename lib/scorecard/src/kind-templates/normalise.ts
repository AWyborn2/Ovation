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
  FORMAT_VERSION,
  isDocumentV2,
  MOTION_IN_PRESETS,
  PAGE_KEYS,
  type LayerMotion,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplatePage,
} from "./format";
import { primaryPage } from "./pages";

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
      if (isObject(page)) pages[key] = { layers: readLayers(page.layers) };
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
  const layers = isObject(doc) ? readLayers(doc.layers) : [];
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
