// The layer model behind the card design studio: per-layer visual effects
// (types, presets, pixel treatments), the RenderLayer / EditorLayer shapes,
// and drawLayers — the compositor that runs each layer's draw closure under its
// natural→rect transform, routing effected layers through an offscreen canvas.
import type { CardFontKey } from "./fonts";
import { hexToRgb, rgba } from "./theme";

// --- Per-layer visual effects ------------------------------------------------
// A small, curated set of on-brand treatments any selectable layer can carry.
// Effects are applied by drawLayers AFTER the layer's own draw closure runs, by
// compositing the layer through an offscreen canvas — so they never touch the
// layer's data binding and an un-effected layer stays on the pixel-identical
// fast path. All colours come from the club palette; intensities are 0-1.
export type LayerTone = "bw" | "duotone";
export type LayerMask = "rounded" | "circle" | "feather";
export type LayerGradientDir = "top" | "bottom" | "left" | "right";

export type LayerEffects = {
  // Colour grade: black & white, or a two-tone wash in a club colour.
  tone?: LayerTone;
  toneColor?: string; // duotone hue (palette); ignored for "bw"
  toneIntensity?: number; // 0-1 blend from original to graded
  // Photo mask shape clipped onto the layer content.
  mask?: LayerMask;
  maskRadius?: number; // rounded: corner as fraction of min(w,h); feather: softness 0-1
  // Linear gradient overlay fading from a colour to transparent.
  gradient?: boolean;
  gradientColor?: string;
  gradientIntensity?: number; // 0-1 max opacity
  gradientDir?: LayerGradientDir;
  // Drop shadow cast by the layer's silhouette.
  shadow?: boolean;
  shadowColor?: string;
  shadowIntensity?: number; // 0-1 → blur + offset + opacity
  // Solid border following the mask shape (or the layer rect when unmasked).
  border?: boolean;
  borderColor?: string;
  borderWidth?: number; // fraction of the 1080 base width
  // Whole-layer transparency. Absent or 1 = fully opaque (fast path);
  // below 1 multiplies the entire layer's alpha in every render path.
  opacity?: number; // 0-1
};

// True when an effects object actually requests at least one treatment. Keeps
// un-effected layers off the offscreen compositing path (pixel-identical). A
// sub-1 opacity also counts so a partly-transparent layer composites correctly.
export const hasLayerEffects = (fx?: LayerEffects | null): boolean =>
  !!fx &&
  (!!fx.tone ||
    !!fx.mask ||
    !!fx.gradient ||
    !!fx.shadow ||
    !!fx.border ||
    (typeof fx.opacity === "number" && fx.opacity < 1));

export const DEFAULT_LAYER_EFFECTS: LayerEffects = {
  toneColor: "#FBAC27",
  toneIntensity: 1,
  maskRadius: 0.18,
  gradientColor: "#1A1A1A",
  gradientIntensity: 0.55,
  gradientDir: "bottom",
  shadowColor: "#1A1A1A",
  shadowIntensity: 0.5,
  borderColor: "#FBAC27",
  borderWidth: 0.006,
};

// A named, reusable bundle of layer effects. Built-in presets ship with the app
// (negative ids so they never collide with saved rows); admin-saved presets come
// from the card_effect_presets table.
export type EffectPreset = {
  id: number;
  name: string;
  effects: LayerEffects;
  builtIn?: boolean;
};

// Curated on-brand presets that ship by default. Each is a full LayerEffects
// bundle an admin can apply to any layer in one click.
export const BUILTIN_EFFECT_PRESETS: EffectPreset[] = [
  {
    id: -1,
    name: "Duotone hero",
    builtIn: true,
    effects: {
      tone: "duotone",
      toneColor: "#FBAC27",
      toneIntensity: 0.85,
      gradient: true,
      gradientColor: "#1A1A1A",
      gradientIntensity: 0.55,
      gradientDir: "bottom",
    },
  },
  {
    id: -2,
    name: "Soft feather portrait",
    builtIn: true,
    effects: {
      mask: "feather",
      maskRadius: 0.35,
      shadow: true,
      shadowColor: "#1A1A1A",
      shadowIntensity: 0.45,
    },
  },
  {
    id: -3,
    name: "Gold border tile",
    builtIn: true,
    effects: {
      mask: "rounded",
      maskRadius: 0.12,
      border: true,
      borderColor: "#FBAC27",
      borderWidth: 0.008,
      shadow: true,
      shadowColor: "#1A1A1A",
      shadowIntensity: 0.4,
    },
  },
  {
    id: -4,
    name: "Black & white classic",
    builtIn: true,
    effects: {
      tone: "bw",
      toneIntensity: 1,
    },
  },
  {
    id: -5,
    name: "Circle headshot",
    builtIn: true,
    effects: {
      mask: "circle",
      border: true,
      borderColor: "#FBAC27",
      borderWidth: 0.006,
    },
  },
];

// ===========================================================================
// Layer model (card design studio)
// ---------------------------------------------------------------------------
// The standard card body (everything except the matchSummary + custom-template
// paths) is expressed as an ordered list of layers. Each built-in layer carries
// a `draw` closure that runs the EXACT original draw statements at its NATURAL
// pixel coordinates; `drawLayers` then applies a translate+scale transform that
// maps the natural rect onto the (possibly customised) rect. With no saved
// layout, rect === natural, so the transform is the identity and the output is
// pixel-identical to the pre-studio renderer. Custom (image/sticker/text) layers
// draw directly within their rect instead.
// All rects are kept in PIXELS at the chosen size; normalisation to fractions of
// the 1080 base width happens at the persistence boundary (computeCardLayers /
// applyLayout) so the same saved layout reproduces across square/portrait/story.
// ===========================================================================

export type PxRect = { x: number; y: number; w: number; h: number };

export type RenderLayer = {
  id: string;
  editKind: "element" | "image" | "sticker" | "text" | "libsticker";
  label: string;
  natural: PxRect;
  rect: PxRect;
  vAnchor: "top" | "bottom";
  z: number;
  hidden: boolean;
  selectable: boolean;
  resizable: boolean;
  // true: draw at natural coords, drawLayers supplies the natural→rect transform
  // (built-in chrome/body). false: draw directly within rect (custom layers).
  drawsAtNatural: boolean;
  // Present only on the built-in headshot photo layer: mutable focal/zoom the
  // editor can override (applyLayout writes saved values here). Defaults to a
  // centred, un-zoomed crop so un-customised photos stay pixel-identical.
  photoTransform?: { focalX: number; focalY: number; zoom: number };
  // Numeric value layers (stat tiles, big serif figures) set `numeric` and a
  // synchronous `drawCount` so the "countUp" animation can re-render them live
  // each frame with a scaled value. drawCount(1) MUST match draw() exactly so
  // the rest frame is identical. Non-numeric layers omit both (count-up fades).
  numeric?: boolean;
  drawCount?: (ctx: CanvasRenderingContext2D, frac: number) => void;
  // Optional per-layer visual effects (applyLayout / buildCustomLayer fill these
  // from the saved layout). Absent/empty → the layer stays on the fast path.
  effects?: LayerEffects;
  draw: (ctx: CanvasRenderingContext2D) => void | Promise<void>;
};

// A normalised, serialisable view of a layer for the editor + persistence. x/y/w/h
// and fontSize are fractions of the 1080 base width; y is measured from the top
// (vAnchor "top") or the bottom (vAnchor "bottom") edge.
export type EditorLayer = {
  id: string;
  editKind: "element" | "image" | "sticker" | "text" | "libsticker";
  label: string;
  selectable: boolean;
  resizable: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  vAnchor: "top" | "bottom";
  z: number;
  hidden: boolean;
  url?: string;
  shape?: "rect" | "circle" | "line";
  fit?: "cover" | "contain";
  focalX?: number;
  focalY?: number;
  zoom?: number;
  color?: string;
  radius?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  fontFamily?: CardFontKey;
  uppercase?: boolean;
  // libsticker layers: which catalog asset, and (for data-bound badges) which
  // card field auto-fills the text slot.
  assetId?: string;
  field?: string;
  effects?: LayerEffects;
};

// Apply a built-in layer's natural→rect transform to the context (identity when
// rect === natural). Shared by the still renderer and the animation baker so a
// baked layer lands in exactly the same pixels as the static draw.
export const applyLayerTransform = (ctx: CanvasRenderingContext2D, l: RenderLayer) => {
  if (l.drawsAtNatural && l.natural.w > 0 && l.natural.h > 0) {
    const sx = l.rect.w / l.natural.w;
    const sy = l.rect.h / l.natural.h;
    ctx.translate(l.rect.x, l.rect.y);
    ctx.scale(sx, sy);
    ctx.translate(-l.natural.x, -l.natural.y);
  }
};

// Apply the natural→rect transform a built-in layer expects, then run its draw.
export const drawLayerContent = async (ctx: CanvasRenderingContext2D, l: RenderLayer) => {
  ctx.save();
  applyLayerTransform(ctx, l);
  try {
    await l.draw(ctx);
  } catch (err) {
    // A single layer failing to draw (bad saved coordinates, a NaN stat value,
    // a font-fitting edge case) shouldn't blank the whole card — but silently
    // dropping it with no trace makes a card missing an element undiagnosable.
    console.error(`[share-card] layer "${l.id}" (${l.label}) failed to draw`, err);
  }
  ctx.restore();
};

// Mix a hex colour toward an [r,g,b] target by amount (0-1).
const mixToward = (hex: string, target: [number, number, number], amt: number): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex);
  return [
    Math.round(r + (target[0] - r) * amt),
    Math.round(g + (target[1] - g) * amt),
    Math.round(b + (target[2] - b) * amt),
  ];
};

// Re-grade the pixels inside `rect` of an offscreen canvas to black & white or a
// two-tone wash, blended back toward the original by intensity. Alpha (and thus
// any mask/transparent area) is preserved untouched. Tainted canvases throw on
// getImageData — we swallow that and leave the layer ungraded.
const applyToneToCanvas = (
  cv: HTMLCanvasElement,
  rect: PxRect,
  tone: LayerTone,
  color: string,
  intensity: number,
) => {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(cv.width - x, Math.ceil(rect.w + (rect.x - x)));
  const h = Math.min(cv.height - y, Math.ceil(rect.h + (rect.y - y)));
  if (w <= 0 || h <= 0) return;
  const k = Math.max(0, Math.min(1, intensity));
  const [loR, loG, loB] = mixToward(color, [0, 0, 0], 0.5);
  const [hiR, hiG, hiB] = mixToward(color, [255, 255, 255], 0.6);
  let data: ImageData;
  try {
    data = ctx.getImageData(x, y, w, h);
  } catch {
    return;
  }
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    let gr: number, gg: number, gb: number;
    if (tone === "bw") {
      const v = lum * 255;
      gr = v;
      gg = v;
      gb = v;
    } else {
      gr = loR + (hiR - loR) * lum;
      gg = loG + (hiG - loG) * lum;
      gb = loB + (hiB - loB) * lum;
    }
    d[i] = d[i] + (gr - d[i]) * k;
    d[i + 1] = d[i + 1] + (gg - d[i + 1]) * k;
    d[i + 2] = d[i + 2] + (gb - d[i + 2]) * k;
  }
  ctx.putImageData(data, x, y);
};

// Trace the mask outline (or the plain rect when unmasked) into the current
// path so it can be used for clipping or stroking. Feather falls back to an
// ellipse outline for clip/stroke purposes.
const traceLayerShape = (
  ctx: CanvasRenderingContext2D,
  rect: PxRect,
  mask: LayerMask | undefined,
  maskRadius: number,
) => {
  const { x, y, w, h } = rect;
  ctx.beginPath();
  if (mask === "circle") {
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  } else if (mask === "feather") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (mask === "rounded") {
    const rad = Math.max(0, Math.min(0.5, maskRadius)) * Math.min(w, h);
    ctx.roundRect(x, y, w, h, rad);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.closePath();
};

// Clip an offscreen layer canvas to the mask shape via destination-in. Feather
// uses a radial gradient so the layer edges fade out softly.
const applyMaskToCanvas = (
  cv: HTMLCanvasElement,
  rect: PxRect,
  mask: LayerMask,
  maskRadius: number,
) => {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  if (mask === "feather") {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const rad = Math.max(rect.w, rect.h) / 2;
    const soft = Math.max(0, Math.min(0.95, maskRadius));
    const g = ctx.createRadialGradient(cx, cy, rad * (1 - soft), cx, cy, rad);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    // Scale the radial circle into the rect's aspect so it feathers as an oval.
    ctx.translate(cx, cy);
    ctx.scale(rect.w / Math.max(rect.w, rect.h), rect.h / Math.max(rect.w, rect.h));
    ctx.translate(-cx, -cy);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else {
    ctx.fillStyle = "#000";
    traceLayerShape(ctx, rect, mask, maskRadius);
    ctx.fill();
  }
  ctx.restore();
};

// Overlay a linear gradient (colour → transparent) across the layer rect,
// clipped to the mask shape so it hugs the layer.
const drawGradientOverlay = (
  ctx: CanvasRenderingContext2D,
  rect: PxRect,
  fx: LayerEffects,
) => {
  const { x, y, w, h } = rect;
  const dir = fx.gradientDir ?? "bottom";
  const alpha = Math.max(0, Math.min(1, fx.gradientIntensity ?? 0.55));
  const color = fx.gradientColor || "#1A1A1A";
  let g: CanvasGradient;
  if (dir === "top") g = ctx.createLinearGradient(0, y, 0, y + h);
  else if (dir === "bottom") g = ctx.createLinearGradient(0, y + h, 0, y);
  else if (dir === "left") g = ctx.createLinearGradient(x, 0, x + w, 0);
  else g = ctx.createLinearGradient(x + w, 0, x, 0);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  traceLayerShape(ctx, rect, fx.mask, fx.maskRadius ?? 0.18);
  ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
};

// Stroke a border following the mask shape (or the rect when unmasked).
const drawLayerBorder = (
  ctx: CanvasRenderingContext2D,
  rect: PxRect,
  fx: LayerEffects,
) => {
  const lw = Math.max(0, (fx.borderWidth ?? 0.006) * 1080);
  if (lw <= 0) return;
  ctx.save();
  ctx.strokeStyle = fx.borderColor || "#FBAC27";
  ctx.lineWidth = lw;
  traceLayerShape(ctx, rect, fx.mask, fx.maskRadius ?? 0.18);
  ctx.stroke();
  ctx.restore();
};

// Composite a single effected layer onto `ctx`: render it in isolation to a
// W×H offscreen canvas, grade/mask its pixels, draw it back (with an optional
// drop shadow), then paint the gradient overlay + border on top. Shared by the
// still renderer (drawLayers) and the animation baker (bakeLayer) so effects —
// including a duotone/feather treatment on the full-bleed feature photo — render
// identically in PNG export and video export. Falls back to a plain draw if the
// offscreen context can't be created.
export const drawEffectedLayer = async (
  ctx: CanvasRenderingContext2D,
  l: RenderLayer,
  W: number,
  H: number,
) => {
  const fx = l.effects!;
  const alpha = Math.max(0, Math.min(1, fx.opacity ?? 1));
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const octx = off.getContext("2d");
  if (!octx) {
    ctx.save();
    ctx.globalAlpha = alpha;
    await drawLayerContent(ctx, l);
    ctx.restore();
    return;
  }
  await drawLayerContent(octx, l);
  const rect = l.rect;
  if (fx.tone) {
    applyToneToCanvas(off, rect, fx.tone, fx.toneColor || "#FBAC27", fx.toneIntensity ?? 1);
  }
  if (fx.mask) {
    applyMaskToCanvas(off, rect, fx.mask, fx.maskRadius ?? 0.18);
  }
  // When the layer is partly transparent, bake its gradient + border into the
  // offscreen first so the WHOLE layer (content + overlays) fades uniformly
  // under one alpha. Fully-opaque layers keep the original main-ctx draw order,
  // so their pixels are byte-identical to before.
  const fade = alpha < 1;
  if (fade) {
    if (fx.gradient) drawGradientOverlay(octx, rect, fx);
    if (fx.border) drawLayerBorder(octx, rect, fx);
  }
  ctx.save();
  if (fade) ctx.globalAlpha = alpha;
  if (fx.shadow) {
    const k = Math.max(0, Math.min(1, fx.shadowIntensity ?? 0.5));
    ctx.shadowColor = rgba(fx.shadowColor || "#1A1A1A", 0.25 + k * 0.55);
    ctx.shadowBlur = k * 48;
    ctx.shadowOffsetY = k * 14;
  }
  ctx.drawImage(off, 0, 0);
  ctx.restore();
  if (!fade) {
    if (fx.gradient) drawGradientOverlay(ctx, rect, fx);
    if (fx.border) drawLayerBorder(ctx, rect, fx);
  }
};

export const drawLayers = async (ctx: CanvasRenderingContext2D, layers: RenderLayer[]) => {
  const ordered = [...layers].sort((a, b) => a.z - b.z);
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  for (const l of ordered) {
    if (l.hidden) continue;
    // Fast path: no effects → draw straight onto the main ctx (pixel-identical).
    if (!hasLayerEffects(l.effects)) {
      await drawLayerContent(ctx, l);
      continue;
    }
    await drawEffectedLayer(ctx, l, W, H);
  }
};
