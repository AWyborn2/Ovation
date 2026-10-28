/** Below this text scale a fitted board is flagged as hard to read. */
export const FIT_READABLE_SCALE = 0.7;
/** Fit never shrinks text below this. */
export const FIT_MIN_SCALE = 0.35;
const FIT_STEP = 0.04;

/**
 * "Fit to screen": the largest scale, stepping down from `start`, at which the
 * board fits (`fits(scale)` measures it). Stops at FIT_MIN_SCALE even if it
 * still overflows. `readable` is false below FIT_READABLE_SCALE, for the
 * settings screen's warning.
 */
export function findFitScale(
  fits: (scale: number) => boolean,
  start: number,
): { scale: number; readable: boolean } {
  let scale = start;
  while (!fits(scale) && scale - FIT_STEP >= FIT_MIN_SCALE - 1e-9) {
    scale = Math.round((scale - FIT_STEP) * 100) / 100;
  }
  return { scale, readable: scale >= FIT_READABLE_SCALE };
}

/** The parts of the board body and its inner element that fitting touches. */
export interface FitTarget {
  body: { scrollHeight: number; clientHeight: number };
  inner: { style: { setProperty(name: string, value: string): void } };
}

/**
 * Scale the body's inner element (`--hb-kp-scale`) down from `start` until it
 * no longer overflows the body. Used by "fit to screen", and by pages when a
 * single row (a row of plaques) is taller than the screen, so it shrinks
 * rather than being clipped.
 */
export function fitToBody({ body, inner }: FitTarget, start: number) {
  const result = findFitScale((sc) => {
    inner.style.setProperty("--hb-kp-scale", String(sc));
    return !overflowsBody(body);
  }, start);
  inner.style.setProperty("--hb-kp-scale", String(result.scale));
  return result;
}

/** Whether the body's content is taller than the body (it would be clipped). */
export function overflowsBody(body: FitTarget["body"]): boolean {
  return body.scrollHeight > body.clientHeight + 1;
}

/**
 * Credits roll length for `distancePx` of overflow at `speedPxPerSec`. Speed is
 * set for a 1280px-wide screen and scales with the screen, so a roll takes the
 * same time on a 1080p TV as in the settings preview.
 */
export function creditsDurationMs(
  distancePx: number,
  speedPxPerSec: number,
  screenWidthPx: number,
): number {
  if (distancePx <= 0) return 0;
  const px = Math.max(1, speedPxPerSec) * (Math.max(1, screenWidthPx) / 1280);
  return (distancePx / px) * 1000;
}
