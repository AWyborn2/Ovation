import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import {
  listPackManifests,
  DEFAULT_PACK_ID,
} from "@/lib/pack-templates/registry";
import type { CardSize, ShareCardInput } from "@/lib/share-card";

/**
 * Small shared vocabulary for the Social Studio surfaces.
 *
 * These were duplicated at the top of the studio page and would have been
 * duplicated again by every component split out of it; they live here so the
 * page, the design-packs section and the pack-selection hook all agree on what
 * "every card kind" and "a pack's name" mean.
 */

export type CardKind = ShareCardInput["kind"];

/** Gallery thumbnails render square — the cheapest format to rasterise. */
export const THUMB_SIZE: CardSize = "square";

export const kindLabel = (k: string): string =>
  CARD_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;

/**
 * Every card kind, in gallery order.
 *
 * Derived from `CARD_KIND_OPTIONS` rather than `share-card`'s `CARD_KINDS` on
 * purpose: the counts and bulk-apply coverage below must agree with the gallery
 * the admin is looking at, and that gallery iterates the picker's options.
 */
export const ALL_CARD_KINDS: CardKind[] = CARD_KIND_OPTIONS.map((o) => o.value);

/** A pack's catalogue name, falling back to its id for a withdrawn pack. */
export const packName = (packId: string): string =>
  listPackManifests().find((m) => m.packId === packId)?.name ?? packId;

export const DEFAULT_PACK_NAME = packName(DEFAULT_PACK_ID);
