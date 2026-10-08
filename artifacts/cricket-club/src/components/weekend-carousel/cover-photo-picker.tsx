import { useState } from "react";
import { ImageOff } from "lucide-react";
import { PhotoPlacement, SlidePreview } from "./slide-preview";
import { COVER_PHOTO_UNAVAILABLE } from "./model";
import type { WeekendCarouselState } from "./use-weekend-carousel";

export function CoverPhotoPicker({ s }: { s: WeekendCarouselState }) {
  const chosen = s.coverPhotos.find(p => p.id === s.cover.photoId);
  const slide = s.slides.find(sl => sl.id === "title");
  const [failed, setFailed] = useState<Set<string>>(new Set());
  return (
    <section className="space-y-3 rounded-md border p-3" aria-labelledby="cover-photo-heading">
      <div>
        <h3 id="cover-photo-heading" className="text-base">Cover photo</h3>
        <p className="text-xs text-muted-foreground">
          Club-wide · Season 2026 · all photo categories. This photo is only used on the title page.
        </p>
      </div>
      {s.coverUnavailable && <p role="alert" className="text-sm text-destructive">{COVER_PHOTO_UNAVAILABLE}</p>}
      <div className="grid items-start gap-5 md:grid-cols-2">
        {slide && <SlidePreview slide={slide} size={s.size} packId={s.packId} />}
        <div className="min-w-0 space-y-4">
        <div className="max-h-64 overflow-y-auto p-1">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Cover photo choices">
            <button type="button" aria-pressed={s.cover.photoId === null}
              disabled={s.exporting} onClick={() => s.patchCover({ photoId: null })}
              className={`flex h-20 w-20 flex-col items-center justify-center rounded border text-xs focus-visible:ring-2 focus-visible:ring-ring ${s.cover.photoId === null ? "ring-2 ring-primary" : ""}`}
              data-testid="button-no-cover-photo">
              <ImageOff className="mb-1 h-4 w-4" aria-hidden /> No photo
            </button>
            {s.coverPhotos.map(p => {
              const src = p.thumbUrl || p.url;
              return (
                <button key={p.id} type="button" aria-pressed={p.id === s.cover.photoId}
                  aria-label={`Cover photo ${p.id}`} disabled={s.exporting}
                  onClick={() => s.patchCover({ photoId: p.id, transform: { focalX: 0.5, focalY: 0.5, zoom: 1 } })}
                  className={`h-20 w-20 overflow-hidden rounded border focus-visible:ring-2 focus-visible:ring-ring ${p.id === s.cover.photoId ? "ring-2 ring-primary" : ""}`}
                  data-testid={`button-cover-photo-${p.id}`}>
                  {failed.has(src) ? <span className="p-1 text-xs">Preview unavailable</span> :
                    <img src={src} alt="" loading="lazy" className="h-full w-full object-cover"
                      onError={() => setFailed(prev => new Set(prev).add(src))} />}
                </button>
              );
            })}
          </div>
          {s.coverPhotos.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground" data-testid="text-no-cover-photos">
              No eligible cover photos. In Photo library, put a photo in Club-wide and tag it Season 2026.
              You can still queue the branded no-photo cover.
            </p>
          )}
          {failed.size > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="status">
            A thumbnail could not load. Check the selected photo in the slide preview before sending to review.
          </p>}
        </div>
        {chosen && <PhotoPlacement label="Cover" disabled={s.exporting}
          value={s.cover.transform} onChange={transform => s.patchCover({ transform })} />}
        </div>
      </div>
    </section>
  );
}
