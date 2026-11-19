/**
 * The sizes offered for a design (portrait and story sizes plan, Stage 3).
 *
 * New designs come in Portrait (the feed) and Story only. Square and
 * Landscape are older sizes: offered only where a design already has layers
 * on them, labelled "(older size)", so an older card stays fully editable
 * while a new one can't be started, or grown, at a retired size. What a
 * stored design renders at never changes (`TEMPLATE_SIZE_ORDER` keeps all
 * four).
 */
import {
  isOlderSize,
  isSetDocument,
  OFFERED_SIZES,
  sizesToOffer,
  TEMPLATE_SIZE_ORDER,
  type LayerDocument,
} from "@workspace/scorecard/kind-templates";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";

export { isOlderSize, OFFERED_SIZES };

/** The size a new design starts at: Portrait, for the feed. */
export const DEFAULT_NEW_SIZE: CardSize = "portrait";

/** An older size's note in a size list. */
export const OLDER_SIZE_NOTE = "(older size)";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The layer documents a stored design holds: a set's pages, a page-based
 * (v2) document's pages, or a flat (v1) document as one page.
 */
export function documentPages(doc: unknown): LayerDocument[] {
  if (!isObject(doc)) return [];
  if (isSetDocument(doc)) return doc.pages as unknown as LayerDocument[];
  if (isObject(doc.pages)) return Object.values(doc.pages).filter(isObject) as LayerDocument[];
  return [doc as LayerDocument];
}

/**
 * A design's own sizes: Portrait and Story, plus an older size any of its
 * pages has layers on, in standard order. `current` (the size the editor is
 * open at) is kept too, so an older draft opened at Square still lists it.
 */
export function designOwnSizes(doc: unknown, current?: CardSize): CardSize[] {
  const own = new Set<CardSize>(sizesToOffer(documentPages(doc)));
  if (current) own.add(current);
  return TEMPLATE_SIZE_ORDER.filter((s) => own.has(s));
}

/** The older sizes (Square, Landscape) among `sizes`. */
export const olderSizesIn = (sizes: readonly CardSize[]): CardSize[] =>
  sizes.filter((s) => isOlderSize(s));

/** A club's size switches, as social settings hold them. */
export type SizeSwitches = {
  sizeSquare?: boolean;
  sizePortrait?: boolean;
  sizeStory?: boolean;
  sizeLandscape?: boolean;
};

const SWITCH: Record<CardSize, keyof SizeSwitches> = {
  square: "sizeSquare",
  portrait: "sizePortrait",
  story: "sizeStory",
  landscape: "sizeLandscape",
};

/**
 * The sizes an older screen (the share card modal, the Card Sets editor)
 * offers for an item: Portrait and Story where the club has them on (both
 * while its settings load), plus an older size the item itself has (`older`)
 * where the club has it on, or always when `keep` names it (a set's saved
 * size, so an older set still opens at it). Never empty: Portrait.
 */
export function clubSizesFor(
  settings: SizeSwitches | null | undefined,
  older: readonly CardSize[] = [],
  keep?: CardSize,
): CardSize[] {
  const on = (size: CardSize) => !settings || settings[SWITCH[size]] === true;
  const out = TEMPLATE_SIZE_ORDER.filter((size) =>
    isOlderSize(size) ? size === keep || (older.includes(size) && on(size)) : on(size),
  );
  return out.length ? out : [DEFAULT_NEW_SIZE];
}

/**
 * The older sizes a draft in the pack editor (before the template library)
 * offers. A pack design draws all four, so every older size stays. On the
 * blank base a layer is drawn where it has a box (the other sizes inherit
 * it), so an older size stays only where a layer has a box on it: a new
 * Portrait and Story canvas offers none.
 */
export function packDraftOlderSizes(doc: unknown, blankBase: boolean): CardSize[] {
  const older = TEMPLATE_SIZE_ORDER.filter((s) => isOlderSize(s));
  if (!blankBase) return older;
  const layers: unknown[] = isObject(doc) && Array.isArray(doc.layers) ? doc.layers : [];
  return older.filter((size) =>
    layers.some((l) => isObject(l) && isObject(l.geometry) && isObject(l.geometry[size])),
  );
}

/**
 * The older sizes a stored draft's design has: a templated or page-based
 * design's from its pages, a pack design's as the pack editor reads them.
 */
export function draftOlderSizes(draft: {
  packId?: string | null;
  templateVersion?: number | null;
  adjustments?: unknown;
}): CardSize[] {
  const doc = draft.adjustments;
  if (draft.templateVersion != null || (isObject(doc) && isObject(doc.pages)) || isSetDocument(doc))
    return olderSizesIn(designOwnSizes(doc));
  return packDraftOlderSizes(doc, draft.packId === BLANK_PACK_ID);
}
