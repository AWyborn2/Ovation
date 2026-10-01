import {
  landscapeSummary as landscapeShared,
  planCardSet as planShared,
  type CardSetOptions,
  type PlannedSlide as SharedSlide,
  type SetInput,
} from "@workspace/scorecard";
import type { ShareCardInput } from "../share-card";

/**
 * Balanced card sets (plan 2026-10-01-001), typed for the web app's card
 * inputs. The planner itself lives in `@workspace/scorecard` so the server's
 * post pack splits a set exactly as the Studio previews it.
 */

export {
  SET_CAPS,
  densityFor,
  isSetKind,
  type CardSetOptions,
  type SetKind,
} from "@workspace/scorecard";

export type PlannedSlide = SharedSlide<ShareCardInput & SetInput>;

/** The single landscape card for an input: a big round's cover, else the card itself. */
export function landscapeSummary(input: ShareCardInput, opts: CardSetOptions = {}): ShareCardInput {
  return landscapeShared(input as ShareCardInput & SetInput, opts);
}

/** Plan the slides one card input posts as (a single slide for every non-set kind). */
export function planCardSet(input: ShareCardInput, opts: CardSetOptions = {}): PlannedSlide[] {
  return planShared(input as ShareCardInput & SetInput, opts);
}

/**
 * The slides an input exports as at `size`: the balanced set at square,
 * portrait and story; one summary card at landscape (web / email).
 */
export function slidesForSize(
  input: ShareCardInput,
  size: string,
  opts: CardSetOptions = {},
): PlannedSlide[] {
  if (size === "landscape") {
    const summary = landscapeSummary(input, opts);
    return [
      { key: "single", role: "single", input: summary as PlannedSlide["input"], page: 1, of: 1 },
    ];
  }
  return planCardSet(input, opts);
}

/** A slide is a junior card (juniors palette, never a photo). */
export function isJuniorSlide(slide: PlannedSlide, cardJunior: boolean): boolean {
  return (
    cardJunior ||
    (slide.input as { junior?: boolean }).junior === true ||
    slide.input.kind === "juniorHighlights"
  );
}
