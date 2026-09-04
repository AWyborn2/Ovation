import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trash2, GripVertical, Copy } from "lucide-react";
import { PackCard } from "@/components/pack-card";
import { SIZES } from "@/lib/share-card";
import { MAX_SLIDES, slideLabel } from "./model";
import type { SetEditorState } from "./use-set-editor";

/** Drag-to-reorder strip of slide thumbnails (pack slides preview live). */
export function Filmstrip({ ed }: { ed: SetEditorState }) {
  const {
    slides,
    platformSize,
    selectedSlideId,
    setSelectedSlideId,
    dragFrom,
    reorder,
    duplicateSlide,
    removeSlide,
    slideUsesPack,
    slidePackId,
    sponsorsOn,
    slideTheme,
    slideIsJunior,
    buildSlidePackData,
    previews,
  } = ed;
  return (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">
        Slides ({slides.length}/{MAX_SLIDES})
      </CardTitle>
    </CardHeader>
    <CardContent>
      {slides.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No slides yet — add one from the sources below.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              draggable
              onDragStart={() => (dragFrom.current = idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom.current != null) reorder(dragFrom.current, idx);
                dragFrom.current = null;
              }}
              onClick={() => setSelectedSlideId(slide.id)}
              className={`relative shrink-0 w-32 cursor-pointer rounded-md border-2 p-1 transition-colors ${
                selectedSlideId === slide.id
                  ? "border-primary"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <div className="absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] font-bold text-white">
                {idx + 1}
              </div>
              <div className="absolute right-1 top-1 z-10 flex gap-1">
                <button
                  type="button"
                  title="Duplicate slide"
                  disabled={slides.length >= MAX_SLIDES}
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateSlide(slide.id);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Remove slide"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSlide(slide.id);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div
                className="flex items-center justify-center overflow-hidden rounded bg-muted"
                style={{
                  aspectRatio: `${SIZES[platformSize].w} / ${SIZES[platformSize].h}`,
                }}
              >
                {slideUsesPack(slide) ? (
                  // Pack slides preview live (matching the single-card modal)
                  // so they carry the tenant logo + sponsors.
                  <PackCard
                    packId={slidePackId(slide)}
                    input={slide.input}
                    size={platformSize}
                    sponsorsOn={sponsorsOn}
                    theme={slideTheme(slide) ?? null}
                    junior={slideIsJunior(slide)}
                    data={buildSlidePackData(slide)}
                  />
                ) : previews[slide.id] ? (
                  <img
                    src={previews[slide.id]}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <GripVertical className="h-3 w-3 shrink-0" />
                <span className="truncate">{slideLabel(slide.input)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
  );
}
