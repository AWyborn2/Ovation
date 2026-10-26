import type { KioskTransition } from "@workspace/scorecard/kiosk-display";

/**
 * Kiosk transitions (Ash, 22 Oct 2026): how a board, or its next page, arrives.
 * Only transform, opacity and clip-path animate, which stay cheap on clubroom TV
 * browsers. "rows" reveals the new screen's rows one after another; "wipe"
 * sweeps a gold rule across.
 */

export type ConcreteTransition = Exclude<KioskTransition, "random">;

/** The transitions "Random" picks from (the showy ones, not Rows reveal or Cut). */
export const RANDOM_TRANSITIONS: readonly ConcreteTransition[] = [
  "fade",
  "up",
  "down",
  "left",
  "right",
  "pop",
  "zoom",
  "flip",
  "wipe",
];

/**
 * The transition to play: "random" resolved, and anything but Cut turned into
 * a Fade for viewers who ask for reduced motion.
 */
export function pickTransition(
  t: KioskTransition,
  opts: { reducedMotion?: boolean; random?: () => number } = {},
): ConcreteTransition {
  const rand = opts.random ?? Math.random;
  const picked =
    t === "random"
      ? RANDOM_TRANSITIONS[
          Math.min(RANDOM_TRANSITIONS.length - 1, Math.floor(rand() * RANDOM_TRANSITIONS.length))
        ]!
      : t;
  return opts.reducedMotion && picked !== "cut" ? "fade" : picked;
}

export interface TransitionSpec {
  /** Keyframes for the incoming screen and the outgoing one. */
  incoming: Keyframe[];
  outgoing: Keyframe[];
  /** Outgoing plays first, then incoming (each half the duration). */
  sequential?: boolean;
  /** CSS perspective on the host while it plays (3-D flip). */
  perspective?: string;
  /** Sweep the gold rule across while it plays. */
  wipeBar?: boolean;
  /** Stagger the incoming screen's rows in after the outgoing one fades. */
  rows?: boolean;
  /** Duration multiplier. */
  scale?: number;
}

const FADE: TransitionSpec = {
  incoming: [{ opacity: 0 }, { opacity: 1 }],
  outgoing: [{ opacity: 1 }, { opacity: 0 }],
};
const slide = (from: string, to: string): TransitionSpec => ({
  incoming: [{ transform: from }, { transform: "none" }],
  outgoing: [{ transform: "none" }, { transform: to }],
});

/** Keyframes for each transition ("cut" has none: the swap is instant). */
export function transitionSpec(t: ConcreteTransition): TransitionSpec | null {
  switch (t) {
    case "cut":
      return null;
    case "up":
      return slide("translateY(100%)", "translateY(-100%)");
    case "down":
      return slide("translateY(-100%)", "translateY(100%)");
    case "left":
      return slide("translateX(100%)", "translateX(-100%)");
    case "right":
      return slide("translateX(-100%)", "translateX(100%)");
    case "pop":
      return {
        incoming: [
          { opacity: 0, transform: "scale(.82)" },
          { opacity: 1, transform: "scale(1.03)", offset: 0.7 },
          { opacity: 1, transform: "none" },
        ],
        outgoing: [{ opacity: 1 }, { opacity: 0, transform: "scale(1.04)" }],
      };
    case "zoom":
      return {
        incoming: [
          { opacity: 0, transform: "scale(1.18)" },
          { opacity: 1, transform: "none" },
        ],
        outgoing: [{ opacity: 1 }, { opacity: 0, transform: "scale(.94)" }],
      };
    case "flip":
      return {
        incoming: [{ transform: "rotateX(-90deg)" }, { transform: "none" }],
        outgoing: [{ transform: "none" }, { transform: "rotateX(90deg)" }],
        sequential: true,
        perspective: "1400px",
      };
    case "wipe":
      return {
        incoming: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
        outgoing: [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 0 100%)" }],
        wipeBar: true,
        scale: 1.3,
      };
    case "rows":
      return { ...FADE, sequential: true, rows: true };
    default:
      return FADE;
  }
}

/** Elements staggered by the Rows reveal transition. */
export const ROW_SELECTOR = ".row, .hb-flag, .hb-lineup-row, .hb-lm-card, .hb-panel";

const EASE = "cubic-bezier(.2,.7,.2,1)";

function canAnimate(el: Element | null | undefined): el is HTMLElement {
  return !!el && typeof (el as HTMLElement).animate === "function";
}

async function finished(a: Animation): Promise<void> {
  try {
    await a.finished;
  } catch {
    // Cancelled (the player moved on); nothing to wait for.
  }
}

/**
 * Play `t` between two elements stacked in `host`. Resolves when the incoming
 * element is fully shown; the caller removes the outgoing one. Without the Web
 * Animations API (or with no outgoing element) it resolves at once.
 */
export async function runTransition(opts: {
  host: HTMLElement | null;
  outgoing: HTMLElement | null;
  incoming: HTMLElement | null;
  transition: ConcreteTransition;
  durationMs: number;
  signal?: AbortSignal;
}): Promise<void> {
  const { host, outgoing, incoming, transition, signal } = opts;
  const spec = transitionSpec(transition);
  if (!spec || !canAnimate(incoming) || signal?.aborted) return;
  const d = Math.max(0, opts.durationMs) * (spec.scale ?? 1);
  const running: Animation[] = [];
  const onAbort = () => running.forEach((a) => a.cancel());
  signal?.addEventListener("abort", onAbort, { once: true });
  const play = (el: HTMLElement, frames: Keyframe[], o: KeyframeAnimationOptions) => {
    const a = el.animate(frames, o);
    running.push(a);
    return finished(a);
  };
  if (host && spec.perspective) host.style.perspective = spec.perspective;
  let bar: HTMLElement | null = null;
  try {
    if (spec.rows) {
      if (canAnimate(outgoing)) {
        incoming.style.visibility = "hidden";
        await play(outgoing, spec.outgoing, { duration: d / 2, fill: "forwards" });
        incoming.style.visibility = "";
      }
      const rows = [...incoming.querySelectorAll<HTMLElement>(ROW_SELECTOR)].slice(0, 40);
      if (rows.length) {
        await Promise.all(
          rows.map((r, i) =>
            play(
              r,
              [
                { opacity: 0, transform: "translateY(12px)" },
                { opacity: 1, transform: "none" },
              ],
              {
                duration: d,
                delay: i * (d / 6),
                easing: EASE,
                fill: "backwards",
              },
            ),
          ),
        );
      } else {
        await play(incoming, spec.incoming, { duration: d });
      }
      return;
    }
    if (!canAnimate(outgoing)) {
      await play(incoming, FADE.incoming, { duration: d, easing: EASE });
      return;
    }
    if (spec.sequential) {
      incoming.style.visibility = "hidden";
      await play(outgoing, spec.outgoing, { duration: d / 2, easing: "ease-in", fill: "forwards" });
      incoming.style.visibility = "";
      await play(incoming, spec.incoming, { duration: d / 2, easing: "ease-out" });
      return;
    }
    if (spec.wipeBar && host) {
      bar = document.createElement("div");
      bar.className = "hb-kp-wipe";
      host.appendChild(bar);
      if (canAnimate(bar)) {
        play(bar, [{ left: "0%" }, { left: "100%" }], { duration: d, easing: "ease-in-out" });
      }
    }
    const easing = spec.wipeBar ? "ease-in-out" : EASE;
    await Promise.all([
      play(incoming, spec.incoming, { duration: d, easing }),
      play(outgoing, spec.outgoing, { duration: d, easing, fill: "forwards" }),
    ]);
  } finally {
    incoming.style.visibility = "";
    bar?.remove();
    if (host && spec.perspective) host.style.perspective = "";
    signal?.removeEventListener("abort", onAbort);
  }
}
