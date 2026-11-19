/**
 * A draft's saved design size (portrait and story sizes plan, Stage 2): the
 * size the admin designs the card at, saved on the draft (`designSize`) so it
 * reopens there (round 7: a Story design reopened at Square). It never changes
 * what renders.
 */
import type { SocialDraft } from "@workspace/api-client-react";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { SIZES, type CardSize } from "@/lib/share-card";

const asSize = (value: unknown): CardSize | null =>
  typeof value === "string" && value in SIZES ? (value as CardSize) : null;

/**
 * The size the editor opens a draft at: the URL's `?format=` when it names a
 * size, else the draft's saved size, else a queued carousel's own size, else
 * Square (today's default, so a draft from before sizes were saved opens as
 * it always has).
 */
export function editorOpeningSize(
  search: string,
  draft: Pick<SocialDraft, "designSize" | "cardInput">,
): CardSize {
  return (
    asSize(new URLSearchParams(search).get("format")) ??
    asSize(draft.designSize) ??
    readQueuedCarousel(draft.cardInput ?? {})?.size ??
    "square"
  );
}

/** The editor link for a draft, at its saved size when it has one. */
export function draftEditorHref(draft: Pick<SocialDraft, "id" | "designSize">): string {
  const size = asSize(draft.designSize);
  return `/admin/social/editor/${draft.id}${size ? `?format=${size}` : ""}`;
}
