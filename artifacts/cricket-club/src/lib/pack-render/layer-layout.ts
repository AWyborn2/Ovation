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

/** An image layer that is one sponsor-strip slot: its content is just `{{sponsor1..3}}`. */
const SPONSOR_SLOT = /^\{\{\s*(sponsor[1-3])\s*\}\}$/;

/** The sponsor slot an image layer draws, if it is one. */
export function sponsorSlotToken(layer: TemplateLayerV2): string | null {
  if (layer.kind !== "image") return null;
  const m = SPONSOR_SLOT.exec(String(layer.content ?? "").trim());
  return m ? m[1]! : null;
}

/** Whether box `outer` encloses `inner` (within `tol` percent of the artboard on each side). */
function encloses(outer: LayerBox, inner: LayerBox, tol = 1.5): boolean {
  const [ox, oy, ow, oh] = [num(outer.x), num(outer.y), num(outer.w), num(outer.h)];
  const [ix, iy, iw, ih] = [num(inner.x), num(inner.y), num(inner.w), num(inner.h)];
  return ox - tol <= ix && oy - tol <= iy && ox + ow + tol >= ix + iw && oy + oh + tol >= iy + ih;
}

/** An image layer bound to one image: its content is just `{{token}}`. */
const IMAGE_SLOT = /^\{\{\s*([\w.]+)\s*\}\}$/;
/** A logo or crest token: `sponsor2`, `weekendSponsor0`, `clubLogo`, `opposition.logo`, `day3.crest`. */
const LOGO_TOKEN = /^(?:(?:weekend)?[Ss]ponsor\d+|[\w.]*(?:[Ll]ogo|[Cc]rest))$/;

/**
 * The logo a layer is a slot for, if it is one: an image layer whose content
 * is one logo or crest `{{token}}` (a sponsor logo, a club or opposition
 * crest, a player sponsor's logo). A photo or artwork isn't one (the card's
 * photo, the ground photo, a sponsor's artwork): with none, a card draws the
 * look's no-photo design in its frame (a panel, a faint crest), not nothing.
 */
export function imageSlotToken(layer: TemplateLayerV2): string | null {
  if (layer.kind !== "image") return null;
  const token = IMAGE_SLOT.exec(String(layer.content ?? "").trim())?.[1];
  return token && LOGO_TOKEN.test(token) ? token : null;
}

/** The area two boxes share, in square percent of the artboard. */
export function overlapArea(a: LayerBox, b: LayerBox): number {
  const w = Math.min(num(a.x) + num(a.w), num(b.x) + num(b.w)) - Math.max(num(a.x), num(b.x));
  const h = Math.min(num(a.y) + num(a.h), num(b.y) + num(b.h)) - Math.max(num(a.y), num(b.y));
  return w > 0 && h > 0 ? w * h : 0;
}

const areaOf = (b: LayerBox) => Math.max(0, num(b.w)) * Math.max(0, num(b.h));

/** A layer designed for an empty slot (a no-photo panel, a stand-in): never a frame to drop. */
const designedFallback = (layer: TemplateLayerV2) =>
  layer.showWhen?.photo === false || typeof layer.showWhen?.noField === "string";

/** Below this opacity a frame is a faint tint, not a box. */
const FAINT = 0.15;

/** Layers that put something in a box: type, an image, a photo, a list, a group. */
const CONTENT_KINDS = new Set(["text", "image", "photo", "rows", "group"]);

export interface EmptySlotOptions {
  /** Which layers are slots, and for what: every image slot by default (`imageSlotToken`). */
  slotToken?: (layer: TemplateLayerV2) => string | null;
  /**
   * Whether a sibling is drawn on this card. Default: it binds no token, or
   * the card has one it binds. A frame something drawn sits in keeps it.
   */
  drawn?: (layer: TemplateLayerV2) => boolean;
}

/**
 * The frames and plates of empty image slots (dev retests 4 and 5): an empty
 * slot draws nothing. A design lays out a box (a panel, a border, a backing
 * plate) round or under a logo or crest, conditioned at most on the card
 * having sponsors. When the slot's image is missing (one sponsor of three, a
 * junior opposition with no crest), the image dropped but its box drew as an
 * empty dark square.
 *
 * A frame here is a layer among `siblings` that binds no token (a shape, a
 * vector, a plain text panel) and holds exactly one slot on this size: its
 * box encloses the slot's and is no more than four times its area, or most of
 * it (60%) lies on the slot (a plate under a logo drawn larger than it). When
 * that slot is empty the frame isn't drawn, unless something drawn sits in it
 * (a stand-in monogram, a no-photo crest panel, a label): it then frames that.
 * A strip-wide band behind every slot holds more than one, so it stays; a
 * layer designed for the empty slot (`showWhen` photo false, or `noField`) is
 * never a frame.
 */
export function emptySlotFrames(
  siblings: readonly TemplateLayerV2[],
  boxOf: (layer: TemplateLayerV2) => LayerBox | null,
  has: (token: string, slot: TemplateLayerV2) => boolean,
  tokensOf: (layer: TemplateLayerV2) => readonly string[],
  opts: EmptySlotOptions = {},
): Set<TemplateLayerV2> {
  const slotToken = opts.slotToken ?? imageSlotToken;
  const drawn =
    opts.drawn ??
    ((layer: TemplateLayerV2) => {
      const tokens = tokensOf(layer);
      return tokens.length === 0 || tokens.some((t) => has(t, layer));
    });
  const slots = siblings
    .map((layer) => ({ layer, token: slotToken(layer), box: boxOf(layer) }))
    .filter(
      (s): s is { layer: TemplateLayerV2; token: string; box: LayerBox } =>
        !!s.token && !!s.box && areaOf(s.box) > 0,
    );
  const frames = new Set<TemplateLayerV2>();
  if (!slots.some((s) => !has(s.token, s.layer))) return frames;
  const slotLayers = new Set(slots.map((s) => s.layer));
  for (const layer of siblings) {
    if (layer.kind !== "text" && CONTENT_KINDS.has(layer.kind)) continue;
    if (tokensOf(layer).length > 0 || designedFallback(layer)) continue;
    // A near-invisible tint (a 6% plate) reads as no box: it stays, and holds its stack place.
    if (num(layer.style?.opacity, 1) < FAINT) continue;
    const box = boxOf(layer);
    if (!box) continue;
    const area = areaOf(box);
    if (area <= 0) continue;
    // Round the slot (no more than four times its area) or under it (most of
    // the frame on it, the slot no more than four times the frame's area: a
    // tile on a full-card photo isn't that photo's frame).
    const held = slots.filter(
      (s) =>
        (encloses(box, s.box) && area <= 4 * areaOf(s.box)) ||
        (overlapArea(box, s.box) >= 0.6 * area && areaOf(s.box) <= 4 * area),
    );
    if (held.length !== 1) continue;
    const slot = held[0]!;
    if (has(slot.token, slot.layer)) continue;
    const filled = siblings.some((other) => {
      if (other === layer || slotLayers.has(other)) return false;
      if (!CONTENT_KINDS.has(other.kind) && !designedFallback(other)) return false;
      const b = boxOf(other);
      if (!b || areaOf(b) <= 0 || overlapArea(box, b) < 0.5 * areaOf(b)) return false;
      return drawn(other);
    });
    if (!filled) frames.add(layer);
  }
  return frames;
}

/**
 * The tile frames of a sponsor strip's empty slots (dev retest 4, set 968):
 * `emptySlotFrames` with the `{{sponsorN}}` logos for its slots.
 */
export function emptySponsorFrames(
  siblings: readonly TemplateLayerV2[],
  boxOf: (layer: TemplateLayerV2) => LayerBox | null,
  has: (token: string) => boolean,
  tokensOf: (layer: TemplateLayerV2) => readonly string[],
): Set<TemplateLayerV2> {
  return emptySlotFrames(siblings, boxOf, (t) => has(t), tokensOf, {
    slotToken: sponsorSlotToken,
  });
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
