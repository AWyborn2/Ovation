/**
 * A draft's saved design size (portrait and story sizes plan, Stage 2,
 * migration 0081): the size the admin designs the card at, so the editor
 * reopens there (round 7: Format wasn't saved). It never changes what renders.
 *
 * Square and Landscape are older sizes. A draft offers one, and may save one,
 * only when it was made in it (round 9 B8): its saved size or a revision's is
 * that size, a queued carousel is saved at it, or it is an older draft (no
 * saved size, made before sizes were saved), and its design still draws it.
 * A template having layers on Square or Landscape is not enough: every
 * library look has all four. No size the design doesn't draw is saved either
 * (round 9 B13), so a card never reopens at an empty size. The design's sizes
 * are Stage 1's `designSizes`, read from its document.
 */
import { and, inArray, isNotNull } from "drizzle-orm";
import { db, socialDraftRevisionsTable, type DraftDesignSize } from "@workspace/db";
import { DESIGN_SIZE_LABEL } from "@workspace/scorecard/design-sizes";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { designSizes, type DraftDesign } from "./draft-render";

/** The sizes no longer offered for new designs (D1); stored designs keep them. */
export const OLDER_DESIGN_SIZES: readonly DraftDesignSize[] = ["square", "landscape"];

/**
 * When drafts began saving their size: production's build with sizes plan
 * Stage 2 (#685) went live at about 08:07 UTC on 19 Nov 2026. A draft with no
 * saved size made before this is an older draft, designed at whatever size it
 * was opened at, so it keeps the older sizes its design draws (D5). Since
 * round 9 every path that makes a draft saves its size, so a draft made since
 * has one.
 */
export const SIZES_SAVED_FROM = new Date("2026-11-19T08:15:00Z");

/** What `madeInOlderSizes` reads from a draft. */
export type DraftForSizes = DraftDesign & {
  designSize: DraftDesignSize | null;
  createdAt: Date | string;
};

/**
 * The older sizes (Square, Landscape) a draft was made in and its design
 * still draws, in standard order (round 9 B8). `revisionSizes` are the saved
 * sizes its revisions recorded.
 */
export function madeInOlderSizes(
  draft: DraftForSizes,
  revisionSizes: readonly (DraftDesignSize | null)[] = [],
): DraftDesignSize[] {
  const made = new Set<DraftDesignSize>();
  if (draft.designSize) made.add(draft.designSize);
  for (const size of revisionSizes) if (size) made.add(size);
  const carousel = readQueuedCarousel(draft.cardInput ?? {});
  if (carousel) made.add(carousel.size);
  if (draft.designSize == null && new Date(draft.createdAt) < SIZES_SAVED_FROM) {
    for (const size of OLDER_DESIGN_SIZES) made.add(size);
  }
  const drawn = designSizes(draft);
  return OLDER_DESIGN_SIZES.filter((size) => made.has(size) && drawn.includes(size));
}

/**
 * The size a new draft is saved at (round 9): `wanted` (Create's size, or a
 * Story-made item's Story) when the design draws it, else a queued
 * carousel's own size when drawn, else Portrait, else Story, else the first
 * size the design draws. Never a size the design doesn't draw, so no path
 * makes a draft that relies on the `SIZES_SAVED_FROM` cutoff.
 */
export function initialDesignSize(
  design: DraftDesign,
  wanted?: DraftDesignSize | null,
): DraftDesignSize {
  const drawn = designSizes(design);
  const carousel = readQueuedCarousel(design.cardInput ?? {});
  for (const size of [wanted, carousel?.size, "portrait", "story"] as const) {
    if (size && drawn.includes(size)) return size;
  }
  return drawn[0] ?? "portrait";
}

/**
 * The size a draft keeps when its design is replaced (a template applied, a
 * set saved, a revision restored): an older draft (made before
 * `SIZES_SAVED_FROM`) asked for no size keeps none (D5, it opens at Square as
 * before); any other keeps `wanted` (its own size, a revision's or a
 * carousel's) when the new design draws it, else `initialDesignSize`.
 */
export function keptDesignSize(
  draft: { designSize: DraftDesignSize | null; createdAt: Date | string },
  design: DraftDesign,
  wanted: DraftDesignSize | null = draft.designSize,
): DraftDesignSize | null {
  if (wanted == null && new Date(draft.createdAt) < SIZES_SAVED_FROM) return null;
  return initialDesignSize(design, wanted);
}

/** The saved sizes each draft's revisions recorded, by draft id. */
export async function revisionSizesByDraft(
  draftIds: readonly number[],
): Promise<Map<number, DraftDesignSize[]>> {
  const out = new Map<number, DraftDesignSize[]>();
  if (draftIds.length === 0) return out;
  const rows = await db
    .selectDistinct({
      draftId: socialDraftRevisionsTable.draftId,
      designSize: socialDraftRevisionsTable.designSize,
    })
    .from(socialDraftRevisionsTable)
    .where(
      and(
        inArray(socialDraftRevisionsTable.draftId, [...draftIds]),
        isNotNull(socialDraftRevisionsTable.designSize),
      ),
    );
  for (const r of rows) {
    if (!r.designSize) continue;
    out.set(r.draftId, [...(out.get(r.draftId) ?? []), r.designSize as DraftDesignSize]);
  }
  return out;
}

/**
 * Why `size` can't be saved on a draft with `design` (null when it can).
 *
 *  - A size the design doesn't draw never can (round 9 B13): the card would
 *    reopen, and download, blank.
 *  - Portrait and Story can, when drawn.
 *  - An older size can when the draft already has it saved (`saved`), or was
 *    made in it (`madeIn`, from `madeInOlderSizes`). A new draft has none.
 */
export function designSizeRefusal(
  design: DraftDesign,
  size: DraftDesignSize,
  saved: DraftDesignSize | null = null,
  madeIn: readonly DraftDesignSize[] = [],
): string | null {
  const label = DESIGN_SIZE_LABEL[size];
  if (!designSizes(design).includes(size)) {
    return `This design has no ${label} size. Design it at a size it has.`;
  }
  if (!OLDER_DESIGN_SIZES.includes(size) || size === saved || madeIn.includes(size)) return null;
  return `${label} is an older size this design wasn't made in. Design it at Portrait or Story.`;
}
