/**
 * Frame clock for exporting an animated pack card (Social Studio U18): the
 * card's CSS animations are paused and seeked to each frame's time, so the
 * server can screenshot the exact frame instead of recording in real time.
 */

/** The slice of the Web Animations API the clock needs (testable without a DOM). */
export type SeekableAnimation = {
  currentTime: number | null | CSSNumberish;
  pause(): void;
  effect: { getComputedTiming(): { endTime?: number | CSSNumberish } } | null;
};

/** How long the finished card holds on screen after the last layer lands. */
export const CLIP_HOLD_MS = 1500;
export const CLIP_MIN_MS = 2000;
export const CLIP_MAX_MS = 8000;

/** Clip length: every animation finished, then a hold; clamped to 2–8s. */
export function clipDuration(animations: SeekableAnimation[]): number {
  let end = 0;
  for (const a of animations) {
    const t = Number(a.effect?.getComputedTiming().endTime ?? 0);
    if (Number.isFinite(t)) end = Math.max(end, t);
  }
  return Math.min(CLIP_MAX_MS, Math.max(CLIP_MIN_MS, Math.round(end + CLIP_HOLD_MS)));
}

/** Pause every animation at `ms` from the start. */
export function seekAnimations(animations: SeekableAnimation[], ms: number): void {
  for (const a of animations) {
    a.pause();
    a.currentTime = Math.max(0, ms);
  }
}
