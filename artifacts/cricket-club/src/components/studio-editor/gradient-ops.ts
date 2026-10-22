/**
 * Edits to a format v2 gradient (`TemplateGradient`) for the gradient editor
 * (B1): its type, its stops and their positions. Every edit returns a new
 * gradient within the format's limits (`MIN_GRADIENT_STOPS`–`MAX_GRADIENT_STOPS`
 * stops, positions 0–100), so the editor can't store one the validator refuses.
 */
import {
  MAX_GRADIENT_STOPS,
  MIN_GRADIENT_STOPS,
  type GradientStop,
  type TemplateGradient,
} from "@workspace/scorecard/kind-templates";

/** A new gradient: the club's colour down to the panel. */
export const DEFAULT_GRADIENT: TemplateGradient = {
  type: "linear",
  angle: 180,
  stops: [
    { color: "var(--gold)", at: 0 },
    { color: "var(--panel)", at: 100 },
  ],
};

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Each stop's position, as CSS places it: a stop without one sits 0 % (first),
 * 100 % (last) or evenly between its placed neighbours, and none sits before
 * the stop ahead of it.
 */
export function stopPositions(stops: readonly GradientStop[]): number[] {
  const at: Array<number | undefined> = stops.map((s) =>
    typeof s.at === "number" && Number.isFinite(s.at) ? clamp(s.at) : undefined,
  );
  if (at.length === 0) return [];
  if (at[0] === undefined) at[0] = 0;
  if (at.length > 1 && at[at.length - 1] === undefined) at[at.length - 1] = 100;
  let last = at[0]!;
  for (let i = 1; i < at.length; i++) {
    if (at[i] !== undefined) {
      at[i] = Math.max(at[i]!, last);
      last = at[i]!;
      continue;
    }
    let j = i;
    while (at[j] === undefined) j++;
    const end = Math.max(at[j]!, last);
    const step = (end - last) / (j - i + 1);
    for (let k = i; k < j; k++) at[k] = round(last + step * (k - i + 1));
    last = at[j - 1]!;
  }
  return at as number[];
}

/** The gradient as the other type, keeping its stops. */
export function withType(g: TemplateGradient, type: TemplateGradient["type"]): TemplateGradient {
  if (g.type === type) return g;
  return type === "radial"
    ? { type: "radial", shape: "ellipse", at: { x: 50, y: 50 }, stops: g.stops }
    : { type: "linear", angle: 180, stops: g.stops };
}

/**
 * A new stop in the widest gap between two stops, in the colour of the stop
 * before it. Every stop gets its position written down, so the new one lands
 * where it's shown. No change at the most stops a gradient may have.
 */
export function addStop(g: TemplateGradient): TemplateGradient {
  if (g.stops.length >= MAX_GRADIENT_STOPS) return g;
  const at = stopPositions(g.stops);
  const placed = g.stops.map((s, i) => ({ ...s, at: at[i]! }));
  let gap = 0;
  for (let i = 1; i < placed.length; i++)
    if (placed[i]!.at - placed[i - 1]!.at > placed[gap + 1]!.at - placed[gap]!.at) gap = i - 1;
  const before = placed[gap]!;
  const after = placed[gap + 1] ?? { ...before, at: 100 };
  const stop = { color: before.color, at: round((before.at + after.at) / 2) };
  return { ...g, stops: [...placed.slice(0, gap + 1), stop, ...placed.slice(gap + 1)] };
}

/** The gradient without one stop; no change at the fewest it may have. */
export function removeStop(g: TemplateGradient, index: number): TemplateGradient {
  if (g.stops.length <= MIN_GRADIENT_STOPS || !g.stops[index]) return g;
  return { ...g, stops: g.stops.filter((_, i) => i !== index) };
}

/** One stop changed: its colour, or its position (kept within 0–100). */
export function setStop(
  g: TemplateGradient,
  index: number,
  patch: Partial<GradientStop>,
): TemplateGradient {
  if (!g.stops[index]) return g;
  const next = { ...g.stops[index]!, ...patch };
  if (patch.at !== undefined) next.at = round(clamp(patch.at));
  return { ...g, stops: g.stops.map((s, i) => (i === index ? next : s)) };
}

/** Whether a fill is a gradient (an object), not a colour. */
export function isGradient(fill: unknown): fill is TemplateGradient {
  return (
    typeof fill === "object" &&
    fill !== null &&
    ((fill as { type?: unknown }).type === "linear" ||
      (fill as { type?: unknown }).type === "radial") &&
    Array.isArray((fill as { stops?: unknown }).stops)
  );
}
