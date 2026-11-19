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
import { pagesCoverage } from "@workspace/scorecard/design-sizes";
import {
  getGetSocialSettingsQueryKey,
  useGetSocialSettings,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
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
 * while its settings load), plus the older sizes the item itself has
 * (`older`, or `keep`: a set's saved size). An item always keeps its own
 * older sizes, whatever the club's switches, so an older square card still
 * opens and downloads at Square after the club's Square goes off (D3). A
 * new card gets no older size. Never empty: Portrait.
 */
export function clubSizesFor(
  settings: SizeSwitches | null | undefined,
  older: readonly CardSize[] = [],
  keep?: CardSize,
  drawn?: readonly CardSize[],
): CardSize[] {
  const on = (size: CardSize) => !settings || settings[SWITCH[size]] === true;
  const out = TEMPLATE_SIZE_ORDER.filter(
    (size) =>
      (isOlderSize(size) ? size === keep || older.includes(size) : on(size) || size === keep) &&
      (!drawn || drawn.includes(size)),
  );
  if (out.length) return out;
  // Nothing the club has on is drawn: the design's own sizes, never an empty one.
  const own = drawn?.filter((s) => !isOlderSize(s) || older.includes(s) || s === keep) ?? [];
  return own.length ? own : drawn?.length ? [...drawn] : [DEFAULT_NEW_SIZE];
}

/**
 * The sizes Create offers a new design (round 9, D17): Portrait and Story
 * where the club has them on (both while its settings load), so Create and
 * the club's settings can't disagree. Never empty: Portrait.
 */
export function createSizesFor(settings: SizeSwitches | null | undefined): CardSize[] {
  // A switch not read yet counts as on (both default on), so only a saved "off" hides a size.
  const out = OFFERED_SIZES.filter((size) => !settings || settings[SWITCH[size]] !== false);
  return out.length ? [...out] : [DEFAULT_NEW_SIZE];
}

/** `createSizesFor` the club's own settings. */
export function useClubCreateSizes(): CardSize[] {
  const q = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  return createSizesFor((q.data as SocialSettingsBundle | undefined)?.settings);
}

/**
 * The sizes the Format menu offers for a draft's design (round 9 B13, B8):
 * only the sizes it draws (every page with layers has layers on it), and of
 * the older sizes (Square, Landscape) only those the draft was made in
 * (`madeIn`, the server's `olderSizes`). Library looks draw all four, so
 * having layers on an older size is not enough. A design with no layers yet
 * offers Portrait and Story. Never empty.
 */
export function draftFormatSizes(
  pages: readonly LayerDocument[],
  madeIn: readonly CardSize[],
): CardSize[] {
  const drawn = pagesCoverage(pages);
  if (drawn.length === 0) return [...OFFERED_SIZES];
  const out = drawn.filter((s) => !isOlderSize(s) || madeIn.includes(s));
  return out.length ? out : drawn;
}

/** The size to open at among `sizes`: `wanted` when offered, else Portrait, Story, then the rest. */
export function openingSizeAmong(sizes: readonly CardSize[], wanted?: CardSize): CardSize {
  if (wanted && sizes.includes(wanted)) return wanted;
  for (const size of [...OFFERED_SIZES, ...TEMPLATE_SIZE_ORDER]) {
    if (sizes.includes(size)) return size;
  }
  return DEFAULT_NEW_SIZE;
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
