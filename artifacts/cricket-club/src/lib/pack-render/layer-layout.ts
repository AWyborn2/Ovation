/**
 * Layout for v2 documents (ADR-011 §1): stack groups, collapse and
 * `showWhen` conditions (L1-C, T1.13–T1.15).
 *
 * The renderer calls these for v2 documents only, after its own rules
 * (hidden layers, sizes, the drop rule), so v1 documents are untouched.
 *
 * - A group draws its children inside its own box. Without a stack each
 *   child keeps its own box; with one, the children are laid out by CSS flex
 *   in the group's box and keep only their width and height.
 * - A child that isn't drawn (hidden, not on this size, its condition false,
 *   dropped by the drop rule) takes no space, so a stack closes up around it.
 * - A group none of whose children is drawn isn't drawn either.
 * - Conditions are read after the render path's junior and private-player
 *   rules: `photo` is whether the photo is drawn, not whether one exists, so
 *   no condition can bring back what the render path withheld.
 */
import {
  MAX_STACK_DEPTH,
  type GroupLayerV2,
  type LayerBox,
  type PageKey,
  type StackSpec,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import type { CardSize } from "../share-card";

/** What layout and conditions read about the card being drawn. */
export interface LayoutContext {
  kind: string;
  page: PageKey;
  size: CardSize;
  /** A junior card (the render path's junior rules have already run). */
  junior: boolean;
  /** Whether the card has a value for a token (text, image or rows). */
  has: (token: string) => boolean;
  /** Whether the card's photo is drawn (never on a junior card without the server's marker). */
  hasPhoto: boolean;
  /** Whether the card has sponsor logos. */
  hasSponsors: boolean;
}

/**
 * A layer the renderer drew: its box on this size (percent of the artboard),
 * its markup, and its wrapper's attributes and non-positional declarations,
 * so a group can place it in its own box.
 */
export interface DrawnLayer {
  layer: TemplateLayerV2;
  box: LayerBox;
  /** `data-layer-id` and friends, with a leading space. */
  attrs: string;
  /** Wrapper declarations other than position and size (rotation, opacity, motion, style). */
  style: string[];
  inner: string;
  /** The layer's absolutely positioned wrapper on the artboard. */
  html: string;
}

/** Whether a group at `depth` (1 = a page's own layer) may be drawn. */
export const groupDepthAllowed = (depth: number): boolean => depth <= MAX_STACK_DEPTH;

/** Whether a layer's `showWhen` conditions hold on this card (T1.15). */
export function layerShows(layer: TemplateLayerV2, ctx: LayoutContext): boolean {
  const when = layer.showWhen;
  if (!when || typeof when !== "object") return true;
  if (typeof when.field === "string" && !ctx.has(when.field)) return false;
  if (typeof when.noField === "string" && ctx.has(when.noField)) return false;
  if (typeof when.photo === "boolean" && when.photo !== ctx.hasPhoto) return false;
  if (typeof when.sponsors === "boolean" && when.sponsors !== ctx.hasSponsors) return false;
  if (typeof when.junior === "boolean" && when.junior !== ctx.junior) return false;
  return true;
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const pct = (v: number) => `${Number(v.toFixed(3))}%`;
const cssValue = (v: string | undefined): string | undefined =>
  v == null ? undefined : String(v).replace(/[";<>{}]/g, "");

const ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};
const JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly",
};
const pick = (map: Record<string, string>, v: unknown, fallback: string) =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(map, v) ? map[v] : fallback;

/** The flex container declarations for a stack. */
function stackCss(stack: StackSpec): string[] {
  const direction = stack.direction === "row" ? "row" : "column";
  const gap = Math.min(50, Math.max(0, num(stack.gap)));
  return [
    "display:flex",
    `flex-direction:${direction}`,
    gap ? `gap:${Number(gap.toFixed(3))}cqw` : "",
    `align-items:${pick(ALIGN, stack.align, "flex-start")}`,
    `justify-content:${pick(JUSTIFY, stack.justify, "flex-start")}`,
  ];
}

/**
 * A group's inner markup from its drawn children (T1.13, T1.14): the
 * children that survived the renderer's rules, in document order. Null when
 * none did, or the group's box has no area.
 */
export function renderGroup(
  group: GroupLayerV2,
  box: LayerBox,
  children: readonly DrawnLayer[],
  _ctx: LayoutContext,
): string | null {
  const gw = num(box.w);
  const gh = num(box.h);
  if (children.length === 0 || gw <= 0 || gh <= 0) return null;
  const stack = group.stack && typeof group.stack === "object" ? group.stack : null;
  const across = stack?.direction === "row" ? "height" : "width";
  const stretch = stack?.align === "stretch";
  const parts = children.map((child) => {
    const size = [
      !(stretch && across === "width") ? `width:${pct((num(child.box.w) / gw) * 100)}` : "",
      !(stretch && across === "height") ? `height:${pct((num(child.box.h) / gh) * 100)}` : "",
    ];
    const place = stack
      ? ["position:relative", "flex:none", ...size]
      : [
          "position:absolute",
          `left:${pct(((num(child.box.x) - num(box.x)) / gw) * 100)}`,
          `top:${pct(((num(child.box.y) - num(box.y)) / gh) * 100)}`,
          ...size,
        ];
    const css = [...place, ...child.style].filter(Boolean).join(";");
    return `<div${child.attrs} style="${css}">${child.inner}</div>`;
  });
  const bg = cssValue(group.style?.background);
  const frame = [
    "position:relative",
    "width:100%",
    "height:100%",
    bg ? `background:${bg}` : "",
    group.style?.radius != null ? `border-radius:${num(group.style.radius)}px` : "",
    ...(stack ? stackCss(stack) : []),
  ].filter(Boolean);
  return `<div${stack ? ` data-stack="${stack.direction === "row" ? "row" : "column"}"` : ""} style="${frame.join(";")}">${parts.join("")}</div>`;
}
