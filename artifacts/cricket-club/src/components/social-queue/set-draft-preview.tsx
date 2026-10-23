/**
 * A carousel set draft drawn with its set design (carousel set editor plan,
 * part 3): every slide in posting order, each on its own page, as it posts.
 */
import { useState } from "react";
import type { SetDocument } from "@workspace/scorecard/kind-templates";
import { PackCard } from "@/components/pack-card";
import { Button } from "@/components/ui/button";
import { BLANK_PACK_ID } from "@/lib/pack-render";
import { useKindTemplateData } from "@/lib/kind-templates/use-template-data";
import { setDraftSlides, slideDocument, type SetDraftSource } from "@/lib/set-draft";
import { SIZES, type CardSize } from "@/lib/share-card";

export function SetDraftPreview({
  draft,
  document,
  size,
}: {
  draft: SetDraftSource;
  document: SetDocument;
  size: CardSize;
}) {
  const { data } = useKindTemplateData("matchDay", { photoUrl: null });
  const slides = setDraftSlides(draft, document, data);
  const [index, setIndex] = useState(0);
  const current = Math.min(index, slides.length - 1);
  const slide = slides[current];
  if (!slide) return null;
  return (
    <section className="space-y-3" aria-label="Carousel review preview">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Slide {current + 1} of {slides.length}
        </h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setIndex(current - 1)}
          >
            Previous slide
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={current === slides.length - 1}
            onClick={() => setIndex(current + 1)}
          >
            Next slide
          </Button>
        </div>
      </div>
      <div className="min-w-0 space-y-2" data-testid={`slide-${slide.key}`}>
        <div
          className="mx-auto w-full overflow-hidden rounded-md border bg-muted"
          style={{ maxWidth: Math.min(480, (560 * SIZES[size].w) / SIZES[size].h) }}
        >
          <PackCard
            input={slide.input}
            size={size}
            sponsorsOn={slide.sponsorsOn}
            junior={slide.junior}
            data={slide.data}
            packId={BLANK_PACK_ID}
            adjustments={slideDocument(document, slide)}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">{slide.label}</p>
      </div>
    </section>
  );
}
