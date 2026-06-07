import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Crown, Trophy, Medal, Award, Star, Shield, Sparkles, type LucideIcon } from "lucide-react";
import logoUrl from "@assets/HHCC_logo_(1)_1779834789645.png";
import type { CardTemplate } from "@workspace/api-client-react";
import {
  resolveTextField,
  resolvePhotoField,
  type TemplateContext,
} from "./card-template";

const TIER_ICONS: LucideIcon[] = [Crown, Trophy, Medal, Award, Star, Shield, Sparkles];

export const SIZES = {
  square: { w: 1080, h: 1080, label: "Feed square", code: "1080x1080" },
  portrait: { w: 1080, h: 1350, label: "Feed portrait", code: "1080x1350" },
  story: { w: 1080, h: 1920, label: "Story / TikTok", code: "1080x1920" },
} as const;

export type CardSize = keyof typeof SIZES;

export type CardSponsor = {
  name: string;
  logoUrl: string;
};

export type StatLine = {
  label: string; // e.g. "Runs"
  value: string | number; // e.g. 1234 or "3/22"
};

// --- Match Summary card shapes ---------------------------------------------
// A self-contained, two-innings scorecard tile. Team colours/logos are carried
// on the card itself (they come from the opposition club brand + the HHCC
// palette) rather than the theme, so the innings blocks render in true team
// colours. Built either from a stored match (via buildScorecard) or by hand.
export type MatchSummaryTeam = {
  name: string;
  shortName?: string | null;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  logoUrl?: string | null;
};

export type MatchSummaryBatter = {
  name: string;
  runs: number;
  balls?: number | null;
  notOut?: boolean;
};

export type MatchSummaryBowler = {
  name: string;
  wickets: number;
  runs: number;
  overs: string;
};

export type MatchSummaryInnings = {
  teamKey: "club" | "opposition";
  inningsNum: 1 | 2;
  totalRuns: string;
  wickets: string;
  overs: string;
  declared?: boolean;
  topBatters: MatchSummaryBatter[];
  topBowlers: MatchSummaryBowler[];
};

export type ShareCardInput =
  | {
      kind: "milestone";
      playerName: string;
      tierLabel: string;
      tierIndex: number;
      milestoneLabel: string;
      currentValue: number;
      threshold?: number | null;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "player";
      playerName: string;
      gradesPlayed?: string | null;
      stats: StatLine[];
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "record";
      title: string;
      playerName: string;
      value: string | number;
      grade?: string | null;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "gradeLeader";
      grade: string;
      category: string; // "Runs" | "Wickets" | ...
      playerName: string;
      value: string | number;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "premiership";
      grade: string;
      year: number; // start year, e.g. 2024 for the 2024/25 season
      competition: string;
      result?: string | null;
      mom?: string | null;
      headline?: string;
    }
  | {
      kind: "debut";
      playerName: string;
      grade: string;
      capNumber?: number | null;
      season?: string | null;
      opponent?: string | null;
      round?: number | null;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "newCap";
      playerName: string;
      grade: string;
      category: string; // "male" | "female"
      capNumber: number;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "century";
      playerName: string;
      grade: string;
      runs: number;
      balls?: number | null;
      notOut?: boolean;
      opponent?: string | null;
      round?: number | null;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "fiveFor";
      playerName: string;
      grade: string;
      wickets: number;
      runsConceded?: number | null;
      overs?: string | null;
      figures?: string | null;
      opponent?: string | null;
      round?: number | null;
      headline?: string;
      photoUrl?: string | null;
    }
  | {
      kind: "matchSummary";
      matchTitle: string; // e.g. "A Grade • Round 5"
      matchType?: string | null; // e.g. "One Day"
      date?: string | null;
      venue?: string | null;
      result: string;
      resultWinner: "club" | "opposition" | "draw";
      club: MatchSummaryTeam;
      opposition: MatchSummaryTeam;
      innings: MatchSummaryInnings[];
      headline?: string;
    };

export type CardKind = ShareCardInput["kind"];

export const CARD_KINDS: CardKind[] = [
  "milestone",
  "player",
  "record",
  "gradeLeader",
  "premiership",
  "debut",
  "newCap",
  "century",
  "fiveFor",
  "matchSummary",
];

// A sponsor with an empty cardKinds list applies to every card type; otherwise
// it only appears on the listed kinds.
export const sponsorAppliesToKind = (
  cardKinds: string[] | null | undefined,
  kind: CardKind,
): boolean => !cardKinds || cardKinds.length === 0 || cardKinds.includes(kind);

// Theme as delivered by the API (`CardTheme`). Colors are hex strings; the two
// optional URLs add a background image and a custom logo. The renderer derives
// the muted / soft accent variants from these base colors.
export type CardTheme = {
  bgDark: string;
  bgPanel: string;
  accent: string;
  textLight: string;
  backgroundImageUrl?: string | null;
  logoUrl?: string | null;
};

type Palette = {
  bgDark: string;
  bgPanel: string;
  accent: string;
  accentSoft: string; // accent @ 0.18
  accentBorder: string; // accent @ 0.4
  accentStrip: string; // accent @ 0.5
  textLight: string;
  textMuted: string; // textLight @ 0.65
};

const DEFAULT_THEME: CardTheme = {
  bgDark: "#322F3D",
  bgPanel: "#3F3C4C",
  accent: "#FBD039",
  textLight: "#F5F2E8",
};

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [251, 208, 57];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const resolvePalette = (theme?: CardTheme | null): Palette => {
  const t = theme ?? DEFAULT_THEME;
  return {
    bgDark: t.bgDark || DEFAULT_THEME.bgDark,
    bgPanel: t.bgPanel || DEFAULT_THEME.bgPanel,
    accent: t.accent || DEFAULT_THEME.accent,
    accentSoft: rgba(t.accent || DEFAULT_THEME.accent, 0.18),
    accentBorder: rgba(t.accent || DEFAULT_THEME.accent, 0.4),
    accentStrip: rgba(t.accent || DEFAULT_THEME.accent, 0.5),
    textLight: t.textLight || DEFAULT_THEME.textLight,
    textMuted: rgba(t.textLight || DEFAULT_THEME.textLight, 0.65),
  };
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });

const iconSvgString = (tierIndex: number, color: string, size = 256, strokeWidth = 1.75): string => {
  const Icon = TIER_ICONS[Math.min(Math.max(tierIndex, 0), TIER_ICONS.length - 1)];
  const node = createElement(Icon, { color, size, strokeWidth, absoluteStrokeWidth: true });
  return renderToStaticMarkup(node as React.ReactElement);
};

const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const fmt = (v: string | number) => (typeof v === "number" ? v.toLocaleString() : v);

const headlineFor = (input: ShareCardInput): string => {
  if (input.headline) return input.headline;
  switch (input.kind) {
    case "milestone":
      return "Honour Board Milestone";
    case "player":
      return "Player Profile";
    case "record":
      return `Club Record • ${input.title}`;
    case "gradeLeader":
      return `${input.grade} • Leader`;
    case "premiership":
      return `${input.grade} • Premiers`;
    case "debut":
      return `${input.grade} • Debut`;
    case "newCap":
      return `${input.grade} • Cap #${input.capNumber}`;
    case "century":
      return `${input.grade} • Century`;
    case "fiveFor":
      return `${input.grade} • Five-For`;
    case "matchSummary":
      return input.matchTitle;
  }
};

const seasonLabel = (year: number) =>
  `${year}/${String((year + 1) % 100).padStart(2, "0")}`;

// Draw `img` so it covers the rect (object-fit: cover) honouring a focal point
// and zoom. `focalX`/`focalY` are 0-1 (0.5 = centred) and select the point of
// the source image that stays in view; `zoom` (>= 1) crops in tighter. With the
// defaults this is a plain centred cover.
const drawImageCoverFocal = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  focalX = 0.5,
  focalY = 0.5,
  zoom = 1,
) => {
  const ir = img.width / img.height;
  const rr = dw / dh;
  // Source window at zoom = 1 (object-fit: cover).
  let sw0: number, sh0: number;
  if (ir > rr) {
    sh0 = img.height;
    sw0 = img.height * rr;
  } else {
    sw0 = img.width;
    sh0 = img.width / rr;
  }
  const z = Math.max(1, zoom);
  const sw = sw0 / z;
  const sh = sh0 / z;
  // Centre the window on the focal point, clamped so it stays inside the image.
  const sx = Math.max(0, Math.min(img.width - sw, focalX * img.width - sw / 2));
  const sy = Math.max(0, Math.min(img.height - sh, focalY * img.height - sh / 2));
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
};

// Draw `img` so it covers the rect (object-fit: cover), centred.
const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) => drawImageCoverFocal(ctx, img, dx, dy, dw, dh, 0.5, 0.5, 1);

// Clip to a circle and draw `img` as cover, then stroke a ring.
const drawCircularImage = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number,
  ringColor: string,
  ringWidth: number,
) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  drawImageCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = ringWidth;
  ctx.stroke();
};

const drawBackground = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: Palette,
  bgImg: HTMLImageElement | null,
  feature = false,
  transform?: PhotoTransform | null,
) => {
  if (bgImg) {
    // Photo background + dark overlay so foreground text stays legible.
    if (feature && transform) {
      drawImageCoverFocal(ctx, bgImg, 0, 0, W, H, transform.focalX, transform.focalY, transform.zoom);
    } else {
      drawImageCover(ctx, bgImg, 0, 0, W, H);
    }
    const ov = ctx.createLinearGradient(0, 0, 0, H);
    if (feature) {
      // A feature photo is the hero: keep a lighter veil over the top/middle so
      // the photo reads through, and ramp to a strong scrim at the bottom where
      // the headline, name and stat text sit.
      ov.addColorStop(0, rgba(p.bgDark, 0.5));
      ov.addColorStop(0.45, rgba(p.bgDark, 0.42));
      ov.addColorStop(0.7, rgba(p.bgDark, 0.62));
      ov.addColorStop(1, rgba(p.bgDark, 0.92));
    } else {
      ov.addColorStop(0, rgba(p.bgPanel, 0.82));
      ov.addColorStop(1, rgba(p.bgDark, 0.92));
    }
    ctx.fillStyle = ov;
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, p.bgPanel);
    bgGrad.addColorStop(1, p.bgDark);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.78);
    ctx.lineTo(W, H * 0.62);
    ctx.lineTo(W, H * 0.7);
    ctx.lineTo(0, H * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const inset = Math.round(W * 0.026);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = Math.max(4, Math.round(W * 0.0055));
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.strokeStyle = p.accentBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(inset + 18, inset + 18, W - (inset + 18) * 2, H - (inset + 18) * 2);
};

const drawHeader = async (
  ctx: CanvasRenderingContext2D,
  W: number,
  topY: number,
  scale: number,
  p: Palette,
  logoSrc: string,
) => {
  const pad = Math.round(80 * scale);
  try {
    const logo = await loadImage(logoSrc);
    const logoH = Math.round(110 * scale);
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, pad, topY, logoW, logoH);
    ctx.fillStyle = p.textLight;
    ctx.font = `700 ${Math.round(26 * scale)}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("HALLS HEAD CRICKET CLUB", pad + logoW + Math.round(28 * scale), topY + Math.round(14 * scale));
    ctx.fillStyle = p.textMuted;
    ctx.font = `500 ${Math.round(17 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.fillText(
      "EST. 1991  •  HONOUR BOARD",
      pad + logoW + Math.round(28 * scale),
      topY + Math.round(54 * scale),
    );
    return topY + logoH + Math.round(40 * scale);
  } catch {
    ctx.fillStyle = p.textLight;
    ctx.font = `700 ${Math.round(36 * scale)}px Georgia, serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("HALLS HEAD CRICKET CLUB", pad, topY + Math.round(10 * scale));
    return topY + Math.round(80 * scale);
  }
};

const drawRibbon = (
  ctx: CanvasRenderingContext2D,
  W: number,
  y: number,
  text: string,
  scale: number,
  p: Palette,
): number => {
  const pad = Math.round(80 * scale);
  const h = Math.round(60 * scale);
  ctx.fillStyle = p.accent;
  ctx.fillRect(pad, y, W - pad * 2, h);
  ctx.fillStyle = p.bgDark;
  ctx.font = `800 ${Math.round(24 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), W / 2, y + h / 2);
  return y + h + Math.round(40 * scale);
};

const drawSponsors = async (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  sponsors: CardSponsor[],
  scale: number,
  p: Palette,
) => {
  if (sponsors.length === 0) return H - Math.round(70 * scale);
  const stripH = Math.round(110 * scale);
  const stripY = H - stripH - Math.round(40 * scale);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(Math.round(56 * scale), stripY, W - Math.round(112 * scale), stripH);
  ctx.strokeStyle = p.accentStrip;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(56 * scale), stripY, W - Math.round(112 * scale), stripH);

  ctx.fillStyle = p.textMuted;
  ctx.font = `600 ${Math.round(14 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("PROUDLY SUPPORTED BY", Math.round(72 * scale), stripY + Math.round(10 * scale));

  const logoH = Math.round(56 * scale);
  const gap = Math.round(28 * scale);
  let cursorX = Math.round(72 * scale);
  const baseY = stripY + Math.round(36 * scale);
  for (const s of sponsors.slice(0, 4)) {
    try {
      const img = await loadImage(s.logoUrl);
      const w = (img.width / img.height) * logoH;
      ctx.drawImage(img, cursorX, baseY, w, logoH);
      cursorX += w + gap;
    } catch {
      ctx.fillStyle = p.textLight;
      ctx.font = `700 ${Math.round(20 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(s.name, cursorX, baseY + Math.round(18 * scale));
      cursorX += ctx.measureText(s.name).width + gap;
    }
  }
  return stripY - Math.round(20 * scale);
};

const drawFooter = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  clubUrl: string,
  hashtag: string,
  scale: number,
  p: Palette,
) => {
  ctx.fillStyle = p.textMuted;
  ctx.font = `600 ${Math.round(18 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    `${clubUrl.toUpperCase()}  •  ${hashtag}`,
    W / 2,
    H - Math.round(30 * scale),
  );
};

// Built-in motion presets applied to a card. "none" is a still card; "fadeIn"
// and "slideUp" are whole-card / per-slot entrances; "countUp" ticks numeric
// slot values up from zero (template slots only — a flat built-in card falls
// back to "fadeIn" since its baked-in numbers can't be re-counted).
export type MotionPreset = "none" | "fadeIn" | "slideUp" | "countUp";

export type PhotoPlacement = "feature" | "headshot";

// Focal point (0-1, 0.5 = centred) + zoom (>= 1) for a feature photo. Lets the
// club drag/zoom to choose what stays in frame across every card size.
export type PhotoTransform = {
  focalX: number;
  focalY: number;
  zoom: number;
};

export const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = {
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
};

export type RenderOptions = {
  size: CardSize;
  sponsors?: CardSponsor[];
  clubUrl?: string;
  hashtag?: string;
  theme?: CardTheme | null;
  /**
   * Overrides the photo baked into the input. When omitted, the renderer falls
   * back to the input's own `photoUrl`; pass `null` to force no photo.
   */
  photoUrl?: string | null;
  /**
   * "headshot" (default) keeps the existing small circular portrait; "feature"
   * promotes the photo to a full-bleed hero/background with a dark scrim.
   */
  photoPlacement?: PhotoPlacement;
  /**
   * Focal point + zoom for a "feature" photo so the club can drag/zoom to keep
   * the subject in frame. Ignored for headshot placement and theme backgrounds.
   */
  photoTransform?: PhotoTransform | null;
  /**
   * A custom uploaded "bring your own" template. When provided, the card is
   * rendered from the template's flattened background + data-bound slots
   * instead of the built-in layout. The sponsor strip is still overlaid.
   */
  template?: CardTemplate | null;
  /**
   * Built-in motion preset for animated cards. When omitted, falls back to the
   * template's own `motionPreset` (if a template is used) and otherwise "none".
   * Ignored by the still PNG renderer (`renderShareCard`).
   */
  motionPreset?: MotionPreset;
};

// Draw `img` so it fits inside the rect (object-fit: contain), centred.
const drawImageContain = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) => {
  const ir = img.width / img.height;
  const rr = dw / dh;
  let w: number, h: number;
  if (ir > rr) {
    w = dw;
    h = dw / ir;
  } else {
    h = dh;
    w = dh * ir;
  }
  ctx.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
};

// --- Animation primitives ---------------------------------------------------

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const easeOutCubic = (n: number): number => 1 - Math.pow(1 - clamp01(n), 3);

// Replace the first run of digits in `text` with the same number scaled by
// `frac` (0-1). Powers the count-up preset: "1,234 Runs" → "740 Runs" mid-way.
const applyCountUp = (text: string, frac: number): string =>
  text.replace(/\d[\d,]*/, (m) => {
    const n = parseInt(m.replace(/,/g, ""), 10);
    if (Number.isNaN(n)) return m;
    return Math.round(n * clamp01(frac)).toLocaleString();
  });

// A template background ready to draw. Stills/GIFs come back as an <img>;
// videos come back as a <video> (drawImage reads its current frame).
type TemplateBgSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  video?: HTMLVideoElement;
};

// Load a template background. For "video" kind: when `play` is true the element
// loops in real time (animation/export); otherwise it is seeked to a poster
// frame for the still PNG. Images and GIFs load as an <img> either way.
const loadTemplateBg = async (
  template: CardTemplate,
  play: boolean,
): Promise<TemplateBgSource | null> => {
  const kind = template.backgroundKind ?? "image";
  if (kind === "video") {
    return await new Promise<TemplateBgSource | null>((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.preload = "auto";
      const ok = () =>
        resolve({
          source: video,
          width: video.videoWidth || template.bgWidth || 1080,
          height: video.videoHeight || template.bgHeight || 1080,
          video,
        });
      video.onerror = () => resolve(null);
      if (play) {
        video.oncanplay = () => {
          void video.play().then(ok).catch(ok);
        };
      } else {
        video.onloadeddata = () => {
          video.onseeked = () => ok();
          try {
            video.currentTime = Math.min(0.1, (video.duration || 1) * 0.1);
          } catch {
            ok();
          }
        };
      }
      video.src = template.backgroundImageUrl;
    });
  }
  const img = await loadImage(template.backgroundImageUrl).catch(() => null);
  if (!img) return null;
  return {
    source: img,
    width: img.naturalWidth || template.bgWidth || 1080,
    height: img.naturalHeight || template.bgHeight || 1080,
  };
};

// Draw any CanvasImageSource so it covers the rect (object-fit: cover), centred.
// Unlike drawImageCover this takes explicit natural dimensions so it works for
// <video> elements (whose .width/.height attributes are unreliable).
const drawSourceCover = (
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) => {
  const ir = sw / sh;
  const rr = dw / dh;
  let cw: number, ch: number;
  if (ir > rr) {
    ch = sh;
    cw = sh * rr;
  } else {
    cw = sw;
    ch = sw / rr;
  }
  ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, dx, dy, dw, dh);
};

// Preload sponsor logos (up to 4) into a cache so the sponsor strip can be
// drawn synchronously every animation frame.
const loadSponsorLogos = async (
  sponsors: CardSponsor[],
): Promise<Map<string, HTMLImageElement>> => {
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    sponsors.slice(0, 4).map(async (s) => {
      const img = await loadImage(s.logoUrl).catch(() => null);
      if (img) map.set(s.logoUrl, img);
    }),
  );
  return map;
};

// Synchronous sponsor strip using preloaded logos (mirrors drawSponsors).
const drawSponsorsSync = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  sponsors: CardSponsor[],
  scale: number,
  p: Palette,
  logos: Map<string, HTMLImageElement>,
) => {
  if (sponsors.length === 0) return;
  const stripH = Math.round(110 * scale);
  const stripY = H - stripH - Math.round(40 * scale);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(Math.round(56 * scale), stripY, W - Math.round(112 * scale), stripH);
  ctx.strokeStyle = p.accentStrip;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(56 * scale), stripY, W - Math.round(112 * scale), stripH);

  ctx.fillStyle = p.textMuted;
  ctx.font = `600 ${Math.round(14 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("PROUDLY SUPPORTED BY", Math.round(72 * scale), stripY + Math.round(10 * scale));

  const logoH = Math.round(56 * scale);
  const gap = Math.round(28 * scale);
  let cursorX = Math.round(72 * scale);
  const baseY = stripY + Math.round(36 * scale);
  for (const s of sponsors.slice(0, 4)) {
    const img = logos.get(s.logoUrl);
    if (img) {
      const w = (img.width / img.height) * logoH;
      ctx.drawImage(img, cursorX, baseY, w, logoH);
      cursorX += w + gap;
    } else {
      ctx.fillStyle = p.textLight;
      ctx.font = `700 ${Math.round(20 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(s.name, cursorX, baseY + Math.round(18 * scale));
      cursorX += ctx.measureText(s.name).width + gap;
    }
  }
};

// Synchronous, frame-aware template renderer shared by the still PNG path
// (motion "none", t = 1) and the animation path. Draws the background (cover),
// then each data-bound slot honouring the motion preset at progress `t` (0-1).
const drawTemplateFrame = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  input: ShareCardInput,
  template: CardTemplate,
  opts: RenderOptions,
  p: Palette,
  bg: TemplateBgSource | null,
  photoImg: HTMLImageElement | null,
  logos: Map<string, HTMLImageElement>,
  motion: MotionPreset,
  t: number,
) => {
  const tctx: TemplateContext = {
    clubUrl: opts.clubUrl,
    hashtag: opts.hashtag,
    photoUrl: opts.photoUrl,
  };

  // Cover transform of the background into the target frame.
  const iw = template.bgWidth || 1080;
  const ih = template.bgHeight || 1080;
  const cover = Math.max(W / iw, H / ih);
  const drawnW = iw * cover;
  const drawnH = ih * cover;
  const offX = (W - drawnW) / 2;
  const offY = (H - drawnH) / 2;
  const toX = (fx: number) => offX + fx * drawnW;
  const toY = (fy: number) => offY + fy * drawnH;

  if (bg) {
    drawSourceCover(ctx, bg.source, bg.width, bg.height, 0, 0, W, H);
  } else {
    // Background failed to load: fall back to a flat panel so slots are legible.
    ctx.fillStyle = p.bgDark;
    ctx.fillRect(0, 0, W, H);
  }

  const slots = template.slots;
  slots.forEach((slot, i) => {
    const cx = toX(slot.x);
    const cy = toY(slot.y);
    const cw = slot.w * drawnW;
    const ch = slot.h * drawnH;

    // Per-slot entrance progress: slots stagger in across the first ~60% of the
    // timeline, then hold. Motion "none" shows everything fully (local unused).
    const stagger = slots.length > 1 ? (i / slots.length) * 0.3 : 0;
    const local = easeOutCubic((t - stagger) / 0.6);
    const alpha = motion === "none" ? 1 : local;
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (motion === "slideUp") ctx.translate(0, (1 - local) * 0.06 * H);

    if (slot.type === "photo") {
      const url = resolvePhotoField(input, tctx);
      if (url && photoImg) {
        const tr = opts.photoTransform ?? DEFAULT_PHOTO_TRANSFORM;
        if (slot.shape === "circle") {
          const r = Math.min(cw, ch) / 2;
          const ccx = cx + cw / 2;
          const ccy = cy + ch / 2;
          ctx.beginPath();
          ctx.arc(ccx, ccy, r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          drawImageCoverFocal(ctx, photoImg, ccx - r, ccy - r, r * 2, r * 2, tr.focalX, tr.focalY, tr.zoom);
        } else if (slot.photoFit === "contain") {
          drawImageContain(ctx, photoImg, cx, cy, cw, ch);
        } else {
          ctx.beginPath();
          ctx.rect(cx, cy, cw, ch);
          ctx.closePath();
          ctx.clip();
          drawImageCoverFocal(ctx, photoImg, cx, cy, cw, ch, tr.focalX, tr.focalY, tr.zoom);
        }
      }
      ctx.restore();
      return;
    }

    // Text slot.
    let text = resolveTextField(input, slot.field, tctx);
    if (!text) {
      ctx.restore();
      return;
    }
    if (motion === "countUp") text = applyCountUp(text, local);
    if (slot.uppercase) text = text.toUpperCase();
    const fontPx = Math.max(8, (slot.fontSize ?? 0.05) * drawnH);
    const family =
      slot.fontFamily === "serif"
        ? "Georgia, 'Times New Roman', serif"
        : "'Helvetica Neue', Arial, sans-serif";
    const weight = slot.fontWeight ?? 700;
    ctx.font = `${weight} ${fontPx}px ${family}`;
    ctx.fillStyle = slot.color || p.textLight;
    ctx.textBaseline = "middle";
    const align = slot.align ?? "left";
    ctx.textAlign = align;
    const lines = wrapText(ctx, text, cw);
    const lineH = fontPx * 1.15;
    const totalH = lines.length * lineH;
    let ty = cy + ch / 2 - totalH / 2 + lineH / 2;
    const tx = align === "center" ? cx + cw / 2 : align === "right" ? cx + cw : cx;
    for (const line of lines) {
      ctx.fillText(line, tx, ty);
      ty += lineH;
    }
    ctx.restore();
  });

  // Sponsors strip still overlays the bottom when enabled.
  drawSponsorsSync(ctx, W, H, opts.sponsors ?? [], scale, p, logos);
};

// Still template render: preload assets, then draw the final (motion "none")
// frame. Keeps byte-for-byte parity with the previous still output.
const renderTemplateCard = async (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  input: ShareCardInput,
  template: CardTemplate,
  opts: RenderOptions,
  p: Palette,
) => {
  const tctx: TemplateContext = {
    clubUrl: opts.clubUrl,
    hashtag: opts.hashtag,
    photoUrl: opts.photoUrl,
  };
  const bg = await loadTemplateBg(template, false);
  const purl = resolvePhotoField(input, tctx);
  const photoImg = purl ? await loadImage(purl).catch(() => null) : null;
  const logos = await loadSponsorLogos(opts.sponsors ?? []);
  drawTemplateFrame(ctx, W, H, scale, input, template, opts, p, bg, photoImg, logos, "none", 1);
  bg?.video?.remove();
};

// Truncate `text` to fit `maxW` at the current ctx.font, appending an ellipsis.
const ellipsize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string => {
  if (maxW <= 0) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
};

// Self-contained renderer for the two-innings Match Summary scorecard tile.
// Owns its own dark stadium background and team-coloured chrome (so it bypasses
// the standard header/ribbon flow), but still overlays the sponsor strip and
// club footer at the bottom. Adapts across square / portrait / story sizes.
const renderMatchSummaryCard = async (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scale: number,
  input: Extract<ShareCardInput, { kind: "matchSummary" }>,
  opts: RenderOptions,
  p: Palette,
) => {
  const isStory = opts.size === "story";
  const sans = "'Helvetica Neue', Arial, sans-serif";
  const serif = "Georgia, 'Times New Roman', serif";
  const padX = Math.round(64 * scale);

  // --- Background: dark stadium gradient + accent glow ---------------------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.bgPanel);
  bg.addColorStop(0.5, p.bgDark);
  bg.addColorStop(1, p.bgDark);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.08, 0, W / 2, H * 0.08, W * 0.85);
  glow.addColorStop(0, rgba(p.accent, 0.1));
  glow.addColorStop(1, rgba(p.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const inset = Math.round(W * 0.022);
  ctx.strokeStyle = rgba(p.accent, 0.45);
  ctx.lineWidth = Math.max(3, Math.round(W * 0.004));
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);

  // --- Sponsor strip + footer (drawn first; content stays above) -----------
  const sponsors = opts.sponsors ?? [];
  const sponsorsTop = await drawSponsors(ctx, W, H, sponsors, scale, p);
  drawFooter(
    ctx,
    W,
    H,
    opts.clubUrl ?? "hallsheadcricket.com.au",
    opts.hashtag ?? "#HHCC",
    scale,
    p,
  );

  const teamOf = (key: "club" | "opposition") =>
    key === "club" ? input.club : input.opposition;
  const shortOf = (t: MatchSummaryTeam) => (t.shortName || t.name).toUpperCase();
  const teamScoreText = (key: "club" | "opposition") =>
    input.innings
      .filter((i) => i.teamKey === key)
      .map((i) => `${i.totalRuns}/${i.wickets}${i.declared ? "d" : ""}`)
      .join(" & ");

  // --- Team crest: white-backed logo, else a coloured initials chip --------
  const drawTeamCrest = async (
    team: MatchSummaryTeam,
    cx: number,
    cy: number,
    r: number,
  ) => {
    if (team.logoUrl) {
      try {
        const img = await loadImage(team.logoUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.clip();
        drawImageContain(ctx, img, cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = team.primaryColor;
        ctx.lineWidth = Math.round(4 * scale);
        ctx.stroke();
        return;
      } catch {
        // fall through to initials chip
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = team.primaryColor;
    ctx.fill();
    ctx.strokeStyle = rgba("#ffffff", 0.35);
    ctx.lineWidth = Math.round(3 * scale);
    ctx.stroke();
    const initials = (team.shortName || team.name)
      .replace(/[^A-Za-z ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
    ctx.fillStyle = team.textColor;
    ctx.font = `800 ${Math.round(r * 0.7)}px ${sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials || "?", cx, cy);
  };

  // --- One innings block: team-coloured header bar + batting/bowling cols ---
  const drawInningsBlock = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    inn: MatchSummaryInnings,
    team: MatchSummaryTeam,
  ) => {
    const radius = Math.round(14 * scale);
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, radius);
    ctx.fillStyle = rgba(p.textLight, 0.05);
    ctx.fill();
    ctx.strokeStyle = rgba(p.textLight, 0.1);
    ctx.lineWidth = 1;
    ctx.stroke();

    const hb = Math.round((isStory ? 56 : 48) * scale);
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, hb, [radius, radius, 0, 0]);
    ctx.fillStyle = team.primaryColor;
    ctx.fill();
    ctx.fillStyle = team.textColor;
    ctx.font = `800 ${Math.round((isStory ? 26 : 22) * scale)}px ${sans}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(shortOf(team), bx + Math.round(20 * scale), by + hb / 2);
    ctx.textAlign = "right";
    ctx.fillText(
      `${inn.totalRuns}/${inn.wickets}${inn.declared ? "d" : ""}  (${inn.overs})`,
      bx + bw - Math.round(20 * scale),
      by + hb / 2,
    );

    const colTop = by + hb + Math.round(14 * scale);
    const colBottom = by + bh - Math.round(12 * scale);
    const midX = bx + bw / 2;
    const leftLabelX = bx + Math.round(20 * scale);
    const rightLabelX = midX + Math.round(16 * scale);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `800 ${Math.round(15 * scale)}px ${sans}`;
    ctx.fillStyle = p.accent;
    ctx.fillText("BATTING", leftLabelX, colTop);
    ctx.fillText("BOWLING", rightLabelX, colTop);

    const ry = colTop + Math.round(26 * scale);
    const rowH = Math.round((isStory ? 34 : 30) * scale);
    const maxRows = Math.max(0, Math.floor((colBottom - ry) / rowH));
    if (maxRows === 0) return;
    const nameFont = `600 ${Math.round((isStory ? 20 : 17) * scale)}px ${sans}`;
    const valFont = `700 ${Math.round((isStory ? 20 : 17) * scale)}px ${sans}`;
    const leftValX = midX - Math.round(18 * scale);
    const rightValX = bx + bw - Math.round(20 * scale);
    const batters = inn.topBatters.slice(0, maxRows);
    const bowlers = inn.topBowlers.slice(0, maxRows);
    for (let i = 0; i < maxRows; i++) {
      const yy = ry + i * rowH;
      const b = batters[i];
      if (b) {
        ctx.font = valFont;
        const bv = `${b.runs}${b.notOut ? "*" : ""}${b.balls != null ? ` (${b.balls})` : ""}`;
        const bvW = ctx.measureText(bv).width;
        ctx.font = nameFont;
        ctx.textAlign = "left";
        ctx.fillStyle = p.textLight;
        ctx.fillText(
          ellipsize(ctx, b.name, leftValX - leftLabelX - bvW - Math.round(12 * scale)),
          leftLabelX,
          yy,
        );
        ctx.font = valFont;
        ctx.textAlign = "right";
        ctx.fillStyle = p.accent;
        ctx.fillText(bv, leftValX, yy);
      }
      const w = bowlers[i];
      if (w) {
        ctx.font = valFont;
        const wv = `${w.wickets}/${w.runs} (${w.overs})`;
        const wvW = ctx.measureText(wv).width;
        ctx.font = nameFont;
        ctx.textAlign = "left";
        ctx.fillStyle = p.textLight;
        ctx.fillText(
          ellipsize(ctx, w.name, rightValX - rightLabelX - wvW - Math.round(12 * scale)),
          rightLabelX,
          yy,
        );
        ctx.font = valFont;
        ctx.textAlign = "right";
        ctx.fillStyle = p.accent;
        ctx.fillText(wv, rightValX, yy);
      }
    }
  };

  // --- Header: eyebrow, title, meta, crests + VS ---------------------------
  let y = Math.round(58 * scale);
  ctx.fillStyle = p.accent;
  ctx.font = `800 ${Math.round((isStory ? 30 : 24) * scale)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("MATCH SUMMARY", W / 2, y);
  y += Math.round((isStory ? 48 : 38) * scale);

  ctx.fillStyle = p.textLight;
  ctx.font = `700 ${Math.round((isStory ? 60 : 48) * scale)}px ${serif}`;
  const titleLines = wrapText(ctx, input.matchTitle, W - padX * 2);
  const titleLineH = Math.round((isStory ? 66 : 54) * scale);
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * titleLineH));
  y += titleLines.length * titleLineH + Math.round(10 * scale);

  const meta = [input.matchType, input.date, input.venue].filter(Boolean).join("   •   ");
  if (meta) {
    ctx.fillStyle = p.textMuted;
    ctx.font = `500 ${Math.round((isStory ? 24 : 20) * scale)}px ${sans}`;
    ctx.fillText(meta, W / 2, y);
    y += Math.round((isStory ? 42 : 34) * scale);
  }

  y += Math.round(10 * scale);
  const crestR = Math.round((isStory ? 64 : 52) * scale);
  const vsGap = Math.round((isStory ? 130 : 104) * scale);
  const crestCy = y + crestR;
  const leftCx = W / 2 - vsGap;
  const rightCx = W / 2 + vsGap;
  await drawTeamCrest(input.club, leftCx, crestCy, crestR);
  await drawTeamCrest(input.opposition, rightCx, crestCy, crestR);
  ctx.fillStyle = p.accent;
  ctx.font = `800 ${Math.round((isStory ? 42 : 34) * scale)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", W / 2, crestCy);
  ctx.fillStyle = p.textLight;
  ctx.font = `700 ${Math.round((isStory ? 24 : 20) * scale)}px ${sans}`;
  ctx.textBaseline = "top";
  const crestLabelY = crestCy + crestR + Math.round(10 * scale);
  ctx.fillText(shortOf(input.club), leftCx, crestLabelY);
  ctx.fillText(shortOf(input.opposition), rightCx, crestLabelY);
  y = crestLabelY + Math.round((isStory ? 44 : 38) * scale);

  // Story format gets per-team score-summary boxes under the crests.
  if (isStory) {
    const boxGap = Math.round(20 * scale);
    const boxW = (W - padX * 2 - boxGap) / 2;
    const boxH = Math.round(108 * scale);
    (["club", "opposition"] as const).forEach((key, i) => {
      const team = teamOf(key);
      const x = padX + i * (boxW + boxGap);
      ctx.beginPath();
      ctx.roundRect(x, y, boxW, boxH, Math.round(12 * scale));
      ctx.fillStyle = rgba(team.primaryColor, 0.18);
      ctx.fill();
      ctx.strokeStyle = rgba(team.primaryColor, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = team.primaryColor;
      ctx.fillRect(x, y + Math.round(14 * scale), Math.round(6 * scale), boxH - Math.round(28 * scale));
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = p.textMuted;
      ctx.font = `700 ${Math.round(20 * scale)}px ${sans}`;
      ctx.fillText(shortOf(team), x + Math.round(24 * scale), y + Math.round(22 * scale));
      ctx.fillStyle = p.textLight;
      ctx.font = `800 ${Math.round(40 * scale)}px ${serif}`;
      ctx.fillText(teamScoreText(key) || "—", x + Math.round(24 * scale), y + Math.round(52 * scale));
    });
    y += boxH + Math.round(28 * scale);
  }

  // --- Result banner (winner-coloured) above the sponsor/footer area -------
  const resultBannerH = Math.round((isStory ? 92 : 76) * scale);
  const contentBottom = sponsorsTop - Math.round(20 * scale);
  const resultBannerY = contentBottom - resultBannerH;
  const winnerTeam =
    input.resultWinner === "club"
      ? input.club
      : input.resultWinner === "opposition"
        ? input.opposition
        : null;
  ctx.beginPath();
  ctx.roundRect(padX, resultBannerY, W - padX * 2, resultBannerH, Math.round(12 * scale));
  ctx.fillStyle = winnerTeam ? winnerTeam.primaryColor : p.accent;
  ctx.fill();
  ctx.fillStyle = winnerTeam ? winnerTeam.textColor : p.bgDark;
  ctx.font = `800 ${Math.round((isStory ? 30 : 25) * scale)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const resLines = wrapText(ctx, input.result.toUpperCase(), W - padX * 2 - Math.round(48 * scale));
  const resLineH = Math.round((isStory ? 36 : 30) * scale);
  const resStart = resultBannerY + resultBannerH / 2 - ((resLines.length - 1) * resLineH) / 2;
  resLines.forEach((l, i) => ctx.fillText(l, W / 2, resStart + i * resLineH));

  // --- Innings blocks, distributed between the header and the result banner -
  const innings = input.innings.slice(0, 4);
  const n = innings.length;
  if (n > 0) {
    const inningsAreaTop = y;
    const inningsAreaBottom = resultBannerY - Math.round(20 * scale);
    const blockGap = Math.round(16 * scale);
    const areaH = Math.max(0, inningsAreaBottom - inningsAreaTop);
    const blockH = (areaH - blockGap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const inn = innings[i];
      const by = inningsAreaTop + i * (blockH + blockGap);
      drawInningsBlock(padX, by, W - padX * 2, blockH, inn, teamOf(inn.teamKey));
    }
  }
};

export const renderShareCard = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<Blob> => {
  const { w: W, h: H } = SIZES[opts.size];
  const scale = W / 1080; // base = 1080 wide
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  const p = resolvePalette(opts.theme);

  // Custom uploaded template path: render the bg + data-bound slots and bail
  // out before any built-in chrome. Sponsors are overlaid inside the helper.
  if (opts.template) {
    await renderTemplateCard(ctx, W, H, scale, input, opts.template, opts, p);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not export canvas to blob"));
      }, "image/png");
    });
  }

  // Match Summary path: a self-contained two-innings scorecard tile with its own
  // team-coloured chrome, so it bails out before the standard header/ribbon flow.
  if (input.kind === "matchSummary") {
    await renderMatchSummaryCard(ctx, W, H, scale, input, opts, p);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not export canvas to blob"));
      }, "image/png");
    });
  }

  // Local aliases keep the per-kind body code below theme-agnostic.
  const GOLD = p.accent;
  const GOLD_SOFT = p.accentSoft;
  const TEXT_LIGHT = p.textLight;
  const TEXT_MUTED = p.textMuted;

  // Preload theme background + player photo (if any); failures fall back gracefully.
  const bgImg = opts.theme?.backgroundImageUrl
    ? await loadImage(opts.theme.backgroundImageUrl).catch(() => null)
    : null;
  const placement: PhotoPlacement = opts.photoPlacement ?? "headshot";
  // opts.photoUrl overrides the input's baked photo; `undefined` means "use the
  // input's own photo", while an explicit `null` forces no photo.
  const photoUrl =
    opts.photoUrl !== undefined
      ? opts.photoUrl
      : "photoUrl" in input
        ? input.photoUrl
        : null;
  const loadedPhoto = photoUrl ? await loadImage(photoUrl).catch(() => null) : null;
  // In feature mode the photo becomes the background hero; otherwise it is the
  // small circular headshot the per-kind body draws.
  const featureImg = placement === "feature" ? loadedPhoto : null;
  const photoImg = placement === "feature" ? null : loadedPhoto;
  const logoSrc = opts.theme?.logoUrl || logoUrl;

  drawBackground(ctx, W, H, p, featureImg ?? bgImg, !!featureImg, featureImg ? opts.photoTransform : undefined);
  const headerEnd = await drawHeader(ctx, W, Math.round(80 * scale), scale, p, logoSrc);
  const ribbonEnd = drawRibbon(ctx, W, headerEnd, headlineFor(input), scale, p);

  // Reserve space for sponsors + footer at bottom.
  const sponsors = opts.sponsors ?? [];
  const sponsorsTop = await drawSponsors(ctx, W, H, sponsors, scale, p);

  // Body area: between ribbonEnd and sponsorsTop.
  const bodyTop = ribbonEnd;
  const bodyBottom = sponsorsTop;

  // Render per card kind, centred in body area.
  if (input.kind === "milestone") {
    const badgeR = Math.round(130 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(30 * scale);
    if (photoImg) {
      // Prominent circular headshot, with a small tier-icon badge at lower-right.
      drawCircularImage(ctx, photoImg, W / 2, badgeCy, badgeR, GOLD, Math.round(6 * scale));
      const miniR = Math.round(46 * scale);
      const miniCx = W / 2 + badgeR * 0.72;
      const miniCy = badgeCy + badgeR * 0.72;
      ctx.beginPath();
      ctx.arc(miniCx, miniCy, miniR, 0, Math.PI * 2);
      ctx.fillStyle = p.bgDark;
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = Math.round(3 * scale);
      ctx.stroke();
      try {
        const svg = iconSvgString(input.tierIndex, GOLD, 256, 1.75);
        const iconImg = await loadImage(svgToDataUrl(svg));
        const iconSize = Math.round(52 * scale);
        ctx.drawImage(iconImg, miniCx - iconSize / 2, miniCy - iconSize / 2, iconSize, iconSize);
      } catch {}
    } else {
      ctx.beginPath();
      ctx.arc(W / 2, badgeCy, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = GOLD_SOFT;
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 4;
      ctx.stroke();
      try {
        const svg = iconSvgString(input.tierIndex, GOLD, 256, 1.75);
        const iconImg = await loadImage(svgToDataUrl(svg));
        const iconSize = Math.round(150 * scale);
        ctx.drawImage(iconImg, W / 2 - iconSize / 2, badgeCy - iconSize / 2, iconSize, iconSize);
      } catch {}
    }

    ctx.fillStyle = GOLD;
    ctx.font = `800 ${Math.round(34 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const tierY = badgeCy + badgeR + Math.round(28 * scale);
    ctx.fillText(input.tierLabel.toUpperCase(), W / 2, tierY);

    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = `700 ${Math.round(58 * scale)}px Georgia, 'Times New Roman', serif`;
    const nameLines = wrapText(ctx, input.playerName.toUpperCase(), W - Math.round(200 * scale));
    const lineH = Math.round(68 * scale);
    const nameY = tierY + Math.round(60 * scale);
    nameLines.forEach((line, i) => ctx.fillText(line, W / 2, nameY + i * lineH));

    const statY = nameY + nameLines.length * lineH + Math.round(24 * scale);
    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = `800 ${Math.round(52 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.fillText(
      `${fmt(input.currentValue)} ${input.milestoneLabel.toLowerCase()}`,
      W / 2,
      statY,
    );
    if (input.threshold && input.threshold > 0) {
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = `500 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(
        `Just past the ${fmt(input.threshold)} ${input.milestoneLabel.toLowerCase()} mark`,
        W / 2,
        statY + Math.round(64 * scale),
      );
    }
  } else if (input.kind === "player") {
    let y = bodyTop + Math.round(40 * scale);
    if (photoImg) {
      const r = Math.round(150 * scale);
      const cy = y + r;
      drawCircularImage(ctx, photoImg, W / 2, cy, r, GOLD, Math.round(6 * scale));
      y = cy + r + Math.round(36 * scale);
    }
    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = `700 ${Math.round(72 * scale)}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const nameLines = wrapText(ctx, input.playerName.toUpperCase(), W - Math.round(200 * scale));
    const lineH = Math.round(80 * scale);
    nameLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * lineH));
    y += nameLines.length * lineH + Math.round(20 * scale);

    if (input.gradesPlayed) {
      ctx.fillStyle = GOLD;
      ctx.font = `600 ${Math.round(20 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(input.gradesPlayed.toUpperCase(), W / 2, y);
      y += Math.round(40 * scale);
    }

    // Stat grid (2 cols).
    const cols = 2;
    const cellW = (W - Math.round(200 * scale)) / cols;
    const cellH = Math.round(150 * scale);
    const startX = Math.round(100 * scale);
    const startY = Math.min(y + Math.round(20 * scale), bodyBottom - cellH * Math.ceil(input.stats.length / cols) - Math.round(20 * scale));
    input.stats.slice(0, 6).forEach((s, i) => {
      const cx = startX + (i % cols) * cellW + cellW / 2;
      const cy = startY + Math.floor(i / cols) * cellH;
      ctx.fillStyle = GOLD;
      ctx.font = `800 ${Math.round(62 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(String(fmt(s.value)), cx, cy);
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = `600 ${Math.round(20 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(s.label.toUpperCase(), cx, cy + Math.round(72 * scale));
    });
  } else if (input.kind === "record") {
    let y = bodyTop + Math.round(30 * scale);
    if (photoImg) {
      const r = Math.round(70 * scale);
      const cy = y + r;
      drawCircularImage(ctx, photoImg, W / 2, cy, r, GOLD, Math.round(4 * scale));
      y = cy + r + Math.round(24 * scale);
    }
    ctx.fillStyle = GOLD;
    ctx.font = `800 ${Math.round(28 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(input.title.toUpperCase(), W / 2, y);
    y += Math.round(60 * scale);

    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = `900 ${Math.round(180 * scale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(String(fmt(input.value)), W / 2, y);
    y += Math.round(200 * scale);

    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = `700 ${Math.round(48 * scale)}px Georgia, 'Times New Roman', serif`;
    const nameLines = wrapText(ctx, input.playerName.toUpperCase(), W - Math.round(160 * scale));
    nameLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * Math.round(56 * scale)));
    if (input.grade) {
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = `600 ${Math.round(20 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(input.grade.toUpperCase(), W / 2, y + nameLines.length * Math.round(56 * scale) + Math.round(20 * scale));
    }
  } else if (input.kind === "gradeLeader") {
    let y = bodyTop + Math.round(40 * scale);
    if (photoImg) {
      const r = Math.round(70 * scale);
      const cy = y + r;
      drawCircularImage(ctx, photoImg, W / 2, cy, r, GOLD, Math.round(4 * scale));
      y = cy + r + Math.round(24 * scale);
    }
    ctx.fillStyle = GOLD;
    ctx.font = `800 ${Math.round(28 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${input.grade.toUpperCase()} • LEADING ${input.category.toUpperCase()}`, W / 2, y);
    y += Math.round(80 * scale);

    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = `700 ${Math.round(68 * scale)}px Georgia, 'Times New Roman', serif`;
    const nameLines = wrapText(ctx, input.playerName.toUpperCase(), W - Math.round(160 * scale));
    nameLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * Math.round(76 * scale)));
    y += nameLines.length * Math.round(76 * scale) + Math.round(40 * scale);

    ctx.fillStyle = GOLD;
    ctx.font = `900 ${Math.round(150 * scale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(String(fmt(input.value)), W / 2, y);

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `600 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.fillText(input.category.toUpperCase(), W / 2, y + Math.round(170 * scale));
  } else if (input.kind === "premiership") {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Trophy badge.
    const badgeR = Math.round(110 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(20 * scale);
    ctx.beginPath();
    ctx.arc(W / 2, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = GOLD_SOFT;
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.stroke();
    try {
      const svg = iconSvgString(1, GOLD, 256, 1.75); // Trophy
      const iconImg = await loadImage(svgToDataUrl(svg));
      const iconSize = Math.round(120 * scale);
      ctx.drawImage(iconImg, W / 2 - iconSize / 2, badgeCy - iconSize / 2, iconSize, iconSize);
    } catch {}

    let y = badgeCy + badgeR + Math.round(28 * scale);

    ctx.fillStyle = GOLD;
    ctx.font = `800 ${Math.round(110 * scale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillText("PREMIERS", W / 2, y);
    y += Math.round(130 * scale);

    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = `700 ${Math.round(52 * scale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(`${input.grade.toUpperCase()} • ${seasonLabel(input.year)}`, W / 2, y);
    y += Math.round(64 * scale);

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `600 ${Math.round(24 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    const compLines = wrapText(ctx, input.competition, W - Math.round(200 * scale));
    compLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * Math.round(32 * scale)));
    y += compLines.length * Math.round(32 * scale) + Math.round(16 * scale);

    if (input.result) {
      ctx.fillStyle = TEXT_LIGHT;
      ctx.font = `600 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      const resLines = wrapText(ctx, input.result, W - Math.round(220 * scale));
      resLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * Math.round(30 * scale)));
      y += resLines.length * Math.round(30 * scale) + Math.round(12 * scale);
    }

    if (input.mom) {
      ctx.fillStyle = GOLD;
      ctx.font = `700 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(`PLAYER OF THE MATCH: ${input.mom.toUpperCase()}`, W / 2, y);
    }
  } else if (
    input.kind === "debut" ||
    input.kind === "newCap" ||
    input.kind === "century" ||
    input.kind === "fiveFor"
  ) {
    // Per-match highlight cards share one layout: a gold badge label, a circular
    // headshot (or icon badge fallback), the player's name in serif, a big serif
    // hero value, then a muted caption + "vs X • Round N" subtitle.
    const matchSubtitle = (
      opponent?: string | null,
      round?: number | null,
    ): string => {
      const parts: string[] = [];
      if (opponent) parts.push(`vs ${opponent}`);
      if (round != null) parts.push(`Round ${round}`);
      return parts.join(" • ");
    };

    let badgeLabel = "";
    let bigValue = "";
    let caption = "";
    let subtitle = "";
    let iconIndex = 4;
    if (input.kind === "debut") {
      badgeLabel =
        input.capNumber != null
          ? `${input.grade} Cap #${input.capNumber}`
          : `${input.grade} Debut`;
      bigValue = "DEBUT";
      caption = `First game for the ${input.grade} side`;
      const debutParts: string[] = [];
      const matchPart = matchSubtitle(input.opponent, input.round);
      if (matchPart) debutParts.push(matchPart);
      if (input.season) debutParts.push(input.season);
      subtitle = debutParts.join(" • ");
      iconIndex = 4; // Star
    } else if (input.kind === "newCap") {
      badgeLabel = `${input.grade} Cap`;
      bigValue = `#${input.capNumber}`;
      caption = `${input.grade} cap number ${input.capNumber}`;
      subtitle = input.category === "female" ? "Female A Grade" : "A Grade";
      iconIndex = 0; // Crown
    } else if (input.kind === "century") {
      badgeLabel = "Century";
      bigValue = `${input.runs}${input.notOut ? "*" : ""}`;
      caption =
        input.balls != null
          ? `${input.runs}${input.notOut ? " not out" : ""} off ${input.balls} balls`
          : `${input.runs}${input.notOut ? " not out" : ""} runs`;
      subtitle = matchSubtitle(input.opponent, input.round);
      iconIndex = 1; // Trophy
    } else {
      badgeLabel = "Five-Wicket Haul";
      bigValue = input.figures ?? `${input.wickets}/-`;
      caption =
        input.overs != null
          ? `${input.wickets} wickets off ${input.overs} overs`
          : `${input.wickets} wickets`;
      subtitle = matchSubtitle(input.opponent, input.round);
      iconIndex = 2; // Medal
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const badgeR = Math.round(130 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(30 * scale);
    if (photoImg) {
      drawCircularImage(ctx, photoImg, W / 2, badgeCy, badgeR, GOLD, Math.round(6 * scale));
      const miniR = Math.round(46 * scale);
      const miniCx = W / 2 + badgeR * 0.72;
      const miniCy = badgeCy + badgeR * 0.72;
      ctx.beginPath();
      ctx.arc(miniCx, miniCy, miniR, 0, Math.PI * 2);
      ctx.fillStyle = p.bgDark;
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = Math.round(3 * scale);
      ctx.stroke();
      try {
        const svg = iconSvgString(iconIndex, GOLD, 256, 1.75);
        const iconImg = await loadImage(svgToDataUrl(svg));
        const iconSize = Math.round(52 * scale);
        ctx.drawImage(iconImg, miniCx - iconSize / 2, miniCy - iconSize / 2, iconSize, iconSize);
      } catch {}
    } else {
      ctx.beginPath();
      ctx.arc(W / 2, badgeCy, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = GOLD_SOFT;
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 4;
      ctx.stroke();
      try {
        const svg = iconSvgString(iconIndex, GOLD, 256, 1.75);
        const iconImg = await loadImage(svgToDataUrl(svg));
        const iconSize = Math.round(150 * scale);
        ctx.drawImage(iconImg, W / 2 - iconSize / 2, badgeCy - iconSize / 2, iconSize, iconSize);
      } catch {}
    }

    ctx.fillStyle = GOLD;
    ctx.font = `800 ${Math.round(34 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    const labelY = badgeCy + badgeR + Math.round(28 * scale);
    ctx.fillText(badgeLabel.toUpperCase(), W / 2, labelY);

    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = `700 ${Math.round(58 * scale)}px Georgia, 'Times New Roman', serif`;
    const nameLines = wrapText(ctx, input.playerName.toUpperCase(), W - Math.round(200 * scale));
    const lineH = Math.round(68 * scale);
    const nameY = labelY + Math.round(56 * scale);
    nameLines.forEach((line, i) => ctx.fillText(line, W / 2, nameY + i * lineH));

    const valueY = nameY + nameLines.length * lineH + Math.round(20 * scale);
    ctx.fillStyle = GOLD;
    ctx.font = `900 ${Math.round(130 * scale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(bigValue, W / 2, valueY);

    let cY = valueY + Math.round(150 * scale);
    if (caption) {
      ctx.fillStyle = TEXT_LIGHT;
      ctx.font = `600 ${Math.round(26 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(caption, W / 2, cY);
      cY += Math.round(40 * scale);
    }
    if (subtitle) {
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = `500 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(subtitle, W / 2, cY);
    }
  }

  drawFooter(
    ctx,
    W,
    H,
    opts.clubUrl ?? "hallsheadcricket.com.au",
    opts.hashtag ?? "#HHCC",
    scale,
    p,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode PNG"));
    }, "image/png");
  });
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const cardBaseFilename = (input: ShareCardInput): string => {
  switch (input.kind) {
    case "milestone":
      return `hhcc-${slugify(input.playerName)}-${slugify(input.tierLabel)}`;
    case "player":
      return `hhcc-${slugify(input.playerName)}`;
    case "record":
      return `hhcc-record-${slugify(input.title)}-${slugify(input.playerName)}`;
    case "gradeLeader":
      return `hhcc-${slugify(input.grade)}-${slugify(input.category)}-${slugify(input.playerName)}`;
    case "premiership":
      return `hhcc-premiership-${slugify(input.grade)}-${input.year}`;
    case "debut":
      return `hhcc-debut-${slugify(input.grade)}-${slugify(input.playerName)}`;
    case "newCap":
      return `hhcc-cap-${slugify(input.grade)}-${input.capNumber}-${slugify(input.playerName)}`;
    case "century":
      return `hhcc-century-${slugify(input.playerName)}-${input.runs}`;
    case "fiveFor":
      return `hhcc-fivefor-${slugify(input.playerName)}-${input.wickets}`;
    case "matchSummary":
      return `hhcc-match-${slugify(input.club.name)}-vs-${slugify(input.opposition.name)}`;
  }
};

// --- Animated cards ----------------------------------------------------------

// The effective motion preset: an explicit option wins, else the template's own
// preset, else "none".
export const effectiveMotion = (opts: RenderOptions): MotionPreset =>
  opts.motionPreset ??
  ((opts.template?.motionPreset as MotionPreset | undefined) || "none");

// A card is animated when it has a moving background (video/GIF) or a motion
// preset other than "none".
export const isAnimatedCard = (opts: RenderOptions): boolean => {
  const kind = opts.template?.backgroundKind;
  return kind === "video" || kind === "gif" || effectiveMotion(opts) !== "none";
};

// A reusable animation: draw(ctx, t) paints the frame at progress t (0-1). Used
// by both the live preview (rAF loop) and the MediaRecorder export. Call
// cleanup() when finished to release any playing <video> elements / bitmaps.
export type AnimationHandle = {
  width: number;
  height: number;
  durationMs: number;
  loop: boolean;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
  cleanup: () => void;
};

// Animated cards are short looping clips. Clamp every duration into a sane band.
const clampDuration = (ms: number): number => Math.max(1500, Math.min(8000, ms));

// Build an animation for a card. Preloads every asset up front so each draw()
// call is synchronous and cheap (safe to run inside a rAF / capture loop).
export const prepareAnimation = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<AnimationHandle> => {
  const { w: W, h: H } = SIZES[opts.size];
  const scale = W / 1080;
  const p = resolvePalette(opts.theme);
  const motion = effectiveMotion(opts);

  // Template-based animated card: animated/still background + data-bound slots.
  if (opts.template) {
    const template = opts.template;
    const bgKind = template.backgroundKind ?? "image";
    const bg = await loadTemplateBg(template, true);
    const tctx: TemplateContext = {
      clubUrl: opts.clubUrl,
      hashtag: opts.hashtag,
      photoUrl: opts.photoUrl,
    };
    const purl = resolvePhotoField(input, tctx);
    const photoImg = purl ? await loadImage(purl).catch(() => null) : null;
    const logos = await loadSponsorLogos(opts.sponsors ?? []);

    let durationMs = motion === "none" ? 4000 : 3500;
    if (bgKind === "video" && bg?.video) {
      const vid = bg.video.duration ? bg.video.duration * 1000 : 4000;
      durationMs = clampDuration(template.backgroundDurationMs ?? vid);
    }

    return {
      width: W,
      height: H,
      durationMs,
      loop: true,
      draw: (ctx, t) =>
        drawTemplateFrame(ctx, W, H, scale, input, template, opts, p, bg, photoImg, logos, motion, t),
      cleanup: () => {
        const v = bg?.video;
        if (v) {
          v.pause();
          v.removeAttribute("src");
          v.load();
          v.remove();
        }
      },
    };
  }

  // Built-in card: render the still once, then apply a whole-card entrance.
  // A flat image can't re-count numbers, so "countUp" degrades to "fadeIn".
  const stillBlob = await renderShareCard(input, { ...opts, template: null, motionPreset: "none" });
  const bmp = await createImageBitmap(stillBlob);
  const wholeMotion: MotionPreset = motion === "countUp" ? "fadeIn" : motion;

  return {
    width: W,
    height: H,
    durationMs: 3500,
    loop: true,
    draw: (ctx, t) => {
      ctx.clearRect(0, 0, W, H);
      const e = easeOutCubic(t / 0.6);
      ctx.save();
      ctx.globalAlpha = wholeMotion === "none" ? 1 : e;
      if (wholeMotion === "slideUp") ctx.translate(0, (1 - e) * 0.05 * H);
      ctx.drawImage(bmp, 0, 0, W, H);
      ctx.restore();
    },
    cleanup: () => bmp.close(),
  };
};

// Pick the best MediaRecorder container the browser supports. MP4 is preferred
// (broad social-platform support); WebM is the universal fallback in Chromium.
export const pickVideoMime = (): { mime: string; ext: string } => {
  const supported = (m: string): boolean =>
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(m);
  if (supported("video/mp4;codecs=avc1")) return { mime: "video/mp4;codecs=avc1", ext: "mp4" };
  if (supported("video/mp4")) return { mime: "video/mp4", ext: "mp4" };
  if (supported("video/webm;codecs=vp9")) return { mime: "video/webm;codecs=vp9", ext: "webm" };
  if (supported("video/webm")) return { mime: "video/webm", ext: "webm" };
  return { mime: "", ext: "webm" };
};

// Human-facing label for the export format the current browser will produce
// (so the admin UI can document the constraint, e.g. "MP4" vs "WebM").
export const videoFormatLabel = (): string => pickVideoMime().ext.toUpperCase();

// Whether this browser can export video at all (needs MediaRecorder +
// canvas.captureStream). Lets the UI hide the video button gracefully.
export const canExportVideo = (): boolean =>
  typeof MediaRecorder !== "undefined" &&
  typeof document.createElement("canvas").captureStream === "function";

// Render a card to a downloadable video clip via canvas.captureStream +
// MediaRecorder. Returns the encoded blob and its file extension. Runs the
// animation once in real time (no loop) so the clip is a single clean pass.
export const renderShareCardVideo = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<{ blob: Blob; ext: string }> => {
  if (!canExportVideo()) {
    throw new Error("This browser can't export video (MediaRecorder unavailable).");
  }
  const anim = await prepareAnimation(input, opts);
  const canvas = document.createElement("canvas");
  canvas.width = anim.width;
  canvas.height = anim.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  // Paint the first frame before the recorder starts so the clip opens cleanly.
  anim.draw(ctx, 0);

  const { mime, ext } = pickVideoMime();
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(
    stream,
    mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined,
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime || "video/webm" }));
  });

  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const elapsed = now - start;
      anim.draw(ctx, Math.min(1, elapsed / anim.durationMs));
      if (elapsed >= anim.durationMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  anim.draw(ctx, 1);
  recorder.stop();

  const blob = await stopped;
  anim.cleanup();
  return { blob, ext };
};
