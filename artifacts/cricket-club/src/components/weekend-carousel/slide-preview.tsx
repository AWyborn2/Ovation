import { PackCard } from "@/components/pack-card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { SIZES, DEFAULT_PHOTO_TRANSFORM, type CardSize, type PhotoTransform } from "@/lib/share-card";
import type { WeekendSlide } from "./model";
import { slideAdjustments, WEEKEND_PACK_ID } from "./use-weekend-carousel";

/** Use the export renderer itself, rather than an approximate photo crop. */
export function SlidePreview({ slide, size, packId = WEEKEND_PACK_ID }: { slide: WeekendSlide; size: CardSize; packId?: string }) {
  return (
    <div className="min-w-0 space-y-2" data-testid={`slide-${slide.id}`}>
      <div className="mx-auto w-full overflow-hidden rounded-md border bg-muted"
        style={{ maxWidth: Math.min(480, 560 * SIZES[size].w / SIZES[size].h) }}>
        <PackCard input={slide.input} size={size} sponsorsOn={slide.sponsorsOn}
          junior={slide.junior} data={slide.data} packId={packId}
          adjustments={slideAdjustments(slide, size)} />
      </div>
      <p className="text-center text-xs text-muted-foreground">{slide.label}</p>
      {slide.warnings.map(w => (
        <p key={w} className="flex gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {w}
        </p>
      ))}
    </div>
  );
}

export function PhotoPlacement({ value, onChange, disabled, label }: {
  value: PhotoTransform;
  onChange: (value: PhotoTransform) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-4 rounded-md border bg-muted/30 p-4"
      aria-label={`${label} photo placement`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Photo placement</span>
        <Button type="button" size="sm" variant="ghost" disabled={disabled}
          onClick={() => onChange({ ...DEFAULT_PHOTO_TRANSFORM })}>
          <RotateCcw className="mr-1 h-3 w-3" aria-hidden /> Reset
        </Button>
      </div>
      {([
        ["focalX", "Horizontal", 0, 1, .01],
        ["focalY", "Vertical", 0, 1, .01],
        ["zoom", "Zoom", 1, 3, .01],
      ] as const).map(([key, title, min, max, step]) => (
        <label key={key} className="block space-y-1 text-xs">
          <span className="flex justify-between">
            <span>{title}</span>
            <span className="font-mono text-muted-foreground">
              {key === "zoom" ? `${value[key].toFixed(2)}×` : `${Math.round(value[key] * 100)}%`}
            </span>
          </span>
          <input type="range" min={min} max={max} step={step} value={value[key]}
            aria-label={`${label} ${title.toLowerCase()}`}
            onChange={e => onChange({ ...value, [key]: Number(e.target.value) })}
            className="h-6 w-full cursor-pointer accent-[hsl(var(--primary))] disabled:cursor-not-allowed" />
        </label>
      ))}
      <p className="text-xs text-muted-foreground">
        Adjust the photo while watching the slide preview. Zoom in for more room to reposition.
      </p>
    </fieldset>
  );
}
