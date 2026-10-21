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
  /**
   * Fixtures one junior day slide holds (the multi-fixture layout, P3), per
   * size and preset. A senior fixture always has a slide of its own.
   */
  capacity: Record<CardSize, Record<ContentPreset, number>>;
}

export const CONTENT_LAYOUT_SIZES: readonly CardSize[] = [
  "square",
  "portrait",
  "story",
  "landscape",
];

/**
 * Rows a junior day slide holds per size (P3): a single column on square,
 * portrait and story, two columns on landscape. Hidden fields (round, crest)
 * do not change a row's height, so every preset holds the same.
 */
export const DAY_ROWS: Record<CardSize, number> = {
  square: 4,
  portrait: 5,
  story: 7,
  landscape: 6,
};

const DAY_CAPACITY = Object.fromEntries(
  CONTENT_LAYOUT_SIZES.map((size) => [
    size,
    Object.fromEntries(CONTENT_PRESETS.map((p) => [p, DAY_ROWS[size]])),
  ]),
) as Record<CardSize, Record<ContentPreset, number>>;

const ALL_MATCH_DAY_FIELDS = CONTENT_FIELDS.matchDay.map((f) => f.key);
const fieldsOf = (kind: ContentKind) => CONTENT_FIELDS[kind].map((f) => f.key);

/** A team list is one side per slide at every size and preset (no day slide). */
const ONE_PER_SLIDE = Object.fromEntries(
  CONTENT_LAYOUT_SIZES.map((size) => [
    size,
    Object.fromEntries(CONTENT_PRESETS.map((p) => [p, 1])),
  ]),
) as Record<CardSize, Record<ContentPreset, number>>;

/**
 * Results, match summaries (the multi-result day layout, P3) and team lists
 * (P7). Neither pack has an opposition crest on the match summary detail slide
 * or the team list, nor a debut badge on the team list (only the Starting XI
 * single card prints one): they never printed these, so those fields cannot
 * show there. The results slide and the day rows have a crest.
 */
const OTHER_KINDS = {
  results: { slots: fieldsOf("results"), capacity: DAY_CAPACITY },
  matchSummary: {
    slots: fieldsOf("matchSummary").filter((k) => k !== "result.oppositionCrest"),
    capacity: DAY_CAPACITY,
  },
  teamList: {
    slots: fieldsOf("teamList").filter((k) => k !== "team.oppositionCrest" && k !== "team.debuts"),
    capacity: ONE_PER_SLIDE,
  },
};

export const CONTENT_PACK_IDS = ["club-kit-v1", "broadcast-dark-v1"] as const;
export type ContentPackId = (typeof CONTENT_PACK_IDS)[number];

export const CONTENT_LAYOUTS: Record<ContentPackId, Record<ContentKind, ContentLayout>> = {
  "club-kit-v1": {
    matchDay: { slots: ALL_MATCH_DAY_FIELDS, capacity: DAY_CAPACITY },
    ...OTHER_KINDS,
  },
  "broadcast-dark-v1": {
    matchDay: { slots: ALL_MATCH_DAY_FIELDS, capacity: DAY_CAPACITY },
    ...OTHER_KINDS,
  },
};

const isContentPack = (packId: string | null | undefined): packId is ContentPackId =>
  (CONTENT_PACK_IDS as readonly (string | null | undefined)[]).includes(packId);

/** A pack's layout for a content kind; a pack not on the contract lays out as Club Kit. */
export function contentLayout(packId: string | null | undefined, kind: ContentKind): ContentLayout {
  return CONTENT_LAYOUTS[isContentPack(packId) ? packId : "club-kit-v1"][kind];
}

/** How many fixtures one junior day slide holds for a pack, size and preset. */
export function contentCapacity(
  packId: string | null | undefined,
  kind: ContentKind,
  size: CardSize,
  preset: ContentPreset,
): number {
  return contentLayout(packId, kind).capacity[size][preset];
}

/**
 * Matches one junior day slide holds for a carousel set type: fixtures (the
 * multi-fixture layout) or results (the multi-result layout); a team list has
 * a slide per side.
 */
export function dayCapacity(
  packId: string | null | undefined,
  setType: ContentKind,
  size: CardSize,
  preset: ContentPreset,
): number {
  return contentCapacity(packId, setType, size, preset);
}
