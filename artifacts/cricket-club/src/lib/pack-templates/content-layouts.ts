/**
 * The layout contract (ADR-010): what each pack lays out for a content kind.
 * Templates consume card content and the visible field set only; this says
 * which content fields a pack has a box for, and how many fixtures fit on one
 * slide at each size and preset. The fit grid
 * (`content-layouts.test.ts`) renders every pack × preset × size × slide with
 * worst-case content and fails the build when a declared field has no box, a
 * hidden field still shows, or a name is cut off.
 *
 * Packs on the contract: Club Kit and Broadcast Dark. Any other pack id
 * (the four packs P9 retires) lays out as Club Kit.
 */

import {
  CONTENT_FIELDS,
  CONTENT_PRESETS,
  type ContentKind,
  type ContentPreset,
} from "@workspace/scorecard/card-content";
import type { CardSize } from "../share-card";

export interface ContentLayout {
  /** Content fields the pack has a box for. A visible field outside this list cannot show. */
  slots: readonly string[];
  /** Fixtures per slide, per size and preset. One until junior days share a slide (P3). */
  capacity: Record<CardSize, Record<ContentPreset, number>>;
}

export const CONTENT_LAYOUT_SIZES: readonly CardSize[] = [
  "square",
  "portrait",
  "story",
  "landscape",
];

const everySize = (perPreset: Record<ContentPreset, number>) =>
  Object.fromEntries(CONTENT_LAYOUT_SIZES.map((s) => [s, { ...perPreset }])) as Record<
    CardSize,
    Record<ContentPreset, number>
  >;

const ONE_FIXTURE = everySize(
  Object.fromEntries(CONTENT_PRESETS.map((p) => [p, 1])) as Record<ContentPreset, number>,
);

const ALL_MATCH_DAY_FIELDS = CONTENT_FIELDS.matchDay.map((f) => f.key);

export const CONTENT_PACK_IDS = ["club-kit-v1", "broadcast-dark-v1"] as const;
export type ContentPackId = (typeof CONTENT_PACK_IDS)[number];

export const CONTENT_LAYOUTS: Record<ContentPackId, Record<ContentKind, ContentLayout>> = {
  "club-kit-v1": {
    matchDay: { slots: ALL_MATCH_DAY_FIELDS, capacity: ONE_FIXTURE },
  },
  "broadcast-dark-v1": {
    matchDay: { slots: ALL_MATCH_DAY_FIELDS, capacity: ONE_FIXTURE },
  },
};

const isContentPack = (packId: string | null | undefined): packId is ContentPackId =>
  (CONTENT_PACK_IDS as readonly (string | null | undefined)[]).includes(packId);

/** A pack's layout for a content kind; a pack not on the contract lays out as Club Kit. */
export function contentLayout(packId: string | null | undefined, kind: ContentKind): ContentLayout {
  return CONTENT_LAYOUTS[isContentPack(packId) ? packId : "club-kit-v1"][kind];
}

/** How many fixtures one slide holds for a pack, size and preset. */
export function contentCapacity(
  packId: string | null | undefined,
  kind: ContentKind,
  size: CardSize,
  preset: ContentPreset,
): number {
  return contentLayout(packId, kind).capacity[size][preset];
}
