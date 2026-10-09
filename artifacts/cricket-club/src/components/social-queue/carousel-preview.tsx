import { useState } from "react";
import type { QueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { carouselPackId } from "@workspace/scorecard/queued-carousel";
import { SlidePreview } from "@/components/weekend-carousel/slide-preview";
import type { WeekendSlide } from "@/components/weekend-carousel/model";
import { Button } from "@/components/ui/button";

export function CarouselPreview({ carousel }: { carousel: QueuedCarousel }) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, carousel.slides.length - 1);
  return (
    <section className="space-y-3" aria-label="Carousel review preview">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Slide {current + 1} of {carousel.slides.length}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setIndex(current - 1)}>Previous slide</Button>
          <Button variant="outline" size="sm" disabled={current === carousel.slides.length - 1} onClick={() => setIndex(current + 1)}>Next slide</Button>
        </div>
      </div>
       <SlidePreview slide={carousel.slides[current] as unknown as WeekendSlide} size={carousel.size} packId={carouselPackId(carousel)} />
      <p className="text-xs text-muted-foreground">Saved photos, positioning, sponsor choices and slide order. The caption below applies to the whole carousel.</p>
    </section>
  );
}
