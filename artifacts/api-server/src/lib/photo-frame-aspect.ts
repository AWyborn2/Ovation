import { photoFrameAspect, type TemplateSize } from "@workspace/scorecard/kind-templates";
import { loadKindTemplate } from "./kind-templates";
import { ensureSettings } from "./social-cards-helpers";

/** The size a club's cards post at first (its first switched-on size; square if none). */
async function primarySize(tenantId: number): Promise<TemplateSize> {
  const s = await ensureSettings(tenantId);
  if (s.sizeSquare) return "square";
  if (s.sizePortrait) return "portrait";
  if (s.sizeStory) return "story";
  if (s.sizeLandscape) return "landscape";
  return "square";
}

/**
 * The shape (width / height) of the photo frame a draft of `kind` posts with
 * (photo focus areas): the draft's own design when it has one, else the club's
 * template for the kind, at the club's first posting size. Null when neither
 * draws a photo, or the kind has no template; the picker then ignores shape.
 * Read-only: it never creates the club's template copy.
 */
export async function draftFrameAspect(
  tenantId: number,
  kind: string | null | undefined,
  design?: unknown,
): Promise<number | null> {
  if (!kind) return null;
  const doc = design ?? (await loadKindTemplate(tenantId, kind))?.adjustments;
  if (!doc) return null;
  return photoFrameAspect(doc, kind, await primarySize(tenantId));
}
