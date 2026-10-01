import type { CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import { slideAdjustments, type CardAdjustments, type PackCardData } from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { SIZES } from "@/lib/share-card";
import {
  isJuniorSlide,
  slidesForSize,
  type CardSetOptions,
  type PlannedSlide,
} from "@/lib/card-sets/plan";
import { cn } from "@/lib/utils";

/** Slide label under a preview: "Cover · 1 of 3", "2 of 3". */
export function slideLabel(slide: PlannedSlide): string {
  if (slide.of <= 1) return "Single card";
  return slide.role === "cover" ? `Cover · 1 of ${slide.of}` : `${slide.page} of ${slide.of}`;
}

/**
 * A balanced card set (plan 2026-10-01-001) previewed as the post it exports:
 * every slide side by side, scrolling like a carousel, each labelled with its
 * position. A single-card input shows just that card.
 */
export function CardSetStrip({
  input,
  size,
  sponsorsOn,
  theme,
  junior,
  data,
  packId,
  options,
  adjustments,
  slideWidth = 220,
  selectedKey,
  onSelect,
  className,
}: {
  input: ShareCardInput;
  size: CardSize;
  sponsorsOn: boolean;
  theme?: ApiCardTheme | null;
  junior: boolean;
  data: PackCardData | null;
  packId: string | null;
  options?: CardSetOptions;
  /** The card's root adjustments; each slide previews with its own edits. */
  adjustments?: CardAdjustments | null;
  /** Width of each slide preview in px. */
  slideWidth?: number;
  /** Highlight a slide (editor); clicking a slide calls `onSelect`. */
  selectedKey?: string;
  onSelect?: (slide: PlannedSlide) => void;
  className?: string;
}) {
  const slides = slidesForSize(input, size, options);
  const ratio = SIZES[size].h / SIZES[size].w;
  return (
    <div
      role="list"
      aria-label={slides.length > 1 ? `${slides.length} slides` : "Card"}
      className={cn("flex gap-3 overflow-x-auto pb-2 snap-x", className)}
    >
      {slides.map((slide) => {
        const j = isJuniorSlide(slide, junior);
        const body = (
          <>
            <span
              className={cn(
                "block overflow-hidden rounded-md border bg-muted",
                selectedKey === slide.key && "ring-2 ring-primary",
              )}
              style={{ width: slideWidth, height: Math.round(slideWidth * ratio) }}
            >
              <PackCard
                input={slide.input}
                size={size}
                sponsorsOn={sponsorsOn}
                theme={theme}
                junior={j}
                data={data && j ? { ...data, photoUrl: null } : data}
                packId={packId}
                adjustments={slideAdjustments(adjustments, slide.key)}
                width={slideWidth}
              />
            </span>
            <span className="text-xs text-muted-foreground">{slideLabel(slide)}</span>
          </>
        );
        return (
          <div role="listitem" key={slide.key} className="flex flex-none snap-start flex-col gap-1">
            {onSelect ? (
              <button
                type="button"
                className="flex flex-col gap-1 text-left"
                aria-pressed={selectedKey === slide.key}
                aria-label={`Edit ${slideLabel(slide)}`}
                onClick={() => onSelect(slide)}
              >
                {body}
              </button>
            ) : (
              body
            )}
          </div>
        );
      })}
    </div>
  );
}
