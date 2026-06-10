import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Star,
  Trophy,
  Medal,
  Crown,
  Award,
  Shield,
  Sparkles,
  Flame,
  Zap,
  Target,
  Heart,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";

// ===========================================================================
// Built-in sticker / clip-art library (card design studio)
// ---------------------------------------------------------------------------
// A curated, properly-licensed set of clip-art the admin can drop onto a card.
// Every asset is authored here: icons come from lucide-react (ISC licence,
// already a dependency); shapes, frames, cricket motifs and data-bound badges
// are drawn with canvas primitives. There are NO external/third-party art
// downloads, so licensing is clean.
//
// Each asset exposes a single `draw(ctx, x, y, w, h, opts)` used by BOTH the
// picker thumbnails and the card renderer, guaranteeing the preview matches the
// PNG/video export across all three sizes (every size goes through the same
// pixel draw, scaled by its rect).
// ===========================================================================

export type StickerCategory = "icons" | "shapes" | "frames" | "badges" | "cricket";

export const STICKER_CATEGORIES: { id: StickerCategory; label: string }[] = [
  { id: "badges", label: "Badges" },
  { id: "cricket", label: "Cricket" },
  { id: "icons", label: "Icons" },
  { id: "shapes", label: "Shapes" },
  { id: "frames", label: "Frames" },
];

export type StickerDrawOpts = {
  // Primary tint (a club-palette colour). Assets recolour to this where sensible.
  color: string;
  // Resolved label/value for data-bound badges (already field-resolved upstream).
  text?: string;
};

export type StickerAsset = {
  id: string;
  name: string;
  category: StickerCategory;
  keywords: string[];
  // Whether the recolour control is shown (all current assets recolour).
  recolourable: boolean;
  // Data-bound badges carry a text slot that auto-fills from a card field.
  dataBound: boolean;
  // Suggested field key to pre-bind when the card kind exposes it.
  defaultField?: string;
  // Fallback text when no field is bound / the field is empty.
  defaultText?: string;
  // Preferred width/height ratio for the initial drop placement.
  aspect: number;
  draw: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: StickerDrawOpts,
  ) => void | Promise<void>;
};

const CARD_FONT = "'Montserrat', sans-serif";
const GOLD = "#FBAC27";
const CREAM = "#F5F2E8";
const INK = "#1A1A1A";

// --- Colour helpers ---------------------------------------------------------

const hexToRgb = (hex: string): [number, number, number] => {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [251, 172, 39];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgba = (hex: string, a: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// A readable text/detail colour for content sitting on a `fill`-coloured shape.
const contrastInk = (fill: string): string => {
  const [r, g, b] = hexToRgb(fill);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? INK : CREAM;
};

// --- Geometry helpers -------------------------------------------------------

const roundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
};

// Fit `text` to a single line within maxW, shrinking from maxPx down to minPx.
const fitFont = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxPx: number,
  weight: number,
  minPx = 10,
): number => {
  let px = maxPx;
  while (px > minPx) {
    ctx.font = `${weight} ${px}px ${CARD_FONT}`;
    if (ctx.measureText(text).width <= maxW) break;
    px -= 1;
  }
  return px;
};

const drawStarburst = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  points: number,
) => {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
};

const regularPolygonPath = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  sides: number,
  rotation: number,
) => {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (Math.PI * 2 * i) / sides;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
};

// Shield outline path (badge silhouette), centred in the rect.
const shieldPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const r = w * 0.18;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h * 0.55);
  ctx.quadraticCurveTo(x + w, y + h * 0.8, x + w / 2, y + h);
  ctx.quadraticCurveTo(x, y + h * 0.8, x, y + h * 0.55);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

// --- Lucide icon rasterisation (cached per id+colour) -----------------------

const ICON_CACHE = new Map<string, Promise<HTMLImageElement>>();

const loadIconImage = (
  Icon: LucideIcon,
  id: string,
  color: string,
): Promise<HTMLImageElement> => {
  const key = `${id}:${color}`;
  const cached = ICON_CACHE.get(key);
  if (cached) return cached;
  const svg = renderToStaticMarkup(
    createElement(Icon, {
      color,
      size: 256,
      strokeWidth: 1.75,
      absoluteStrokeWidth: true,
    }) as React.ReactElement,
  );
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
  ICON_CACHE.set(key, p);
  return p;
};

const drawContain = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const ir = img.width / img.height;
  const rr = w / h;
  let dw = w;
  let dh = h;
  if (ir > rr) dh = w / ir;
  else dw = h * ir;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
};

const iconAsset = (
  id: string,
  name: string,
  Icon: LucideIcon,
  keywords: string[],
): StickerAsset => ({
  id,
  name,
  category: "icons",
  keywords,
  recolourable: true,
  dataBound: false,
  aspect: 1,
  draw: async (ctx, x, y, w, h, opts) => {
    const img = await loadIconImage(Icon, id, opts.color || GOLD);
    drawContain(ctx, img, x, y, w, h);
  },
});

// ===========================================================================
// Catalog
// ===========================================================================

const ICONS: StickerAsset[] = [
  iconAsset("icon-star", "Star", Star, ["star", "favourite", "best"]),
  iconAsset("icon-trophy", "Trophy", Trophy, ["trophy", "winner", "champion", "cup"]),
  iconAsset("icon-medal", "Medal", Medal, ["medal", "award", "place"]),
  iconAsset("icon-crown", "Crown", Crown, ["crown", "king", "champion", "best"]),
  iconAsset("icon-award", "Award", Award, ["award", "rosette", "prize"]),
  iconAsset("icon-shield", "Shield", Shield, ["shield", "defence", "crest"]),
  iconAsset("icon-sparkles", "Sparkles", Sparkles, ["sparkle", "shine", "new", "star"]),
  iconAsset("icon-flame", "Flame", Flame, ["flame", "fire", "hot", "streak", "hattrick"]),
  iconAsset("icon-zap", "Lightning", Zap, ["lightning", "zap", "fast", "power"]),
  iconAsset("icon-target", "Target", Target, ["target", "aim", "bullseye"]),
  iconAsset("icon-heart", "Heart", Heart, ["heart", "love", "fan"]),
  iconAsset("icon-check", "Verified", BadgeCheck, ["check", "verified", "tick", "approved"]),
];

const CRICKET: StickerAsset[] = [
  {
    id: "cricket-ball",
    name: "Cricket ball",
    category: "cricket",
    keywords: ["ball", "cricket", "seam", "red ball"],
    recolourable: true,
    dataBound: false,
    aspect: 1,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || "#9B2D20";
      const r = Math.min(w, h) / 2;
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // subtle highlight
      ctx.fillStyle = rgba("#FFFFFF", 0.16);
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.32, cy - r * 0.34, r * 0.4, r * 0.26, -0.6, 0, Math.PI * 2);
      ctx.fill();
      // seam + stitches
      const seam = contrastInk(color);
      ctx.strokeStyle = seam;
      ctx.lineWidth = Math.max(2, r * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, r * 0.04);
      for (let i = -3; i <= 3; i++) {
        const yy = cy + (i / 3) * r * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.12, yy);
        ctx.lineTo(cx + r * 0.12, yy);
        ctx.stroke();
      }
    },
  },
  {
    id: "cricket-stumps",
    name: "Stumps",
    category: "cricket",
    keywords: ["stumps", "wicket", "bails", "cricket"],
    recolourable: true,
    dataBound: false,
    aspect: 0.85,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || GOLD;
      ctx.fillStyle = color;
      const stumpW = w * 0.13;
      const top = y + h * 0.14;
      const bottom = y + h;
      const gap = (w - stumpW * 3) / 2;
      const xs = [x, x + stumpW + gap, x + (stumpW + gap) * 2];
      for (const sx of xs) {
        roundRectPath(ctx, sx, top, stumpW, bottom - top, stumpW / 2);
        ctx.fill();
      }
      // bails
      const bailH = h * 0.05;
      const bailW = (xs[1] - xs[0]) * 0.92;
      ctx.fillRect(xs[0] + stumpW / 2, y + h * 0.1, bailW, bailH);
      ctx.fillRect(xs[1] + stumpW / 2, y + h * 0.1, bailW, bailH);
    },
  },
  {
    id: "cricket-bat",
    name: "Cricket bat",
    category: "cricket",
    keywords: ["bat", "willow", "cricket", "batting"],
    recolourable: true,
    dataBound: false,
    aspect: 0.42,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || "#D9A441";
      const cx = x + w / 2;
      const handleW = w * 0.26;
      const handleH = h * 0.34;
      const detail = contrastInk(color);
      // handle
      ctx.fillStyle = detail;
      roundRectPath(ctx, cx - handleW / 2, y, handleW, handleH, handleW / 2);
      ctx.fill();
      // splice + blade
      ctx.fillStyle = color;
      const bladeTop = y + handleH * 0.82;
      const bladeW = w * 0.62;
      roundRectPath(ctx, cx - bladeW / 2, bladeTop, bladeW, y + h - bladeTop, bladeW * 0.18);
      ctx.fill();
      // splice triangle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - handleW * 0.4, y + handleH * 0.5);
      ctx.lineTo(cx + handleW * 0.4, y + handleH * 0.5);
      ctx.lineTo(cx, bladeTop + h * 0.06);
      ctx.closePath();
      ctx.fill();
      // centre ridge
      ctx.strokeStyle = rgba(detail, 0.45);
      ctx.lineWidth = Math.max(1.5, w * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx, bladeTop + h * 0.04);
      ctx.lineTo(cx, y + h - h * 0.04);
      ctx.stroke();
    },
  },
  {
    id: "cricket-helmet",
    name: "Batting helmet",
    category: "cricket",
    keywords: ["helmet", "batting", "protection", "cricket"],
    recolourable: true,
    dataBound: false,
    aspect: 1.05,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || GOLD;
      const cx = x + w / 2;
      const cy = y + h * 0.5;
      const r = w * 0.42;
      // dome
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.lineTo(cx + r, cy + h * 0.06);
      ctx.lineTo(cx - r, cy + h * 0.06);
      ctx.closePath();
      ctx.fill();
      // peak
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - h * 0.02);
      ctx.lineTo(cx - r - w * 0.12, cy + h * 0.08);
      ctx.lineTo(cx - r * 0.2, cy + h * 0.06);
      ctx.closePath();
      ctx.fill();
      // grille
      const detail = contrastInk(color);
      ctx.fillStyle = detail;
      roundRectPath(ctx, cx - r, cy + h * 0.06, r * 1.5, h * 0.12, h * 0.04);
      ctx.fill();
      ctx.strokeStyle = rgba(detail, 0.7);
      ctx.lineWidth = Math.max(1.5, w * 0.018);
      for (let i = 1; i <= 3; i++) {
        const gy = cy + h * 0.06 + (h * 0.12 * i) / 4;
        ctx.beginPath();
        ctx.moveTo(cx - r, gy);
        ctx.lineTo(cx + r * 0.5, gy);
        ctx.stroke();
      }
    },
  },
];

const SHAPES: StickerAsset[] = [
  {
    id: "shape-circle",
    name: "Circle",
    category: "shapes",
    keywords: ["circle", "dot", "round"],
    recolourable: true,
    dataBound: false,
    aspect: 1,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.fillStyle = opts.color || GOLD;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: "shape-rounded",
    name: "Rounded box",
    category: "shapes",
    keywords: ["rectangle", "box", "panel", "rounded"],
    recolourable: true,
    dataBound: false,
    aspect: 1.6,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.fillStyle = opts.color || GOLD;
      roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.16);
      ctx.fill();
    },
  },
  {
    id: "shape-pill",
    name: "Pill",
    category: "shapes",
    keywords: ["pill", "capsule", "tag", "chip"],
    recolourable: true,
    dataBound: false,
    aspect: 2.6,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.fillStyle = opts.color || GOLD;
      roundRectPath(ctx, x, y, w, h, h / 2);
      ctx.fill();
    },
  },
  {
    id: "shape-starburst",
    name: "Starburst",
    category: "shapes",
    keywords: ["burst", "seal", "star", "spike", "sale"],
    recolourable: true,
    dataBound: false,
    aspect: 1,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.fillStyle = opts.color || GOLD;
      const r = Math.min(w, h) / 2;
      drawStarburst(ctx, x + w / 2, y + h / 2, r, r * 0.74, 16);
      ctx.fill();
    },
  },
  {
    id: "shape-banner",
    name: "Banner",
    category: "shapes",
    keywords: ["banner", "ribbon", "flag", "strip"],
    recolourable: true,
    dataBound: false,
    aspect: 3.4,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.fillStyle = opts.color || GOLD;
      const notch = h * 0.42;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - notch, y + h / 2);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + notch, y + h / 2);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: "shape-chevron",
    name: "Chevron",
    category: "shapes",
    keywords: ["chevron", "arrow", "point"],
    recolourable: true,
    dataBound: false,
    aspect: 1.5,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.fillStyle = opts.color || GOLD;
      const t = h * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.5, y + h - t);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + t);
      ctx.lineTo(x + w * 0.5, y + h);
      ctx.lineTo(x, y + t);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: "shape-hexagon",
    name: "Hexagon",
    category: "shapes",
    keywords: ["hexagon", "hex", "polygon"],
    recolourable: true,
    dataBound: false,
    aspect: 1,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.fillStyle = opts.color || GOLD;
      regularPolygonPath(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2, 6, -Math.PI / 2);
      ctx.fill();
    },
  },
  {
    id: "shape-triangle",
    name: "Triangle",
    category: "shapes",
    keywords: ["triangle", "wedge", "point"],
    recolourable: true,
    dataBound: false,
    aspect: 1.15,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.fillStyle = opts.color || GOLD;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill();
    },
  },
];

const FRAMES: StickerAsset[] = [
  {
    id: "frame-corners",
    name: "Corner brackets",
    category: "frames",
    keywords: ["corner", "brackets", "frame", "marker"],
    recolourable: true,
    dataBound: false,
    aspect: 1,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.strokeStyle = opts.color || GOLD;
      ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.04);
      const len = Math.min(w, h) * 0.28;
      const o = ctx.lineWidth / 2;
      const corners: [number, number, number, number][] = [
        [x + o, y + o + len, x + o, y + o],
        [x + o, y + o, x + o + len, y + o],
        [x + w - o - len, y + o, x + w - o, y + o],
        [x + w - o, y + o, x + w - o, y + o + len],
        [x + w - o, y + h - o - len, x + w - o, y + h - o],
        [x + w - o, y + h - o, x + w - o - len, y + h - o],
        [x + o + len, y + h - o, x + o, y + h - o],
        [x + o, y + h - o, x + o, y + h - o - len],
      ];
      ctx.beginPath();
      for (let i = 0; i < corners.length; i += 2) {
        ctx.moveTo(corners[i][0], corners[i][1]);
        ctx.lineTo(corners[i][2], corners[i][3]);
        ctx.lineTo(corners[i + 1][2], corners[i + 1][3]);
      }
      ctx.stroke();
    },
  },
  {
    id: "frame-double",
    name: "Double border",
    category: "frames",
    keywords: ["border", "double", "frame", "outline"],
    recolourable: true,
    dataBound: false,
    aspect: 1,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.strokeStyle = opts.color || GOLD;
      const lw = Math.max(2, Math.min(w, h) * 0.02);
      ctx.lineWidth = lw;
      ctx.strokeRect(x + lw, y + lw, w - lw * 2, h - lw * 2);
      const gap = Math.min(w, h) * 0.05;
      ctx.lineWidth = Math.max(1.5, lw * 0.6);
      ctx.strokeRect(x + lw + gap, y + lw + gap, w - (lw + gap) * 2, h - (lw + gap) * 2);
    },
  },
  {
    id: "frame-rounded",
    name: "Rounded frame",
    category: "frames",
    keywords: ["frame", "rounded", "outline", "border"],
    recolourable: true,
    dataBound: false,
    aspect: 1,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.strokeStyle = opts.color || GOLD;
      const lw = Math.max(3, Math.min(w, h) * 0.03);
      ctx.lineWidth = lw;
      roundRectPath(ctx, x + lw, y + lw, w - lw * 2, h - lw * 2, Math.min(w, h) * 0.12);
      ctx.stroke();
    },
  },
  {
    id: "frame-ticket",
    name: "Ticket",
    category: "frames",
    keywords: ["ticket", "frame", "notch", "stub"],
    recolourable: true,
    dataBound: false,
    aspect: 1.5,
    draw: (ctx, x, y, w, h, opts) => {
      ctx.strokeStyle = opts.color || GOLD;
      const lw = Math.max(2.5, Math.min(w, h) * 0.025);
      ctx.lineWidth = lw;
      const r = Math.min(w, h) * 0.16;
      const cx = x + w / 2;
      ctx.beginPath();
      ctx.moveTo(x + lw, y + lw);
      ctx.lineTo(x + w - lw, y + lw);
      ctx.lineTo(x + w - lw, y + h - lw);
      ctx.lineTo(x + lw, y + h - lw);
      ctx.closePath();
      ctx.stroke();
      // perforation notches mid-edges
      ctx.beginPath();
      ctx.arc(cx, y + lw, r, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, y + h - lw, r, Math.PI, Math.PI * 2);
      ctx.stroke();
    },
  },
];

// --- Data-bound badges ------------------------------------------------------
// These combine recolourable art with a text slot that auto-fills from a card
// data field (resolved upstream and passed in as opts.text). When no field is
// bound, defaultText is used so the badge always reads sensibly.

const BADGES: StickerAsset[] = [
  {
    id: "badge-season-ribbon",
    name: "Season ribbon",
    category: "badges",
    keywords: ["season", "ribbon", "banner", "year", "label"],
    recolourable: true,
    dataBound: true,
    defaultField: "season",
    defaultText: "2024/25",
    aspect: 3,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || GOLD;
      const ink = contrastInk(color);
      const notch = h * 0.4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - notch, y + h / 2);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + notch, y + h / 2);
      ctx.closePath();
      ctx.fill();
      const text = (opts.text || "").toUpperCase();
      if (!text) return;
      const px = fitFont(ctx, text, w - notch * 2.2, h * 0.5, 800);
      ctx.fillStyle = ink;
      ctx.font = `800 ${px}px ${CARD_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + w / 2, y + h / 2 + h * 0.02);
    },
  },
  {
    id: "badge-stat-chip",
    name: "Stat chip",
    category: "badges",
    keywords: ["stat", "chip", "value", "pill", "number"],
    recolourable: true,
    dataBound: true,
    defaultField: "value",
    defaultText: "100",
    aspect: 2.2,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || GOLD;
      const ink = contrastInk(color);
      ctx.fillStyle = color;
      roundRectPath(ctx, x, y, w, h, h / 2);
      ctx.fill();
      const text = opts.text || "";
      if (!text) return;
      const px = fitFont(ctx, text, w * 0.82, h * 0.6, 800);
      ctx.fillStyle = ink;
      ctx.font = `800 ${px}px ${CARD_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + w / 2, y + h / 2 + h * 0.02);
    },
  },
  {
    id: "badge-potm",
    name: "Player of the match",
    category: "badges",
    keywords: ["potm", "player of the match", "rosette", "mvp", "best"],
    recolourable: true,
    dataBound: true,
    defaultField: "mom",
    defaultText: "PLAYER OF THE MATCH",
    aspect: 0.82,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || GOLD;
      const ink = contrastInk(color);
      const cx = x + w / 2;
      const sealR = w * 0.5;
      const cy = y + sealR;
      // ribbon tails
      ctx.fillStyle = rgba(color, 0.85);
      ctx.beginPath();
      ctx.moveTo(cx - sealR * 0.45, cy + sealR * 0.5);
      ctx.lineTo(cx - sealR * 0.18, y + h);
      ctx.lineTo(cx, y + h - sealR * 0.35);
      ctx.lineTo(cx + sealR * 0.18, y + h);
      ctx.lineTo(cx + sealR * 0.45, cy + sealR * 0.5);
      ctx.closePath();
      ctx.fill();
      // seal
      ctx.fillStyle = color;
      drawStarburst(ctx, cx, cy, sealR, sealR * 0.86, 22);
      ctx.fill();
      ctx.fillStyle = rgba(ink, 0.9);
      ctx.beginPath();
      ctx.arc(cx, cy, sealR * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, sealR * 0.6, 0, Math.PI * 2);
      ctx.fill();
      const text = (opts.text || "").toUpperCase();
      if (!text) return;
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const words = text.split(/\s+/);
      // keep to <=3 lines inside the seal
      const lines: string[] = [];
      let cur = "";
      const maxW = sealR * 1.0;
      const px0 = sealR * 0.34;
      ctx.font = `800 ${px0}px ${CARD_FONT}`;
      for (const word of words) {
        const cand = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(cand).width > maxW && cur) {
          lines.push(cur);
          cur = word;
        } else cur = cand;
      }
      if (cur) lines.push(cur);
      const show = lines.slice(0, 3);
      const px = fitFont(
        ctx,
        show.reduce((a, b) => (a.length > b.length ? a : b), ""),
        maxW,
        px0,
        800,
      );
      ctx.font = `800 ${px}px ${CARD_FONT}`;
      const lineH = px * 1.1;
      show.forEach((ln, i) =>
        ctx.fillText(ln, cx, cy - ((show.length - 1) * lineH) / 2 + i * lineH),
      );
    },
  },
  {
    id: "badge-new-burst",
    name: "New burst",
    category: "badges",
    keywords: ["new", "burst", "seal", "sticker", "flash"],
    recolourable: true,
    dataBound: true,
    defaultText: "NEW",
    aspect: 1,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || GOLD;
      const ink = contrastInk(color);
      const r = Math.min(w, h) / 2;
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.fillStyle = color;
      drawStarburst(ctx, cx, cy, r, r * 0.78, 12);
      ctx.fill();
      const text = (opts.text || "NEW").toUpperCase();
      const px = fitFont(ctx, text, r * 1.4, r * 0.7, 800);
      ctx.fillStyle = ink;
      ctx.font = `800 ${px}px ${CARD_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy);
    },
  },
  {
    id: "badge-cap",
    name: "Cap badge",
    category: "badges",
    keywords: ["cap", "shield", "number", "debut", "crest"],
    recolourable: true,
    dataBound: true,
    defaultField: "capNumber",
    defaultText: "#1",
    aspect: 0.84,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || GOLD;
      const ink = contrastInk(color);
      shieldPath(ctx, x, y, w, h);
      ctx.fillStyle = color;
      ctx.fill();
      shieldPath(ctx, x + w * 0.07, y + h * 0.06, w * 0.86, h * 0.86);
      ctx.lineWidth = Math.max(2, w * 0.02);
      ctx.strokeStyle = rgba(ink, 0.55);
      ctx.stroke();
      const text = (opts.text || "").toUpperCase();
      if (!text) return;
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const labelPx = fitFont(ctx, "CAP", w * 0.6, h * 0.16, 700);
      ctx.font = `700 ${labelPx}px ${CARD_FONT}`;
      ctx.fillText("CAP", x + w / 2, y + h * 0.3);
      const numPx = fitFont(ctx, text, w * 0.7, h * 0.4, 800);
      ctx.font = `800 ${numPx}px ${CARD_FONT}`;
      ctx.fillText(text, x + w / 2, y + h * 0.52);
    },
  },
  {
    id: "badge-award-tab",
    name: "Award tab",
    category: "badges",
    keywords: ["award", "tab", "label", "category", "title"],
    recolourable: true,
    dataBound: true,
    defaultField: "category",
    defaultText: "AWARD",
    aspect: 2.4,
    draw: (ctx, x, y, w, h, opts) => {
      const color = opts.color || GOLD;
      const ink = contrastInk(color);
      const cut = h * 0.34;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + cut, y);
      ctx.lineTo(x + w - cut, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w - cut, y + h);
      ctx.lineTo(x + cut, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      ctx.fill();
      const text = (opts.text || "").toUpperCase();
      if (!text) return;
      const px = fitFont(ctx, text, w - cut * 2.4, h * 0.46, 800);
      ctx.fillStyle = ink;
      ctx.font = `800 ${px}px ${CARD_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + w / 2, y + h / 2 + h * 0.02);
    },
  },
];

export const STICKER_ASSETS: StickerAsset[] = [
  ...BADGES,
  ...CRICKET,
  ...ICONS,
  ...SHAPES,
  ...FRAMES,
];

const BY_ID = new Map(STICKER_ASSETS.map((a) => [a.id, a]));

export const getSticker = (id: string | undefined | null): StickerAsset | undefined =>
  id ? BY_ID.get(id) : undefined;

// Filter the catalog by category + free-text search (name/keywords).
export const searchStickers = (
  category: StickerCategory | "all",
  query: string,
): StickerAsset[] => {
  const q = query.trim().toLowerCase();
  return STICKER_ASSETS.filter((a) => {
    if (category !== "all" && a.category !== category) return false;
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.includes(q))
    );
  });
};

// Render an asset to a standalone data-URL PNG for picker thumbnails. Uses the
// SAME draw path as the card renderer so the thumbnail is faithful.
export const renderStickerThumb = async (
  asset: StickerAsset,
  color: string,
  size = 96,
): Promise<string> => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const pad = size * 0.12;
  const avail = size - pad * 2;
  let w = avail;
  let h = avail;
  if (asset.aspect >= 1) h = avail / asset.aspect;
  else w = avail * asset.aspect;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  await asset.draw(ctx, x, y, w, h, {
    color,
    text: asset.dataBound ? asset.defaultText : undefined,
  });
  return canvas.toDataURL("image/png");
};
