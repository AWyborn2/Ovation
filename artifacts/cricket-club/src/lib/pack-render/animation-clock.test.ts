/**
 * Social Studio U18 — the frame clock for clip exports: the clip lasts until
 * every layer has landed plus a hold, and each frame pauses the animations at
 * its own time, so a rise-animated layer enters over the first 0.7s.
 */
import { describe, it, expect } from "vitest";
import {
  CLIP_HOLD_MS,
  CLIP_MAX_MS,
  CLIP_MIN_MS,
  clipDuration,
  seekAnimations,
  type SeekableAnimation,
} from "./animation-clock";
import { renderFreeLayers, type FreeLayer } from "./adjustments";

/** A stand-in for a CSS animation: `durationMs` long after `delayMs`. */
function fakeAnimation(durationMs: number, delayMs = 0) {
  const a = {
    currentTime: null as number | null,
    paused: false,
    pause() {
      a.paused = true;
    },
    effect: { getComputedTiming: () => ({ endTime: delayMs + durationMs }) },
    /** 0..1 through the entrance at the current time. */
    get progress() {
      const t = Number(a.currentTime ?? 0) - delayMs;
      return Math.max(0, Math.min(1, t / durationMs));
    },
  };
  return a;
}

const rise: FreeLayer = {
  id: "l1",
  kind: "text",
  content: "GAME DAY",
  animation: { kind: "rise" },
  geometry: { square: { x: 10, y: 10, w: 50, h: 10 } },
  editedAt: { square: 1 },
};

/** The layer's CSS animation duration in ms, read from the rendered card. */
function renderedDurationMs(layer: FreeLayer): number {
  const html = renderFreeLayers({ layers: [layer] }, "square", { animate: true });
  const m = /animation:packLayerRise ([.\d]+)s/.exec(html);
  if (!m) throw new Error("no rise animation rendered");
  return Number(m[1]) * 1000;
}

describe("clip clock", () => {
  it("a rise-animated layer enters over the clip's first 0.7s", () => {
    const duration = renderedDurationMs(rise);
    expect(duration).toBe(700);
    const anim = fakeAnimation(duration);
    const clipMs = clipDuration([anim]);
    expect(clipMs).toBe(700 + CLIP_HOLD_MS);

    // Frames as the server samples them: t = i / (frames - 1), seeked to t × clip.
    const fps = 30;
    const frames = Math.round((clipMs / 1000) * fps);
    const progressAt: { ms: number; p: number }[] = [];
    for (let i = 0; i < frames; i += 1) {
      const ms = (i / (frames - 1)) * clipMs;
      seekAnimations([anim as SeekableAnimation], ms);
      progressAt.push({ ms, p: anim.progress });
    }
    expect(anim.paused).toBe(true);
    expect(progressAt[0].p).toBe(0);
    const entering = progressAt.filter((f) => f.ms < 700);
    expect(entering.every((f) => f.p < 1)).toBe(true);
    expect(entering.length).toBeGreaterThan(15);
    expect(progressAt.filter((f) => f.ms >= 700).every((f) => f.p === 1)).toBe(true);
  });

  it("a delayed layer extends the clip; the length stays within 2–8s", () => {
    expect(clipDuration([fakeAnimation(700, 1200)])).toBe(1900 + CLIP_HOLD_MS);
    expect(clipDuration([])).toBe(CLIP_MIN_MS);
    expect(clipDuration([fakeAnimation(700, 20_000)])).toBe(CLIP_MAX_MS);
  });
});
