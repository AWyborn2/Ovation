import {
  isSetDocument,
  planTemplateSlides,
  type LayerDocument,
} from "@workspace/scorecard/kind-templates";
import { BLANK_PACK_ID, type CardAdjustments, type PackCardData } from "@/lib/pack-render";
import { setDraftSlides, slideDocument } from "@/lib/set-draft";
import { slidesForSize, type PlannedSlide } from "@/lib/card-sets/plan";
import type { CardSize, ShareCardInput } from "@/lib/share-card";

export type ModalSlide = PlannedSlide & { adjustments: CardAdjustments | null };

/**
 * The slides the Share modal previews and exports at `size`, each with the
 * editor adjustments it renders with. A templated draft (card-kind template)
 * renders on the blank pack with its template document on every slide, split
 * by the rows layer's capacity — exactly as the server's draft render does
 * (api-server lib/draft-render.ts). Without the document the blank pack draws
 * an empty stage, which is how the modal's tiles came out blank.
 */
export function modalSlides(
  input: ShareCardInput,
  size: CardSize,
  templateDoc: LayerDocument | null | undefined,
  data: PackCardData = {} as PackCardData,
): ModalSlide[] {
  // A set design (carousel set editor plan): each slide on its own page.
  if (isSetDocument(templateDoc)) {
    const slides = setDraftSlides({ cardInput: input }, templateDoc, data);
    return slides.map(
      (s, i) =>
        ({
          key: s.key,
          role: i === 0 ? "cover" : "detail",
          input: s.input,
          page: i + 1,
          of: slides.length,
          adjustments: slideDocument(templateDoc, s),
        }) as ModalSlide,
    );
  }
  if (templateDoc) {
    const adjustments = templateDoc as unknown as CardAdjustments;
    return planTemplateSlides(
      input as unknown as Record<string, unknown>,
      templateDoc,
      size,
    ).slides.map(
      (s) =>
        ({
          key: s.key,
          role: s.of > 1 ? "detail" : "single",
          input: s.input as unknown as ShareCardInput,
          page: s.page,
          of: s.of,
          adjustments,
        }) as ModalSlide,
    );
  }
  return slidesForSize(input, size).map((s) => ({ ...s, adjustments: null }));
}

/** The pack a templated draft renders on (the blank stage), else the resolved pack. */
export function modalPackId(packId: string | null, templateDoc: LayerDocument | null | undefined) {
  return templateDoc ? BLANK_PACK_ID : packId;
}
