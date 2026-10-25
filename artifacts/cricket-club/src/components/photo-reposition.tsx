import { useEffect, useRef, useState } from "react";
import { Move, RotateCcw, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_PHOTO_TRANSFORM, type PhotoTransform } from "@/lib/share-card";
import {
  PHOTO_ZOOM_MAX as MAX_ZOOM,
  PHOTO_ZOOM_MIN as MIN_ZOOM,
} from "@/lib/pack-render/adjustments";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Source-window geometry for object-fit: cover at a given zoom — mirrors the
// canvas math in `drawImageCoverFocal` so the control and the rendered card
// crop identically. Below 1× the window is bigger than the photo.
const coverGeom = (
  natW: number,
  natH: number,
  frameW: number,
  aspect: { w: number; h: number },
  zoom: number,
) => {
  const rr = aspect.w / aspect.h;
  const ir = natW / natH;
  let sw0: number, sh0: number;
  if (ir > rr) {
    sh0 = natH;
    sw0 = natH * rr;
  } else {
    sw0 = natW;
    sh0 = natW / rr;
  }
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const sw = sw0 / z;
  const sh = sh0 / z;
  const dispScale = frameW / sw;
  return { sw, sh, dispScale };
};

/**
 * The window's start for a focal fraction: like CSS object-position, the
 * fraction of the travel (0 = left/top, 1 = right/bottom). Negative when
 * zoomed out, which places the smaller photo inside the frame.
 */
const windowStart = (focal: number, natLen: number, win: number) =>
  clamp(focal, 0, 1) * (natLen - win);

/** The focal fraction for a window start; `keep` when there's no travel on that axis. */
const focalFor = (start: number, natLen: number, win: number, keep: number) =>
  Math.abs(natLen - win) < 0.5 ? keep : clamp(start / (natLen - win), 0, 1);

type Props = {
  src: string;
  /** The shape of the box the card draws the photo in (drives the frame shape). */
  aspect: { w: number; h: number };
  value: PhotoTransform;
  onChange: (next: PhotoTransform) => void;
};

/**
 * Drag-to-reposition + zoom control for a feature share-card photo. The chosen
 * focal point (0-1) and zoom (0.5-3) are size-independent, so the same values
 * drive every card size and all downloads. Zoomed out, the photo sits inside
 * its box and can be dragged anywhere within it.
 */
export function PhotoReposition({ src, aspect, value, onChange }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  // Drag origin: pointer position + the source-window top-left at drag start.
  const drag = useRef<{ px: number; py: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Reset natural dims when the photo changes; load fresh.
  useEffect(() => {
    setNat(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);

  const frameH = frameW > 0 ? frameW * (aspect.h / aspect.w) : 0;

  let imgStyle: React.CSSProperties = { visibility: "hidden" };
  if (nat && frameW > 0) {
    const { sw, sh, dispScale } = coverGeom(nat.w, nat.h, frameW, aspect, value.zoom);
    const sx = windowStart(value.focalX, nat.w, sw);
    const sy = windowStart(value.focalY, nat.h, sh);
    imgStyle = {
      position: "absolute",
      left: 0,
      top: 0,
      width: nat.w * dispScale,
      height: nat.h * dispScale,
      maxWidth: "none",
      transform: `translate(${-sx * dispScale}px, ${-sy * dispScale}px)`,
      userSelect: "none",
      pointerEvents: "none",
    };
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!nat || frameW === 0) return;
    const { sw, sh } = coverGeom(nat.w, nat.h, frameW, aspect, value.zoom);
    const sx = windowStart(value.focalX, nat.w, sw);
    const sy = windowStart(value.focalY, nat.h, sh);
    drag.current = { px: e.clientX, py: e.clientY, sx, sy };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !nat || frameW === 0) return;
    const { sw, sh, dispScale } = coverGeom(nat.w, nat.h, frameW, aspect, value.zoom);
    // Dragging right reveals the left of the image → window moves left.
    const sx = drag.current.sx - (e.clientX - drag.current.px) / dispScale;
    const sy = drag.current.sy - (e.clientY - drag.current.py) / dispScale;
    onChange({
      ...value,
      focalX: focalFor(sx, nat.w, sw, value.focalX),
      focalY: focalFor(sy, nat.h, sh, value.focalY),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // The focal fraction is zoom-independent: zooming scales about it, so the
  // part of the photo under the focal point stays put.
  const handleZoom = (z: number) => onChange({ ...value, zoom: z });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <Move className="h-3 w-3" />
          Drag to reposition
        </Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-xs text-muted-foreground"
          onClick={() => onChange(DEFAULT_PHOTO_TRANSFORM)}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden rounded-md border bg-muted cursor-move touch-none select-none"
        style={{ aspectRatio: `${aspect.w} / ${aspect.h}`, maxHeight: 220 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
        <img src={src} alt="Reposition photo" style={imgStyle} draggable={false} />
        {/* Rule-of-thirds guides to help line up the subject. */}
        {frameH > 0 && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/20" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/20" />
            <div className="absolute top-1/3 left-0 w-full h-px bg-white/20" />
            <div className="absolute top-2/3 left-0 w-full h-px bg-white/20" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <ZoomIn className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Slider
          value={[value.zoom]}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          onValueChange={([z]) => handleZoom(z)}
          aria-label="Zoom"
        />
      </div>
    </div>
  );
}
