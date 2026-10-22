/**
 * Layer motion (ADR-011 §7, L1-D T1.23): the CSS a layer's `motion` adds to
 * its box, and the keyframes a card inlines so exports carry them.
 *
 * - Entrances (`in`): rise, fade, pop. With neither a duration nor an easing
 *   they are exactly v1's `animation` strings, so v1 documents stay
 *   byte-identical.
 * - Loops (`loop`): `pulse` is the packs' LIVE dot (`hhPulse 1.4s`) and
 *   `shine` Gold Foil's foil sweep (`hhShine 5.5s`), inlined under their own
 *   names. A shine sweeps a text fill, so it runs on the text element
 *   (`textStyleCss`), not the box.
 *
 * Clip length is unchanged: loops repeat forever, and the clip clock only
 * counts animations that end (`clipDuration`).
 */
import {
  MOTION_EASINGS,
  type LayerMotion,
  type MotionInPreset,
} from "@workspace/scorecard/kind-templates";

const IN_ANIMATION: Record<MotionInPreset, string> = {
  rise: "packLayerRise .7s cubic-bezier(.2,.8,.2,1) both",
  fade: "packLayerFade .6s ease-out both",
  pop: "packLayerPop .5s cubic-bezier(.2,1.4,.4,1) both",
};

/** Each entrance's parts, for a custom duration or easing. */
const IN_PARTS: Record<MotionInPreset, { name: string; ms: number; easing: string }> = {
  rise: { name: "packLayerRise", ms: 700, easing: "cubic-bezier(.2,.8,.2,1)" },
  fade: { name: "packLayerFade", ms: 600, easing: "ease-out" },
  pop: { name: "packLayerPop", ms: 500, easing: "cubic-bezier(.2,1.4,.4,1)" },
};

/** CSS a card needs for layer motion (inlined so exports carry it). */
export const MOTION_KEYFRAMES =
  "@keyframes packLayerRise{from{opacity:0;transform:translateY(8%)}to{opacity:1;transform:none}}" +
  "@keyframes packLayerFade{from{opacity:0}to{opacity:1}}" +
  "@keyframes packLayerPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}";

/** The loops' keyframes: `hhPulse` and `hhShine` as the packs draw them. */
export const LOOP_KEYFRAMES =
  "@keyframes packLoopPulse{0%,100%{opacity:1;box-shadow:0 0 16px currentColor}50%{opacity:.45;box-shadow:0 0 4px currentColor}}" +
  "@keyframes packLoopShine{0%,100%{background-position:50% 0}50%{background-position:50% 100%}}";

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const secs = (ms: number) => `${+(ms / 1000).toFixed(3)}s`;
const EASINGS = new Set<string>(MOTION_EASINGS);

/** An entrance as an `animation` value, or null. v1's exact strings when nothing is customised. */
function inAnimation(motion: LayerMotion): string | null {
  const m = motion.in;
  if (!m || !Object.prototype.hasOwnProperty.call(IN_ANIMATION, m.preset)) return null;
  if (m.durationMs === undefined && m.easing === undefined) return IN_ANIMATION[m.preset];
  const parts = IN_PARTS[m.preset];
  const ms = clamp(num(m.durationMs, parts.ms), 50, 10000);
  const easing = typeof m.easing === "string" && EASINGS.has(m.easing) ? m.easing : parts.easing;
  return `${parts.name} ${secs(ms)} ${easing} both`;
}

/** A box loop (pulse) as an `animation` value, or null. Shine runs on the text instead. */
function loopAnimation(motion: LayerMotion): string | null {
  if (motion.loop?.preset !== "pulse") return null;
  return `packLoopPulse ${secs(clamp(num(motion.loop.periodMs, 1400), 200, 60000))} ease-in-out infinite`;
}

/**
 * The declarations a layer's motion adds to its box, in order; none when the
 * card isn't animated (stills, thumbnails) or the layer has no motion.
 */
export function motionCss(motion: LayerMotion | undefined, animate: boolean): string[] {
  if (!animate || !motion) return [];
  const entrance = inAnimation(motion);
  const loop = loopAnimation(motion);
  if (entrance && !loop) {
    const out = [`animation:${entrance}`];
    if (motion.in?.delayMs) out.push(`animation-delay:${num(motion.in.delayMs)}ms`);
    return out;
  }
  if (!loop) return [];
  const loopDelay = clamp(num(motion.loop?.delayMs), 0, 60000);
  if (!entrance)
    return [`animation:${loop}`, ...(loopDelay ? [`animation-delay:${loopDelay}ms`] : [])];
  // Both: the entrance first, then the loop from its own delay.
  return [
    `animation:${entrance}, ${loop}`,
    `animation-delay:${clamp(num(motion.in?.delayMs), 0, 60000)}ms, ${loopDelay}ms`,
  ];
}

/** Whether any layer's motion loops (the card then inlines the loops' keyframes). */
export function hasLoops(layers: ReadonlyArray<{ motion?: LayerMotion }>): boolean {
  return layers.some(
    (l) => l.motion?.loop?.preset === "pulse" || l.motion?.loop?.preset === "shine",
  );
}
