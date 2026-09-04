// Animation primitives (easing, count-up) and the animated-card option helpers
// (effective motion / duration / speed). Depends only on ./types so both the
// renderers and share-card-animation.ts can use it without cycles.
import type { MotionPreset, RenderOptions } from "./types";

// --- Animation primitives ---------------------------------------------------

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
export const easeOutCubic = (n: number): number => 1 - Math.pow(1 - clamp01(n), 3);
// Overshoot ease for the "popIn" preset (settles slightly past 1 then back).
export const easeOutBack = (n: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(n);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Scale a stat value for the count-up preset. Numbers tick from 0→full; strings
// (e.g. "3/22", "1,234 runs") scale their first numeric run via applyCountUp so
// drawCount(1) renders identically to the static draw (rest-frame parity).
export const countValue = (v: string | number, frac: number): string | number =>
  typeof v === "number" ? Math.round(v * clamp01(frac)) : applyCountUp(v, frac);

// Replace the first run of digits in `text` with the same number scaled by
// `frac` (0-1). Powers the count-up preset: "1,234 Runs" → "740 Runs" mid-way.
export const applyCountUp = (text: string, frac: number): string =>
  text.replace(/\d[\d,]*/, (m) => {
    const n = parseInt(m.replace(/,/g, ""), 10);
    if (Number.isNaN(n)) return m;
    return Math.round(n * clamp01(frac)).toLocaleString();
  });

// --- Animated cards ----------------------------------------------------------

// The effective motion preset: an explicit option wins, else the template's own
// preset, else "none".
export const effectiveMotion = (opts: RenderOptions): MotionPreset =>
  opts.motionPreset ??
  ((opts.template?.motionPreset as MotionPreset | undefined) || "none");

// A card is animated when it has a moving background (video/GIF) or a motion
// preset other than "none".
export const isAnimatedCard = (opts: RenderOptions): boolean => {
  const kind = opts.template?.backgroundKind;
  return kind === "video" || kind === "gif" || effectiveMotion(opts) !== "none";
};

// A reusable animation: draw(ctx, t) paints the frame at progress t (0-1). Used
// by both the live preview (rAF loop) and the MediaRecorder export. Call
// cleanup() when finished to release any playing <video> elements / bitmaps.
export type AnimationHandle = {
  width: number;
  height: number;
  durationMs: number;
  loop: boolean;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
  cleanup: () => void;
};

// Default clip length when no admin override is supplied.
export const DEFAULT_DURATION_MS = 3500;
// Safe clip-length band (admin-configurable; bounds protect export feasibility).
export const MIN_DURATION_MS = 1500;
export const MAX_DURATION_MS = 10000;
// Safe animation-speed band (1 = default).
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

// Animated cards are short looping clips. Clamp every duration into a sane band.
export const clampDuration = (ms: number): number =>
  Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, Math.round(ms)));

// Clamp the animation speed multiplier into its safe band (default 1).
const clampSpeed = (s: number): number =>
  Math.max(MIN_SPEED, Math.min(MAX_SPEED, s));

// The effective clip length for a card: an explicit admin override wins (clamped),
// else a video template's own background duration, else the default.
export const effectiveDuration = (opts: RenderOptions): number => {
  if (typeof opts.durationMs === "number" && Number.isFinite(opts.durationMs)) {
    return clampDuration(opts.durationMs);
  }
  return DEFAULT_DURATION_MS;
};

// The effective animation speed for a card (clamped; default 1).
export const effectiveSpeed = (opts: RenderOptions): number =>
  typeof opts.speed === "number" && Number.isFinite(opts.speed)
    ? clampSpeed(opts.speed)
    : 1;
