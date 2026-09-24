import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, ImageIcon, Loader2, Upload } from "lucide-react";
import { ingestClubPhotos, useListClubPhotos } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  contentTypeFor,
  putWithProgress,
  requestUploadUrl,
} from "@/components/social-queue/library-upload";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  centredOffset,
  clampOffset,
  coverScale,
  cropRect,
  isLowResolution,
  outputSize,
  zoomAroundCentre,
  type Offset,
  type Size,
} from "@/lib/crop-math";
import { cn } from "@/lib/utils";

/** A crop shape: `ratio` is width ÷ height; `round` masks it as a circle (headshots). */
export type CropAspect = { id: string; label: string; ratio: number; round?: boolean };

export const HEADSHOT_ASPECTS: CropAspect[] = [
  { id: "round", label: "Headshot", ratio: 1, round: true },
];
export const SQUARE_ASPECTS: CropAspect[] = [{ id: "1:1", label: "1:1", ratio: 1 }];
export const SPONSOR_ASPECTS: CropAspect[] = [
  { id: "2:1", label: "2:1", ratio: 2 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "1:1", label: "1:1", ratio: 1 },
];
export const HERO_ASPECTS: CropAspect[] = [{ id: "16:9", label: "16:9", ratio: 16 / 9 }];
export const CARD_PHOTO_ASPECTS: CropAspect[] = [{ id: "4:3", label: "4:3", ratio: 4 / 3 }];

/** Longest frame edge on screen; the crop maths is resolution-independent. */
const FRAME_MAX = 320;
const PREVIEW = 64;

type Source = { src: string; size: Size; type: string; revoke?: () => void };

export type RenderCrop = (args: {
  src: string;
  rect: { x: number; y: number; width: number; height: number };
  out: Size;
  type: string;
}) => Promise<Blob>;

function isHeic(file: File): boolean {
  const t = contentTypeFor(file);
  return t === "image/heic" || t === "image/heif";
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image couldn't be opened."));
    img.src = src;
  });
}

async function defaultLoadImage(src: string): Promise<Size> {
  const img = await loadHtmlImage(src);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * HEIC goes through the U6 ingest (decoded server-side, EXIF stripped), which
 * files it in the photo library; the converted JPEG is then cropped here.
 */
async function defaultConvertHeic(file: File): Promise<{ src: string; size: Size }> {
  const { uploadURL, objectPath } = await requestUploadUrl(file);
  await putWithProgress(uploadURL, file, () => {});
  const res = await ingestClubPhotos({ objectPaths: [objectPath] });
  const result = res.results[0];
  if (!result?.ok || !result.photo)
    throw new Error(result?.error ?? "Couldn't convert that photo.");
  return {
    src: result.photo.url,
    size: { width: result.photo.width, height: result.photo.height },
  };
}

const defaultRenderCrop: RenderCrop = async ({ src, rect, out, type }) => {
  const img = await loadHtmlImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't crop images.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.9));
  if (!blob) throw new Error("Couldn't save the cropped image.");
  return blob;
};

/**
 * The shared upload-and-crop dialog (Social Studio U23, KTD7): drop or pick a
 * file (or a library photo), then pan and zoom (1–4×) inside a frame that is
 * always covered, with a round mask for headshots and ratio choices for
 * sponsor logos. Shows the suggested size, warns when the crop is smaller, and
 * previews the result live. `onCropped` receives the cropped file to upload.
 */
export function ImageCropDialog({
  open,
  onOpenChange,
  title,
  description,
  aspects,
  suggestedWidth,
  onCropped,
  allowLibrary = false,
  passThrough,
  loadImage = defaultLoadImage,
  convertHeic = defaultConvertHeic,
  renderCrop = defaultRenderCrop,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  aspects: CropAspect[];
  /** Suggested output width in pixels; height follows the aspect. */
  suggestedWidth: number;
  onCropped: (file: File) => void | Promise<void>;
  /** Offer the club photo library as a source. */
  allowLibrary?: boolean;
  /** Files to hand over uncropped (e.g. SVG logos, which cropping would rasterise). */
  passThrough?: (file: File) => boolean;
  /** Test seams. */
  loadImage?: (src: string) => Promise<Size>;
  convertHeic?: (file: File) => Promise<{ src: string; size: Size }>;
  renderCrop?: RenderCrop;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState<null | "opening" | "converting" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<CropAspect>(aspects[0]);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [browsing, setBrowsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; start: Offset } | null>(null);

  const frame: Size =
    aspect.ratio >= 1
      ? { width: FRAME_MAX, height: FRAME_MAX / aspect.ratio }
      : { width: FRAME_MAX * aspect.ratio, height: FRAME_MAX };
  const suggested: Size = {
    width: suggestedWidth,
    height: Math.round(suggestedWidth / aspect.ratio),
  };

  const reset = useCallback(() => {
    setSource((s) => {
      s?.revoke?.();
      return null;
    });
    setBusy(null);
    setError(null);
    setBrowsing(false);
    setZoom(1);
    setAspect(aspects[0]);
  }, [aspects]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // Re-centre whenever the image or the frame shape changes.
  useEffect(() => {
    if (!source) return;
    setZoom(1);
    setOffset(centredOffset(source.size, frame, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, aspect.id]);

  const openFile = async (file: File) => {
    setError(null);
    setBrowsing(false);
    try {
      if (passThrough?.(file)) {
        setBusy("saving");
        await onCropped(file);
        onOpenChange(false);
      } else if (isHeic(file)) {
        setBusy("converting");
        const converted = await convertHeic(file);
        setSource({ ...converted, type: "image/jpeg" });
      } else {
        setBusy("opening");
        const url = URL.createObjectURL(file);
        const size = await loadImage(url);
        setSource({
          src: url,
          size,
          type:
            file.type === "image/png" || file.type === "image/webp" ? "image/png" : "image/jpeg",
          revoke: () => URL.revokeObjectURL(url),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That image couldn't be opened.");
    } finally {
      setBusy(null);
    }
  };

  const pan = (next: Offset) => source && setOffset(clampOffset(next, source.size, frame, zoom));

  const changeZoom = (next: number) => {
    if (!source) return;
    setOffset(zoomAroundCentre(offset, source.size, frame, zoom, next));
    setZoom(next);
  };

  const onFrameKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 20 : 5;
    const moves: Record<string, Offset> = {
      ArrowLeft: { x: offset.x + step, y: offset.y },
      ArrowRight: { x: offset.x - step, y: offset.y },
      ArrowUp: { x: offset.x, y: offset.y + step },
      ArrowDown: { x: offset.x, y: offset.y - step },
    };
    const next = moves[e.key];
    if (next) {
      e.preventDefault();
      pan(next);
    }
  };

  const crop = source ? cropRect(offset, source.size, frame, zoom) : null;
  const lowRes = crop ? isLowResolution(crop, suggested) : false;

  const confirm = async () => {
    if (!source || !crop) return;
    setBusy("saving");
    setError(null);
    try {
      const blob = await renderCrop({
        src: source.src,
        rect: crop,
        out: outputSize(crop, suggested),
        type: source.type,
      });
      const ext = source.type === "image/png" ? "png" : "jpg";
      await onCropped(new File([blob], `cropped.${ext}`, { type: source.type }));
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the cropped image.");
    } finally {
      setBusy(null);
    }
  };

  const scale = source ? coverScale(source.size, frame) * zoom : 1;
  const imageStyle = (factor: number) =>
    source
      ? {
          left: offset.x * factor,
          top: offset.y * factor,
          width: source.size.width * scale * factor,
          height: source.size.height * scale * factor,
        }
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Drop an image, then drag and zoom to frame it."}
          </DialogDescription>
        </DialogHeader>

        {!source ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void openFile(file);
              }}
              disabled={busy != null}
              className={cn(
                "flex h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
              )}
            >
              {busy ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
                  {busy === "converting" ? "Converting your photo…" : "Opening…"}
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
                  <span className="font-semibold">Drop an image or click to choose</span>
                  <span className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP or iPhone HEIC · at least {suggested.width} × {suggested.height}{" "}
                    px
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              aria-label="Choose an image"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void openFile(file);
              }}
            />
            {allowLibrary && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setBrowsing((v) => !v)}
                >
                  <ImageIcon className="mr-1.5 h-4 w-4" aria-hidden />
                  {browsing ? "Hide photo library" : "Choose from photo library"}
                </Button>
                {browsing && (
                  <LibraryPicker
                    onPick={(p) =>
                      setSource({
                        src: p.url,
                        size: { width: p.width, height: p.height },
                        type: "image/jpeg",
                      })
                    }
                  />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {aspects.length > 1 && (
              <div className="flex gap-2" role="radiogroup" aria-label="Shape">
                {aspects.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={a.id === aspect.id}
                    onClick={() => setAspect(a)}
                    className={cn(
                      "h-8 rounded-full border px-3 text-sm font-semibold",
                      a.id === aspect.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-center rounded-xl bg-muted p-4">
              <div
                role="application"
                aria-label="Crop area. Drag or use the arrow keys to move the image."
                tabIndex={0}
                data-testid="crop-frame"
                onKeyDown={onFrameKey}
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, start: offset };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (d) pan({ x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y });
                }}
                onPointerUp={() => (drag.current = null)}
                className={cn(
                  "relative cursor-grab touch-none overflow-hidden outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
                  aspect.round ? "rounded-full" : "rounded-md",
                )}
                style={{ width: frame.width, height: frame.height }}
              >
                <img
                  src={source.src}
                  alt=""
                  draggable={false}
                  data-testid="crop-image"
                  className="absolute max-w-none select-none"
                  style={imageStyle(1)}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <span className="w-12 text-muted-foreground">Zoom</span>
              <input
                type="range"
                aria-label="Zoom"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => changeZoom(Number(e.target.value))}
                className="flex-1 accent-[hsl(var(--primary))]"
              />
              <span className="w-10 text-right tabular-nums">{zoom.toFixed(1)}×</span>
            </label>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-end gap-3" aria-label="Preview">
                {[1, 0.6].map((f) => (
                  <div
                    key={f}
                    className={cn(
                      "relative overflow-hidden border border-border bg-muted",
                      aspect.round ? "rounded-full" : "rounded",
                    )}
                    style={{
                      width: (PREVIEW * f * frame.width) / Math.max(frame.width, frame.height),
                      height: (PREVIEW * f * frame.height) / Math.max(frame.width, frame.height),
                    }}
                  >
                    <img
                      src={source.src}
                      alt=""
                      className="absolute max-w-none"
                      style={imageStyle((PREVIEW * f) / Math.max(frame.width, frame.height))}
                    />
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-xs">
                <p className="font-semibold">
                  Suggested: {suggested.width} × {suggested.height} px or larger
                </p>
                {crop && (
                  <p className="text-muted-foreground">
                    This crop: {Math.round(crop.width)} × {Math.round(crop.height)} px
                  </p>
                )}
              </div>
            </div>

            {lowRes && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg bg-accent/20 px-3 py-2 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Low resolution: this crop is smaller than {suggested.width} × {suggested.height} px
                and may look soft. Zoom out or use a larger image.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          {source && (
            <Button type="button" variant="ghost" className="mr-auto" onClick={reset}>
              Choose another
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!source || busy != null} onClick={confirm}>
            {busy === "saving" ? "Saving…" : "Use image"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LibraryPicker({
  onPick,
}: {
  onPick: (p: { url: string; width: number; height: number }) => void;
}) {
  const photosQ = useListClubPhotos();
  const photos = photosQ.data ?? [];
  if (photosQ.isLoading)
    return <p className="text-sm text-muted-foreground">Loading your photo library…</p>;
  if (photos.length === 0)
    return <p className="text-sm text-muted-foreground">Your photo library is empty.</p>;
  return (
    <div className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto">
      {photos.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p)}
          className="aspect-square overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-primary"
          aria-label={`Library photo ${p.id}`}
        >
          <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}
