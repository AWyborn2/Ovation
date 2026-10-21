/**
 * Layer motion (ADR-011 §7): the CSS a layer's `motion` adds to its box, and
 * the keyframes a card inlines so exports carry them.
 *
 * Seam for L1-D (T1.23): today it draws the entrance presets exactly as v1's
 * `animation` did (rise, fade, pop, with a delay), which is how v1 documents
 * stay byte-identical. L1-D adds durations, easing and the `pulse` and
 * `shine` loops here; nothing else in the renderer needs to change.
 */
import type { LayerMotion, MotionInPreset } from "@workspace/scorecard/kind-templates";

const IN_ANIMATION: Record<MotionInPreset, string> = {
  rise: "packLayerRise .7s cubic-bezier(.2,.8,.2,1) both",
  fade: "packLayerFade .6s ease-out both",
  pop: "packLayerPop .5s cubic-bezier(.2,1.4,.4,1) both",
};

/** CSS a card needs for layer motion (inlined so exports carry it). */
export const MOTION_KEYFRAMES =
  "@keyframes packLayerRise{from{opacity:0;transform:translateY(8%)}to{opacity:1;transform:none}}" +
  "@keyframes packLayerFade{from{opacity:0}to{opacity:1}}" +
  "@keyframes packLayerPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}";

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * The declarations a layer's motion adds to its box, in order; none when the
 * card isn't animated (stills, thumbnails) or the layer has no motion.
 */
export function motionCss(motion: LayerMotion | undefined, animate: boolean): string[] {
  if (!animate || !motion?.in) return [];
  const animation = Object.prototype.hasOwnProperty.call(IN_ANIMATION, motion.in.preset)
    ? IN_ANIMATION[motion.in.preset]
    : null;
  if (!animation) return [];
  const out = [`animation:${animation}`];
  if (motion.in.delayMs) out.push(`animation-delay:${num(motion.in.delayMs)}ms`);
  return out;
}
