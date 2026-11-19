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

/**
 * Whether a frame's box holds a slot's: round it (no more than four times its
 * area) or under it (most of the frame on it, the slot no more than four times
 * the frame's area: a tile on a full-card photo isn't that photo's frame).
 */
function holds(box: LayerBox, slot: LayerBox): boolean {
  const area = areaOf(box);
  return (
    (encloses(box, slot) && area <= 4 * areaOf(slot)) ||
    (overlapArea(box, slot) >= 0.6 * area && areaOf(slot) <= 4 * area)
  );
}

/** A sponsor logo token: a strip's, the weekend's or a player sponsor's. */
const SPONSOR_LOGO_TOKEN = /^(?:(?:weekend)?[Ss]ponsor\d+|playerSponsor\d*Logo)$/;

/** A fill on the look's ink-on-accent token, near-black for a light club colour. */
const ACCENT_INK_FILL = /^\s*var\(\s*--accent-ink\b/;

/**
 * The plates of drawn sponsor logos that are drawn light (dev retest 6, card
 * 978): a token-free shape filled with `--accent-ink` under or round exactly
 * one sponsor logo that is drawn. A logo is fitted (contained) in its box and
 * keeps its shape, so a dark plate as wide as that box showed a dark bar on
 * each side of a squarish logo (and a dark logo all but vanished on it).
 * Logos are made for a light ground: the plate is drawn light, so the space
 * beside the fitted logo reads as the logo's own ground, as a sponsor tile in
 * a list already does (`SPONSOR_LOGO_PLATE`). A colour a design picked itself
 * (white, a club colour) is kept.
 */
export function sponsorLogoPlates(
  siblings: readonly TemplateLayerV2[],
  boxOf: (layer: TemplateLayerV2) => LayerBox | null,
  filled: (token: string, slot: TemplateLayerV2) => boolean,
  tokensOf: (layer: TemplateLayerV2) => readonly string[],
): Set<TemplateLayerV2> {
  return new Set(sponsorLogoPlateSlots(siblings, boxOf, filled, tokensOf).keys());
}

/**
 * `sponsorLogoPlates`, with the one sponsor logo slot each plate is under, so
 * the plate can hug that logo as drawn (`huggedPlateBox`).
 */
export function sponsorLogoPlateSlots(
  siblings: readonly TemplateLayerV2[],
  boxOf: (layer: TemplateLayerV2) => LayerBox | null,
  filled: (token: string, slot: TemplateLayerV2) => boolean,
  tokensOf: (layer: TemplateLayerV2) => readonly string[],
): Map<TemplateLayerV2, TemplateLayerV2> {
  const plates = new Map<TemplateLayerV2, TemplateLayerV2>();
  const slots = siblings
    .map((layer) => ({ layer, token: imageSlotToken(layer), box: boxOf(layer) }))
    .filter(
      (s): s is { layer: TemplateLayerV2; token: string; box: LayerBox } =>
        !!s.token && !!s.box && areaOf(s.box) > 0,
    );
  if (!slots.some((s) => SPONSOR_LOGO_TOKEN.test(s.token))) return plates;
  for (const layer of siblings) {
    if (layer.kind !== "shape" || tokensOf(layer).length > 0) continue;
    const fill = (layer.style as { fill?: unknown } | undefined)?.fill;
    if (typeof fill !== "string" || !ACCENT_INK_FILL.test(fill)) continue;
    const box = boxOf(layer);
    if (!box || areaOf(box) <= 0) continue;
    const held = slots.filter((s) => holds(box, s.box));
    if (held.length !== 1) continue;
    const slot = held[0]!;
    if (SPONSOR_LOGO_TOKEN.test(slot.token) && filled(slot.token, slot.layer))
      plates.set(layer, slot.layer);
  }
  return plates;
}

/** An image's natural (intrinsic) size in pixels. */
export interface NaturalSize {
  w: number;
  h: number;
}

/**
 * The part of an image that is drawn (its non-transparent pixels), as
 * fractions of its natural size: `{ x: 0, y: 0, w: 1, h: 1 }` is all of it.
 */
export interface DrawnBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a sponsor logo's light plate goes (Ash's decision, retest 7: the plate
 * hugs the logo). A logo is fitted (contained) and centred in its slot and
 * keeps its shape, so a wide or tall logo leaves part of the slot bare, and a
 * plate as big as the slot showed a light band beside it. The plate takes the
 * logo's drawn box instead, plus the padding the design gave it round the slot
 * (how far each plate edge sits outside the slot's), and never grows past the
 * design's plate.
 *
 * `plate` and `slot` are boxes in percent of an artboard `art` pixels in size.
 * `natural` is the logo's natural size; without one (not loaded, not
 * decoded) the plate keeps its box, as before. `drawn`, when known, is the
 * part of the image that isn't transparent, so a logo with clear margins of
 * its own is hugged at its ink.
 */
export function huggedPlateBox(
  plate: LayerBox,
  slot: LayerBox,
  art: NaturalSize,
  natural: NaturalSize | null | undefined,
  drawn?: DrawnBounds | null,
): LayerBox {
  const nw = num(natural?.w);
  const nh = num(natural?.h);
  const sw = (num(slot.w) / 100) * num(art.w);
  const sh = (num(slot.h) / 100) * num(art.h);
  if (!(nw > 0 && nh > 0 && sw > 0 && sh > 0 && num(art.w) > 0 && num(art.h) > 0)) return plate;
  // The logo fitted and centred in its slot, in pixels from the slot's corner.
  const scale = Math.min(sw / nw, sh / nh);
  const fw = nw * scale;
  const fh = nh * scale;
  let left = (sw - fw) / 2;
  let top = (sh - fh) / 2;
  let width = fw;
  let height = fh;
  const t = drawn ? clampBounds(drawn) : null;
  if (t) {
    left += t.x * fw;
    top += t.y * fh;
    width = t.w * fw;
    height = t.h * fh;
  }
  // Back to percent of the artboard.
  const lx = num(slot.x) + (left / num(art.w)) * 100;
  const ly = num(slot.y) + (top / num(art.h)) * 100;
  const lw = (width / num(art.w)) * 100;
  const lh = (height / num(art.h)) * 100;
  // The design's padding round the slot, side by side (none where the plate sits inside it).
  const [px, py, pw, ph] = [num(plate.x), num(plate.y), num(plate.w), num(plate.h)];
  const padL = Math.max(0, num(slot.x) - px);
  const padT = Math.max(0, num(slot.y) - py);
  const padR = Math.max(0, px + pw - (num(slot.x) + num(slot.w)));
  const padB = Math.max(0, py + ph - (num(slot.y) + num(slot.h)));
  const x0 = Math.max(px, lx - padL);
  const y0 = Math.max(py, ly - padT);
  const x1 = Math.min(px + pw, lx + lw + padR);
  const y1 = Math.min(py + ph, ly + lh + padB);
  if (!(x1 - x0 > 0 && y1 - y0 > 0)) return plate;
  return { ...plate, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Drawn bounds inside the image, or null when they aren't a usable box. */
function clampBounds(b: DrawnBounds): DrawnBounds | null {
  const x = Math.min(1, Math.max(0, num(b.x)));
  const y = Math.min(1, Math.max(0, num(b.y)));
  const w = Math.min(1 - x, Math.max(0, num(b.w)));
  const h = Math.min(1 - y, Math.max(0, num(b.h)));
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

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
    const held = slots.filter((s) => holds(box, s.box));
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
