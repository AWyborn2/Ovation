/**
 * Photo position (New Studio): move a photo inside its frame on one card, as
 * the old card editor's photo sliders did. Left–right and Up–down set the
 * focal point (0–1) and Zoom the scale (0.5–3), the photo placement sliders'
 * ranges. A size is positioned on its own (Portrait and Story separately),
 * and Reset puts that size back to how the card draws it without one (the
 * photo's focus box, then its tag box).
 *
 * The renderer reads it as a photo layer's `photoPosition`
 * (`lib/pack-render/adjustments.ts`, `positionPhoto`); a set slide's own is
 * kept in the set's `arrangement.photoFor` and written onto its page's layers
 * wherever the slide is drawn (`slidePhotoPage`).
 */
import { RotateCcw } from "lucide-react";
import { PHOTO_POSITION_ZOOM } from "@workspace/scorecard/kind-templates";
import type { FreeLayer, PhotoPosition } from "@/lib/pack-render";
import { DEFAULT_PHOTO_TRANSFORM, type CardSize } from "@/lib/share-card";
import { btn, Section } from "./design-controls";
import { SIZE_LABEL } from "./template-ops";

/** What the Photo position section edits: one photo layer's position at one size. */
export type PhotoPositionControl = {
  size: CardSize;
  /** The position at this size; null when none is set (the card's own crop). */
  value: PhotoPosition | null;
  /**
   * A new position (`null`: Reset). `done: false` is part of a slider drag:
   * the editor shows it and records the drag as one change when it ends.
   */
  onChange: (next: PhotoPosition | null, done?: boolean) => void;
  /** Whose photo moves: this slide alone (a set), or the card. */
  scope: "slide" | "card";
};

const SLIDERS = [
  ["focalX", "Left–right", 0, 1, 0.01],
  ["focalY", "Up–down", 0, 1, 0.01],
  ["zoom", "Zoom", PHOTO_POSITION_ZOOM[0], PHOTO_POSITION_ZOOM[1], 0.01],
] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A position kept in range, rounded so a saved design stays small. */
export function cleanPosition(p: PhotoPosition): PhotoPosition {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    focalX: r(clamp(Number.isFinite(p.focalX) ? p.focalX : 0.5, 0, 1)),
    focalY: r(clamp(Number.isFinite(p.focalY) ? p.focalY : 0.5, 0, 1)),
    zoom: r(clamp(Number.isFinite(p.zoom) ? p.zoom : 1, ...PHOTO_POSITION_ZOOM)),
  };
}

/** A photo layer's `photoPosition` with one size's set or cleared. */
export function withLayerPhotoPosition(
  layer: Pick<FreeLayer, "photoPosition">,
  size: CardSize,
  next: PhotoPosition | null,
): FreeLayer["photoPosition"] {
  const all = { ...(layer.photoPosition ?? {}) };
  if (next) all[size] = cleanPosition(next);
  else delete all[size];
  return Object.keys(all).length ? all : undefined;
}

export function PhotoPositionSection({ control }: { control: PhotoPositionControl }) {
  const { size, value, onChange, scope } = control;
  const shown = value ?? DEFAULT_PHOTO_TRANSFORM;
  const sizeName = SIZE_LABEL[size];
  const change = (key: (typeof SLIDERS)[number][0], raw: string, done: boolean) =>
    onChange(cleanPosition({ ...shown, [key]: Number(raw) }), done);
  return (
    <Section title="Photo position">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--ed-ink2)]">
          {scope === "slide" ? `This slide only, at ${sizeName}.` : `This card, at ${sizeName}.`}{" "}
          {value ? "" : "Not moved yet."}
        </p>
        <button
          type="button"
          className={btn}
          disabled={!value}
          onClick={() => onChange(null, true)}
          aria-label="Reset photo position"
        >
          <RotateCcw className="mr-1 inline h-3 w-3" aria-hidden /> Reset
        </button>
      </div>
      {SLIDERS.map(([key, title, min, max, step]) => (
        <label
          key={key}
          className="block space-y-1 text-[11px] font-semibold text-[var(--ed-ink2)]"
        >
          <span className="flex justify-between">
            <span>{title}</span>
            <span className="font-mono">
              {key === "zoom" ? `${shown.zoom.toFixed(2)}×` : `${Math.round(shown[key] * 100)}%`}
            </span>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={shown[key]}
            aria-label={`Photo ${title.toLowerCase()}`}
            onChange={(e) => change(key, e.target.value, false)}
            onPointerUp={(e) => change(key, e.currentTarget.value, true)}
            onKeyUp={(e) => change(key, e.currentTarget.value, true)}
            onBlur={(e) => value && change(key, e.currentTarget.value, true)}
            className="h-6 w-full cursor-pointer accent-[var(--ed-accent)]"
          />
        </label>
      ))}
      <p className="text-[11px] text-[var(--ed-ink2)]">
        Set separately for each size. A photo that already fills its box top to bottom (or side to
        side) has no room to move that way: zoom in for more photo to move through, or zoom out
        below 1× to move a smaller photo around its box.
      </p>
    </Section>
  );
}
