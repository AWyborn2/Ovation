import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Crown, Trophy, Medal, Award, Star, Shield, Sparkles, type LucideIcon } from "lucide-react";
import type { CardTemplate, CardLayoutLayer } from "@workspace/api-client-react";
import { HALLS_HEAD_BRAND, type HallsHeadBrand } from "@workspace/scorecard";
import {
  resolveTextField,
  resolvePhotoField,
  type TemplateContext,
} from "./card-template";
import { getSticker } from "./sticker-library";

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
      /**
       * Marks this as a JUNIOR card: it is forced to render in the junior brown
       * palette (regardless of the selected theme) and gets junior-specific
       * labels/filenames. Junior data stays isolated from senior records.
       */
      junior?: boolean;
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
      /**
       * Marks this as a JUNIOR card: forces the junior brown palette and a
       * "JUNIOR MATCH" eyebrow so junior content reads distinctly from senior.
       */
      junior?: boolean;
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

// Lighten a hex colour toward white by `amount` (0..1) — used to derive the
// slightly raised panel shade from the club's navy primary.
const lighten = (hex: string, amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const c = (n: number) => Math.round(n + (255 - n) * amount);
  return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

// The default card theme IS the official club brand (navy primary + gold
// secondary from clubs id 2, surfaced via HALLS_HEAD_BRAND). Selectable card
// themes still override these; this is the fallback so no divergent HHCC hexes
// live in the renderer. textLight is a neutral cream for legibility on navy.
const BRAND_PRIMARY = HALLS_HEAD_BRAND.primaryColour ?? "#333F48";
const BRAND_SECONDARY = HALLS_HEAD_BRAND.secondaryColour ?? "#FBAC27";
const DEFAULT_THEME: CardTheme = {
  bgDark: BRAND_PRIMARY,
  bgPanel: lighten(BRAND_PRIMARY, 0.1),
  accent: BRAND_SECONDARY,
  textLight: "#F5F2E8",
};

// Junior cards are forced to this club-brown palette (brown #42342B background +
// gold accent), regardless of any selected card theme, so junior social content
// is instantly distinguishable from the navy senior cards. Per Task #200 this
// brown branding intentionally overrides the (now-gold) junior web UI accents.
const JUNIOR_BROWN = "#42342B";
export const JUNIOR_THEME: CardTheme = {
  bgDark: JUNIOR_BROWN,
  bgPanel: lighten(JUNIOR_BROWN, 0.12),
  accent: BRAND_SECONDARY,
  textLight: "#F5EFE6",
};

// True when an input is a junior-flagged card kind.
const isJuniorInput = (input: ShareCardInput): boolean =>
  "junior" in input && input.junior === true;

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
      return input.junior ? "Junior Cricket Milestone" : "Honour Board Milestone";
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

export const seasonLabel = (year: number) =>
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
  transform?: { focalX: number; focalY: number; zoom: number } | null,
) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // Default transform (0.5, 0.5, 1) is mathematically identical to a plain
  // centred cover, so un-customised headshots stay pixel-identical.
  drawImageCoverFocal(
    ctx,
    img,
    cx - r,
    cy - r,
    r * 2,
    r * 2,
    transform?.focalX ?? 0.5,
    transform?.focalY ?? 0.5,
    transform?.zoom ?? 1,
  );
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

// --- Trading-card visual language -------------------------------------------
// Shared helpers that bring the HTML trading card's look (StatTile / SectionTitle
// / role chip) to the canvas cards: a translucent rounded stat tile with a gold
// value over a muted uppercase label, a gold-barred section heading, and a gold
// pill chip. They draw from the resolved palette, so the junior brown theme and
// custom themes still apply. Type is Montserrat to match the app + trading card.
const CARD_FONT = "'Montserrat', sans-serif";

// Shrink `weight px family` until `text` fits within maxW (down to a floor) and
// leave that font set on ctx. Returns the chosen pixel size.
const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  weight: number,
  startPx: number,
  family: string,
  floorPx = 14,
): number => {
  let size = startPx;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > floorPx && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
};

// Gold vertical bar + uppercase heading (trading-card SectionTitle). Left-aligned
// at x; returns the y just below the title row.
const drawSectionTitle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  scale: number,
  p: Palette,
): number => {
  const barW = Math.round(6 * scale);
  const barH = Math.round(30 * scale);
  ctx.beginPath();
  ctx.roundRect(x, y, barW, barH, Math.round(3 * scale));
  ctx.fillStyle = p.accent;
  ctx.fill();
  ctx.fillStyle = p.textLight;
  ctx.font = `800 ${Math.round(26 * scale)}px ${CARD_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    text.toUpperCase(),
    x + barW + Math.round(16 * scale),
    y + barH / 2 + Math.round(1 * scale),
  );
  return y + barH + Math.round(22 * scale);
};

// Translucent rounded stat tile: gold value over a muted uppercase label, both
// centred in the rect (mirrors the trading-card StatTile). `big` enlarges type.
const drawStatTile = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string | number,
  label: string,
  scale: number,
  p: Palette,
  big = false,
): void => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.round(16 * scale));
  ctx.fillStyle = rgba(p.textLight, 0.06);
  ctx.fill();
  ctx.strokeStyle = rgba(p.textLight, 0.1);
  ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
  ctx.stroke();

  const cx = x + w / 2;
  const innerW = w - Math.round(28 * scale);
  const labelPx = Math.round((big ? 22 : 18) * scale);
  const gap = Math.round(12 * scale);
  const valPx = fitFontSize(
    ctx,
    String(fmt(value)),
    innerW,
    900,
    Math.round((big ? 62 : 46) * scale),
    CARD_FONT,
  );
  const blockH = valPx + gap + labelPx;
  const top = y + (h - blockH) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = p.accent;
  ctx.fillText(String(fmt(value)), cx, top);
  ctx.fillStyle = p.textMuted;
  ctx.font = `700 ${labelPx}px ${CARD_FONT}`;
  ctx.fillText(label.toUpperCase(), cx, top + valPx + gap);
};

// Centred rounded pill chip. `filled` = solid gold with dark text; otherwise a
// soft-gold fill with a gold outline + gold text. Returns its bottom y.
const drawPill = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  text: string,
  scale: number,
  p: Palette,
  filled = false,
): number => {
  const label = text.toUpperCase();
  const sidePad = Math.round(24 * scale);
  const maxPillW = ctx.canvas.width - Math.round(160 * scale);
  const fontPx = fitFontSize(ctx, label, maxPillW - sidePad * 2, 800, Math.round(22 * scale), CARD_FONT);
  ctx.font = `800 ${fontPx}px ${CARD_FONT}`;
  const tw = ctx.measureText(label).width;
  const h = Math.round(46 * scale);
  const w = Math.min(maxPillW, tw + sidePad * 2);
  const x = cx - w / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  if (filled) {
    ctx.fillStyle = p.accent;
    ctx.fill();
    ctx.fillStyle = p.bgDark;
  } else {
    ctx.fillStyle = p.accentSoft;
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
    ctx.stroke();
    ctx.fillStyle = p.accent;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, y + h / 2 + Math.round(1 * scale));
  return y + h;
};

// Built-in motion presets applied to a card.
// - "none"    — still card (no animation).
// - "fadeIn"  — whole-card fade (all elements together — the simple case).
// - "slideUp" — whole-card rise + fade (all elements together).
// - "popIn"   — each element scales/pops in independently, staggered.
// - "wipe"    — each element is revealed left→right, staggered.
// - "stagger" — each element slides up + fades in one-by-one (staggered list).
// - "countUp" — each element fades in and numeric values tick up from zero.
// On built-in cards every preset now animates the real layer model, so elements
// can enter independently; fadeIn/slideUp keep zero stagger for the simple case.
export type MotionPreset =
  | "none"
  | "fadeIn"
  | "slideUp"
  | "popIn"
  | "wipe"
  | "stagger"
  | "countUp";

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

export type RenderOptions = {
  size: CardSize;
  sponsors?: CardSponsor[];
  clubUrl?: string;
  hashtag?: string;
  theme?: CardTheme | null;
  /**
   * Official club brand (logo + colours) from the clubs register, sourced from
   * the social-settings bundle. The renderer uses its logo when no theme logo is
   * set; falls back to the built-in HALLS_HEAD_BRAND when omitted.
   */
  brand?: HallsHeadBrand | null;
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
  /**
   * Total clip length in milliseconds for animated cards (preview + video + GIF
   * export). Clamped to a safe band (see `clampDuration`) and defaulted to
   * `DEFAULT_DURATION_MS` when omitted. Ignored by the still PNG renderer.
   */
  durationMs?: number;
  /**
   * Animation speed multiplier (0.5 = slow … 2 = fast, 1 = default). Compresses
   * each element's entrance + the per-element stagger so the motion finishes
   * sooner (and holds longer) without changing the clip length. Clamped 0.5–2.
   */
  speed?: number;
  /**
   * A saved per-card-kind layer layout from the card design studio. When present
   * (and non-empty), each built-in element is repositioned/restacked/hidden by
   * its matching `element` entry and any `image`/`sticker`/`text` entries are
   * drawn as extra layers. Omitted / empty = the pixel-identical built-in layout.
   * Ignored for matchSummary + custom-template cards (they keep their own paths).
   */
  layout?: CardLayoutLayer[] | null;
  /**
   * Background music for animated VIDEO export (and the live preview's optional
   * sound toggle). Admin-authored only; omitted / null = silent (unchanged).
   * `url` is a storage object path served via /api/storage. The clip uses a
   * window of the track starting at `trimStartMs`, looped if shorter than the
   * clip. Ignored by the still PNG renderer and the GIF export (GIF has no
   * audio). A failed load degrades gracefully to a silent clip — never throws.
   */
  audio?: CardAudioSpec | null;
};

/** Resolved background-music selection for an animated clip. */
export type CardAudioSpec = {
  /** Storage object path (served via /api/storage/...). */
  url: string;
  /** Playback gain, 0–1 (1 = full track volume). */
  volume: number;
  /** Offset into the source track where the clip's audio window begins (ms). */
  trimStartMs: number;
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
// Overshoot ease for the "popIn" preset (settles slightly past 1 then back).
const easeOutBack = (n: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(n);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Scale a stat value for the count-up preset. Numbers tick from 0→full; strings
// (e.g. "3/22", "1,234 runs") scale their first numeric run via applyCountUp so
// drawCount(1) renders identically to the static draw (rest-frame parity).
const countValue = (v: string | number, frac: number): string | number =>
  typeof v === "number" ? Math.round(v * clamp01(frac)) : applyCountUp(v, frac);

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
  // Layer templates (source="layers") carry no background image.
  if (!template.backgroundImageUrl) return null;
  const bgUrl = template.backgroundImageUrl;
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
      video.src = bgUrl;
    });
  }
  const img = await loadImage(bgUrl).catch(() => null);
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
  speed: number = 1,
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

    // Per-slot entrance progress. fadeIn/slideUp move as one block (no spread);
    // popIn/wipe/countUp spread a little, stagger spreads more. Window + spread
    // shrink with speed so faster = snappier. Motion "none" shows everything.
    const spread =
      (motion === "stagger"
        ? 0.55
        : motion === "popIn" || motion === "wipe" || motion === "countUp"
          ? 0.3
          : motion === "slideUp" || motion === "fadeIn"
            ? 0
            : 0) / speed;
    const win = 0.6 / speed;
    const start = slots.length > 1 ? (i / slots.length) * spread : 0;
    const localRaw = clamp01((t - start) / win);
    const local = easeOutCubic(localRaw);
    const alpha = motion === "none" ? 1 : local;
    if (alpha <= 0) return;

    ctx.save();
    if (motion === "popIn") {
      const s = easeOutBack(localRaw);
      const ccx = cx + cw / 2;
      const ccy = cy + ch / 2;
      ctx.globalAlpha = local;
      ctx.translate(ccx, ccy);
      ctx.scale(s, s);
      ctx.translate(-ccx, -ccy);
    } else if (motion === "wipe") {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.rect(cx, cy, Math.max(1, cw * local), ch);
      ctx.clip();
    } else {
      ctx.globalAlpha = alpha;
      if (motion === "slideUp" || motion === "stagger") ctx.translate(0, (1 - local) * 0.06 * H);
    }

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
  ctx.fillText(input.junior ? "JUNIOR MATCH" : "MATCH SUMMARY", W / 2, y);
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

type PxRect = { x: number; y: number; w: number; h: number };

type RenderLayer = {
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
  fontFamily?: "sans" | "serif";
  uppercase?: boolean;
  // libsticker layers: which catalog asset, and (for data-bound badges) which
  // card field auto-fills the text slot.
  assetId?: string;
  field?: string;
  effects?: LayerEffects;
};

// Shared asset preload for the standard body (theme bg, player photo, club logo).
// Mirrors the inline loading the renderer used before the layer refactor so the
// editor (computeCardLayers) and the renderer build from identical inputs.
type CardAssets = {
  bgImg: HTMLImageElement | null;
  featureImg: HTMLImageElement | null;
  photoImg: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
  // An admin-uploaded full-bleed background image stored on the Background
  // layer (saved layout). When present it replaces the theme background.
  customBg: { img: HTMLImageElement; focalX: number; focalY: number; zoom: number } | null;
};

const loadCardAssets = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<CardAssets> => {
  const bgImg = opts.theme?.backgroundImageUrl
    ? await loadImage(opts.theme.backgroundImageUrl).catch(() => null)
    : null;
  // The Background layer may carry an uploaded image (url/focal/zoom) in the
  // saved layout. Geometry is never persisted for it (locked full-bleed), only
  // the image fields, so we draw it cover-focal across the whole card.
  const savedBg = opts.layout?.find(
    (l) => l.kind === "element" && l.id === "background" && !!l.url,
  );
  const customBgImg = savedBg?.url
    ? await loadImage(savedBg.url).catch(() => null)
    : null;
  const customBg = customBgImg
    ? {
        img: customBgImg,
        focalX: savedBg!.focalX ?? 0.5,
        focalY: savedBg!.focalY ?? 0.5,
        zoom: savedBg!.zoom ?? 1,
      }
    : null;
  const placement: PhotoPlacement = opts.photoPlacement ?? "headshot";
  const photoUrl =
    opts.photoUrl !== undefined
      ? opts.photoUrl
      : "photoUrl" in input
        ? input.photoUrl
        : null;
  const loadedPhoto = photoUrl ? await loadImage(photoUrl).catch(() => null) : null;
  const featureImg = placement === "feature" ? loadedPhoto : null;
  const photoImg = placement === "feature" ? null : loadedPhoto;
  const logoSrc =
    opts.theme?.logoUrl || opts.brand?.logoUrl || HALLS_HEAD_BRAND.logoUrl || "";
  const logoImg = logoSrc ? await loadImage(logoSrc).catch(() => null) : null;
  return { bgImg, featureImg, photoImg, logoImg, customBg };
};

// Synchronous header draw using a preloaded logo (mirrors the async drawHeader
// success + fallback branches exactly so the layer output is pixel-identical).
const drawHeaderWith = (
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  scale: number,
  p: Palette,
) => {
  const pad = Math.round(80 * scale);
  const topY = Math.round(80 * scale);
  if (logo) {
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
  } else {
    ctx.fillStyle = p.textLight;
    ctx.font = `700 ${Math.round(36 * scale)}px Georgia, serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("HALLS HEAD CRICKET CLUB", pad, topY + Math.round(10 * scale));
  }
};

// Build the ordered built-in layer list for a standard card. Pure layout: it
// measures with an offscreen ctx (`m`) and captures closures; the caller runs
// drawLayers. Geometry mirrors the pre-refactor renderShareCard exactly.
const buildLayers = (
  input: ShareCardInput,
  opts: RenderOptions,
  p: Palette,
  W: number,
  H: number,
  scale: number,
  assets: CardAssets,
): RenderLayer[] => {
  const { bgImg, featureImg, photoImg, logoImg, customBg } = assets;
  // Priority for the full-bleed background: an admin-uploaded custom image wins,
  // then a feature-placement hero photo, then the theme texture. The custom and
  // feature images both use the "hero" scrim so foreground text stays legible.
  const heroImg = customBg?.img ?? featureImg ?? bgImg;
  const heroFeature = !!(customBg || featureImg);
  const heroTransform: PhotoTransform | null | undefined = customBg
    ? { focalX: customBg.focalX, focalY: customBg.focalY, zoom: customBg.zoom }
    : featureImg
      ? opts.photoTransform
      : undefined;
  const GOLD = p.accent;
  const GOLD_SOFT = p.accentSoft;
  const TEXT_LIGHT = p.textLight;
  const TEXT_MUTED = p.textMuted;

  const mc = document.createElement("canvas");
  mc.width = W;
  mc.height = H;
  const m = mc.getContext("2d")!;

  const layers: RenderLayer[] = [];
  const add = (
    l: Omit<RenderLayer, "z" | "rect" | "hidden" | "drawsAtNatural"> & {
      hidden?: boolean;
      drawsAtNatural?: boolean;
    },
  ) => {
    layers.push({
      ...l,
      // Every selectable element gets resize handles (task requirement: any
      // element is resizable); non-selectable chrome (background) stays fixed.
      resizable: l.selectable,
      rect: { ...l.natural },
      z: layers.length,
      hidden: l.hidden ?? false,
      drawsAtNatural: l.drawsAtNatural ?? true,
    });
  };

  // The built-in headshot photo layer: carries a mutable photoTransform that the
  // editor (via applyLayout) can override for focal-point repositioning + zoom.
  const addPhoto = (natural: PxRect, ringWidth: number) => {
    const layer: RenderLayer = {
      id: "photo",
      editKind: "element",
      label: "Photo",
      natural,
      rect: { ...natural },
      vAnchor: "top",
      z: layers.length,
      hidden: false,
      selectable: true,
      resizable: true,
      drawsAtNatural: true,
      photoTransform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      draw: (ctx) =>
        drawCircularImage(
          ctx,
          photoImg!,
          natural.x + natural.w / 2,
          natural.y + natural.h / 2,
          natural.w / 2,
          GOLD,
          ringWidth,
          layer.photoTransform,
        ),
    };
    layers.push(layer);
  };

  // --- Background -----------------------------------------------------------
  add({
    id: "background",
    editKind: "element",
    // When a full-bleed hero/feature photo backs the card, label it as such so
    // admins can find it in the layer list and apply effects (tone/gradient/mask).
    label: featureImg ? "Feature photo" : "Background",
    natural: { x: 0, y: 0, w: W, h: H },
    vAnchor: "top",
    selectable: false,
    resizable: false,
    draw: (ctx) => drawBackground(ctx, W, H, p, heroImg, heroFeature, heroTransform),
  });

  // --- Header ---------------------------------------------------------------
  const pad = Math.round(80 * scale);
  const topY = Math.round(80 * scale);
  const logoH = Math.round(110 * scale);
  const headerEnd = logoImg
    ? topY + logoH + Math.round(40 * scale)
    : topY + Math.round(80 * scale);
  add({
    id: "header",
    editKind: "element",
    label: "Club header",
    natural: {
      x: pad,
      y: topY,
      w: W - pad * 2,
      h: logoImg ? logoH : Math.round(80 * scale),
    },
    vAnchor: "top",
    selectable: true,
    resizable: false,
    draw: (ctx) => drawHeaderWith(ctx, logoImg, scale, p),
  });

  // --- Headline ribbon ------------------------------------------------------
  const ribbonH = Math.round(60 * scale);
  const headline = headlineFor(input);
  add({
    id: "ribbon",
    editKind: "element",
    label: "Headline ribbon",
    natural: { x: pad, y: headerEnd, w: W - pad * 2, h: ribbonH },
    vAnchor: "top",
    selectable: true,
    resizable: false,
    draw: (ctx) => {
      drawRibbon(ctx, W, headerEnd, headline, scale, p);
    },
  });
  const ribbonEnd = headerEnd + ribbonH + Math.round(40 * scale);

  // --- Sponsors (bottom chrome; only when present) --------------------------
  const sponsors = opts.sponsors ?? [];
  let sponsorsTop: number;
  if (sponsors.length > 0) {
    const stripH = Math.round(110 * scale);
    const stripY = H - stripH - Math.round(40 * scale);
    sponsorsTop = stripY - Math.round(20 * scale);
    add({
      id: "sponsors",
      editKind: "element",
      label: "Sponsors",
      natural: {
        x: Math.round(56 * scale),
        y: stripY,
        w: W - Math.round(112 * scale),
        h: stripH,
      },
      vAnchor: "bottom",
      selectable: true,
      resizable: false,
      draw: async (ctx) => {
        await drawSponsors(ctx, W, H, sponsors, scale, p);
      },
    });
  } else {
    sponsorsTop = H - Math.round(70 * scale);
  }

  const bodyTop = ribbonEnd;
  const bodyBottom = sponsorsTop;

  // --- Per-kind body --------------------------------------------------------
  if (input.kind === "milestone") {
    const tierIndex = input.tierIndex;
    const tierLabel = input.tierLabel;
    const playerName = input.playerName;
    const currentValue = input.currentValue;
    const milestoneLabel = input.milestoneLabel;
    const threshold = input.threshold;

    const badgeR = Math.round(130 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(30 * scale);
    add({
      id: "badge",
      editKind: "element",
      label: "Badge",
      natural: { x: W / 2 - badgeR, y: badgeCy - badgeR, w: badgeR * 2, h: badgeR * 2 },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: async (ctx) => {
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
            const svg = iconSvgString(tierIndex, GOLD, 256, 1.75);
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
            const svg = iconSvgString(tierIndex, GOLD, 256, 1.75);
            const iconImg = await loadImage(svgToDataUrl(svg));
            const iconSize = Math.round(150 * scale);
            ctx.drawImage(iconImg, W / 2 - iconSize / 2, badgeCy - iconSize / 2, iconSize, iconSize);
          } catch {}
        }
      },
    });

    let y = badgeCy + badgeR + Math.round(28 * scale);
    const pillTop = y;
    const pillSide = Math.round(24 * scale);
    const pillMaxW = W - Math.round(160 * scale);
    const pillFp = fitFontSize(m, tierLabel.toUpperCase(), pillMaxW - pillSide * 2, 800, Math.round(22 * scale), CARD_FONT);
    m.font = `800 ${pillFp}px ${CARD_FONT}`;
    const pillW = Math.min(pillMaxW, m.measureText(tierLabel.toUpperCase()).width + pillSide * 2);
    const pillH = Math.round(46 * scale);
    add({
      id: "tier",
      editKind: "element",
      label: "Tier pill",
      natural: { x: W / 2 - pillW / 2, y: pillTop, w: pillW, h: pillH },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        drawPill(ctx, W / 2, pillTop, tierLabel, scale, p, true);
      },
    });
    y = pillTop + pillH + Math.round(30 * scale);

    const mPad = Math.round(100 * scale);
    const nameUpper = playerName.toUpperCase();
    const namePx = fitFontSize(m, nameUpper, W - mPad * 2, 900, Math.round(64 * scale), CARD_FONT);
    const lineH = Math.round(namePx * 1.08);
    const nameLines = wrapText(m, nameUpper, W - mPad * 2);
    const nameTop = y;
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: { x: mPad, y: nameTop, w: W - mPad * 2, h: nameLines.length * lineH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const px = fitFontSize(ctx, nameUpper, W - mPad * 2, 900, Math.round(64 * scale), CARD_FONT);
        const lh = Math.round(px * 1.08);
        const lines = wrapText(ctx, nameUpper, W - mPad * 2);
        lines.forEach((line, i) => ctx.fillText(line, W / 2, nameTop + i * lh));
      },
    });
    y = nameTop + nameLines.length * lineH + Math.round(28 * scale);

    const tileW = Math.min(W - mPad * 2, Math.round(640 * scale));
    const tileH = Math.round(190 * scale);
    const tileTop = y;
    add({
      id: "value",
      editKind: "element",
      label: "Value tile",
      natural: { x: W / 2 - tileW / 2, y: tileTop, w: tileW, h: tileH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      numeric: true,
      draw: (ctx) =>
        drawStatTile(ctx, W / 2 - tileW / 2, tileTop, tileW, tileH, currentValue, milestoneLabel, scale, p, true),
      drawCount: (ctx, frac) =>
        drawStatTile(ctx, W / 2 - tileW / 2, tileTop, tileW, tileH, countValue(currentValue, frac), milestoneLabel, scale, p, true),
    });
    y = tileTop + tileH + Math.round(28 * scale);

    if (threshold && threshold > 0) {
      const capTop = y;
      add({
        id: "threshold",
        editKind: "element",
        label: "Threshold caption",
        natural: { x: mPad, y: capTop, w: W - mPad * 2, h: Math.round(30 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = TEXT_MUTED;
          ctx.font = `500 ${Math.round(24 * scale)}px ${CARD_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(`Past the ${fmt(threshold)} ${milestoneLabel.toLowerCase()} mark`, W / 2, capTop);
        },
      });
    }
  } else if (input.kind === "player") {
    const playerName = input.playerName;
    const gradesPlayed = input.gradesPlayed;
    const allStats = input.stats;
    const padP = Math.round(100 * scale);
    let y = bodyTop + Math.round(24 * scale);
    if (photoImg) {
      const r = Math.round(140 * scale);
      const cy = y + r;
      addPhoto({ x: W / 2 - r, y: cy - r, w: r * 2, h: r * 2 }, Math.round(6 * scale));
      y = cy + r + Math.round(30 * scale);
    }
    const nameUpper = playerName.toUpperCase();
    const namePx = fitFontSize(m, nameUpper, W - padP * 2, 900, Math.round(78 * scale), CARD_FONT);
    const nameLines = wrapText(m, nameUpper, W - padP * 2);
    const lineH = Math.round(namePx * 1.05);
    const nameTop = y;
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: { x: padP, y: nameTop, w: W - padP * 2, h: nameLines.length * lineH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const px = fitFontSize(ctx, nameUpper, W - padP * 2, 900, Math.round(78 * scale), CARD_FONT);
        const lh = Math.round(px * 1.05);
        const lines = wrapText(ctx, nameUpper, W - padP * 2);
        lines.forEach((l, i) => ctx.fillText(l, W / 2, nameTop + i * lh));
      },
    });
    y = nameTop + nameLines.length * lineH + Math.round(20 * scale);

    if (gradesPlayed) {
      const pillTop = y;
      const pillSide = Math.round(24 * scale);
      const pillMaxW = W - Math.round(160 * scale);
      const pillFp = fitFontSize(m, gradesPlayed.toUpperCase(), pillMaxW - pillSide * 2, 800, Math.round(22 * scale), CARD_FONT);
      m.font = `800 ${pillFp}px ${CARD_FONT}`;
      const pillW = Math.min(pillMaxW, m.measureText(gradesPlayed.toUpperCase()).width + pillSide * 2);
      const pillH = Math.round(46 * scale);
      add({
        id: "grades",
        editKind: "element",
        label: "Grades pill",
        natural: { x: W / 2 - pillW / 2, y: pillTop, w: pillW, h: pillH },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          drawPill(ctx, W / 2, pillTop, gradesPlayed, scale, p);
        },
      });
      y = pillTop + pillH + Math.round(34 * scale);
    }

    let stats = allStats.slice(0, 6);
    if (stats.length > 0) {
      const titleTop = y;
      add({
        id: "statsTitle",
        editKind: "element",
        label: "Statistics title",
        natural: { x: padP, y: titleTop, w: W - padP * 2, h: Math.round(30 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          drawSectionTitle(ctx, padP, titleTop, "Career Statistics", scale, p);
        },
      });
      y = titleTop + Math.round(30 * scale) + Math.round(22 * scale);
      const cols = 2;
      const gridGap = Math.round(20 * scale);
      const gridW = W - padP * 2;
      const tileW = (gridW - gridGap * (cols - 1)) / cols;
      const maxGridH = bodyBottom - y - Math.round(20 * scale);
      const minTileH = Math.round(78 * scale);
      while (stats.length > 2) {
        const rows = Math.ceil(stats.length / cols);
        if (rows * minTileH + gridGap * (rows - 1) <= maxGridH) break;
        stats = stats.slice(0, stats.length - 2);
      }
      const rows = Math.ceil(stats.length / cols);
      const tileH = Math.max(
        minTileH,
        Math.min(Math.round(150 * scale), (maxGridH - gridGap * (rows - 1)) / rows),
      );
      stats.forEach((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const tx = padP + col * (tileW + gridGap);
        const ty = y + row * (tileH + gridGap);
        add({
          id: `stat:${i}`,
          editKind: "element",
          label: `Stat: ${s.label}`,
          natural: { x: tx, y: ty, w: tileW, h: tileH },
          vAnchor: "top",
          selectable: true,
          resizable: true,
          numeric: true,
          draw: (ctx) => drawStatTile(ctx, tx, ty, tileW, tileH, s.value, s.label, scale, p, false),
          drawCount: (ctx, frac) =>
            drawStatTile(ctx, tx, ty, tileW, tileH, countValue(s.value, frac), s.label, scale, p, false),
        });
      });
    }
  } else if (input.kind === "record") {
    const title = input.title;
    const playerName = input.playerName;
    const value = input.value;
    const grade = input.grade;
    let y = bodyTop + Math.round(30 * scale);
    if (photoImg) {
      const r = Math.round(70 * scale);
      const cy = y + r;
      addPhoto({ x: W / 2 - r, y: cy - r, w: r * 2, h: r * 2 }, Math.round(4 * scale));
      y = cy + r + Math.round(24 * scale);
    }
    const titleTop = y;
    add({
      id: "title",
      editKind: "element",
      label: "Title",
      natural: { x: Math.round(80 * scale), y: titleTop, w: W - Math.round(160 * scale), h: Math.round(40 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = GOLD;
        ctx.font = `800 ${Math.round(28 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(title.toUpperCase(), W / 2, titleTop);
      },
    });
    y = titleTop + Math.round(60 * scale);
    const valueTop = y;
    const drawRecordValue = (ctx: CanvasRenderingContext2D, v: string | number) => {
      ctx.fillStyle = TEXT_LIGHT;
      ctx.font = `900 ${Math.round(180 * scale)}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(fmt(v)), W / 2, valueTop);
    };
    add({
      id: "value",
      editKind: "element",
      label: "Value",
      natural: { x: 0, y: valueTop, w: W, h: Math.round(180 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      numeric: true,
      draw: (ctx) => drawRecordValue(ctx, value),
      drawCount: (ctx, frac) => drawRecordValue(ctx, countValue(value, frac)),
    });
    y = valueTop + Math.round(200 * scale);
    m.font = `700 ${Math.round(48 * scale)}px Georgia, 'Times New Roman', serif`;
    const nameLines = wrapText(m, playerName.toUpperCase(), W - Math.round(160 * scale));
    const nameTop = y;
    const nameBlockH = nameLines.length * Math.round(56 * scale) + (grade ? Math.round(46 * scale) : 0);
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: { x: Math.round(80 * scale), y: nameTop, w: W - Math.round(160 * scale), h: nameBlockH },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.font = `700 ${Math.round(48 * scale)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const lines = wrapText(ctx, playerName.toUpperCase(), W - Math.round(160 * scale));
        lines.forEach((l, i) => ctx.fillText(l, W / 2, nameTop + i * Math.round(56 * scale)));
        if (grade) {
          ctx.fillStyle = TEXT_MUTED;
          ctx.font = `600 ${Math.round(20 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
          ctx.fillText(grade.toUpperCase(), W / 2, nameTop + lines.length * Math.round(56 * scale) + Math.round(20 * scale));
        }
      },
    });
  } else if (input.kind === "gradeLeader") {
    const grade = input.grade;
    const category = input.category;
    const playerName = input.playerName;
    const value = input.value;
    let y = bodyTop + Math.round(40 * scale);
    if (photoImg) {
      const r = Math.round(70 * scale);
      const cy = y + r;
      add({
        id: "photo",
        editKind: "element",
        label: "Photo",
        natural: { x: W / 2 - r, y: cy - r, w: r * 2, h: r * 2 },
        vAnchor: "top",
        selectable: true,
        resizable: true,
        draw: (ctx) => drawCircularImage(ctx, photoImg, W / 2, cy, r, GOLD, Math.round(4 * scale)),
      });
      y = cy + r + Math.round(24 * scale);
    }
    const titleTop = y;
    add({
      id: "title",
      editKind: "element",
      label: "Title",
      natural: { x: Math.round(80 * scale), y: titleTop, w: W - Math.round(160 * scale), h: Math.round(40 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = GOLD;
        ctx.font = `800 ${Math.round(28 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${grade.toUpperCase()} • LEADING ${category.toUpperCase()}`, W / 2, titleTop);
      },
    });
    y = titleTop + Math.round(80 * scale);
    m.font = `700 ${Math.round(68 * scale)}px Georgia, 'Times New Roman', serif`;
    const nameLines = wrapText(m, playerName.toUpperCase(), W - Math.round(160 * scale));
    const nameTop = y;
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: { x: Math.round(80 * scale), y: nameTop, w: W - Math.round(160 * scale), h: nameLines.length * Math.round(76 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.font = `700 ${Math.round(68 * scale)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const lines = wrapText(ctx, playerName.toUpperCase(), W - Math.round(160 * scale));
        lines.forEach((l, i) => ctx.fillText(l, W / 2, nameTop + i * Math.round(76 * scale)));
      },
    });
    y = nameTop + nameLines.length * Math.round(76 * scale) + Math.round(40 * scale);
    const valueTop = y;
    const drawLeaderValue = (ctx: CanvasRenderingContext2D, v: string | number) => {
      ctx.fillStyle = GOLD;
      ctx.font = `900 ${Math.round(150 * scale)}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(fmt(v)), W / 2, valueTop);
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = `600 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.fillText(category.toUpperCase(), W / 2, valueTop + Math.round(170 * scale));
    };
    add({
      id: "value",
      editKind: "element",
      label: "Value",
      natural: { x: 0, y: valueTop, w: W, h: Math.round(200 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      numeric: true,
      draw: (ctx) => drawLeaderValue(ctx, value),
      drawCount: (ctx, frac) => drawLeaderValue(ctx, countValue(value, frac)),
    });
  } else if (input.kind === "premiership") {
    const grade = input.grade;
    const year = input.year;
    const competition = input.competition;
    const result = input.result;
    const mom = input.mom;

    const badgeR = Math.round(110 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(20 * scale);
    add({
      id: "badge",
      editKind: "element",
      label: "Trophy badge",
      natural: { x: W / 2 - badgeR, y: badgeCy - badgeR, w: badgeR * 2, h: badgeR * 2 },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: async (ctx) => {
        ctx.beginPath();
        ctx.arc(W / 2, badgeCy, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = GOLD_SOFT;
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 4;
        ctx.stroke();
        try {
          const svg = iconSvgString(1, GOLD, 256, 1.75);
          const iconImg = await loadImage(svgToDataUrl(svg));
          const iconSize = Math.round(120 * scale);
          ctx.drawImage(iconImg, W / 2 - iconSize / 2, badgeCy - iconSize / 2, iconSize, iconSize);
        } catch {}
      },
    });
    let y = badgeCy + badgeR + Math.round(28 * scale);
    const premTop = y;
    add({
      id: "premiers",
      editKind: "element",
      label: "Premiers heading",
      natural: { x: 0, y: premTop, w: W, h: Math.round(110 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: (ctx) => {
        ctx.fillStyle = GOLD;
        ctx.font = `800 ${Math.round(110 * scale)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("PREMIERS", W / 2, premTop);
      },
    });
    y = premTop + Math.round(130 * scale);
    const gsTop = y;
    add({
      id: "gradeSeason",
      editKind: "element",
      label: "Grade • Season",
      natural: { x: 0, y: gsTop, w: W, h: Math.round(52 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.font = `700 ${Math.round(52 * scale)}px Georgia, 'Times New Roman', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${grade.toUpperCase()} • ${seasonLabel(year)}`, W / 2, gsTop);
      },
    });
    y = gsTop + Math.round(64 * scale);
    m.font = `600 ${Math.round(24 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
    const compLines = wrapText(m, competition, W - Math.round(200 * scale));
    const compTop = y;
    add({
      id: "competition",
      editKind: "element",
      label: "Competition",
      natural: { x: Math.round(100 * scale), y: compTop, w: W - Math.round(200 * scale), h: compLines.length * Math.round(32 * scale) },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_MUTED;
        ctx.font = `600 ${Math.round(24 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const lines = wrapText(ctx, competition, W - Math.round(200 * scale));
        lines.forEach((l, i) => ctx.fillText(l, W / 2, compTop + i * Math.round(32 * scale)));
      },
    });
    y = compTop + compLines.length * Math.round(32 * scale) + Math.round(16 * scale);
    if (result) {
      m.font = `600 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
      const resLines = wrapText(m, result, W - Math.round(220 * scale));
      const resTop = y;
      add({
        id: "result",
        editKind: "element",
        label: "Result",
        natural: { x: Math.round(110 * scale), y: resTop, w: W - Math.round(220 * scale), h: resLines.length * Math.round(30 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = TEXT_LIGHT;
          ctx.font = `600 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const lines = wrapText(ctx, result, W - Math.round(220 * scale));
          lines.forEach((l, i) => ctx.fillText(l, W / 2, resTop + i * Math.round(30 * scale)));
        },
      });
      y = resTop + resLines.length * Math.round(30 * scale) + Math.round(12 * scale);
    }
    if (mom) {
      const momTop = y;
      add({
        id: "mom",
        editKind: "element",
        label: "Player of the match",
        natural: { x: Math.round(80 * scale), y: momTop, w: W - Math.round(160 * scale), h: Math.round(30 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = GOLD;
          ctx.font = `700 ${Math.round(22 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(`PLAYER OF THE MATCH: ${mom.toUpperCase()}`, W / 2, momTop);
        },
      });
    }
  } else if (
    input.kind === "debut" ||
    input.kind === "newCap" ||
    input.kind === "century" ||
    input.kind === "fiveFor"
  ) {
    const playerName = input.playerName;
    const matchSubtitle = (opponent?: string | null, round?: number | null): string => {
      const parts: string[] = [];
      if (opponent) parts.push(`vs ${opponent}`);
      if (round != null) parts.push(`Round ${round}`);
      return parts.join(" • ");
    };
    let badgeLabel = "";
    let bigValue = "";
    let caption = "";
    let subtitle = "";
    let tileLabel = "";
    let iconIndex = 4;
    if (input.kind === "debut") {
      badgeLabel =
        input.capNumber != null ? `${input.grade} Cap #${input.capNumber}` : `${input.grade} Debut`;
      bigValue = "DEBUT";
      caption = `First game for the ${input.grade} side`;
      const debutParts: string[] = [];
      const matchPart = matchSubtitle(input.opponent, input.round);
      if (matchPart) debutParts.push(matchPart);
      if (input.season) debutParts.push(input.season);
      subtitle = debutParts.join(" • ");
      tileLabel = input.grade;
      iconIndex = 4;
    } else if (input.kind === "newCap") {
      badgeLabel = `${input.grade} Cap`;
      bigValue = `#${input.capNumber}`;
      caption = `${input.grade} cap number ${input.capNumber}`;
      subtitle = input.category === "female" ? "Female A Grade" : "A Grade";
      tileLabel = "Cap Number";
      iconIndex = 0;
    } else if (input.kind === "century") {
      badgeLabel = "Century";
      bigValue = `${input.runs}${input.notOut ? "*" : ""}`;
      caption =
        input.balls != null
          ? `${input.runs}${input.notOut ? " not out" : ""} off ${input.balls} balls`
          : `${input.runs}${input.notOut ? " not out" : ""} runs`;
      subtitle = matchSubtitle(input.opponent, input.round);
      tileLabel = "Runs";
      iconIndex = 1;
    } else {
      badgeLabel = "Five-Wicket Haul";
      bigValue = input.figures ?? `${input.wickets}/-`;
      caption =
        input.overs != null ? `${input.wickets} wickets off ${input.overs} overs` : `${input.wickets} wickets`;
      subtitle = matchSubtitle(input.opponent, input.round);
      tileLabel = "Figures";
      iconIndex = 2;
    }

    const badgeR = Math.round(130 * scale);
    const badgeCy = bodyTop + badgeR + Math.round(30 * scale);
    add({
      id: "badge",
      editKind: "element",
      label: "Badge",
      natural: { x: W / 2 - badgeR, y: badgeCy - badgeR, w: badgeR * 2, h: badgeR * 2 },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: async (ctx) => {
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
      },
    });

    let y = badgeCy + badgeR + Math.round(26 * scale);
    const pillTop = y;
    const pillSide = Math.round(24 * scale);
    const pillMaxW = W - Math.round(160 * scale);
    const pillFp = fitFontSize(m, badgeLabel.toUpperCase(), pillMaxW - pillSide * 2, 800, Math.round(22 * scale), CARD_FONT);
    m.font = `800 ${pillFp}px ${CARD_FONT}`;
    const pillW = Math.min(pillMaxW, m.measureText(badgeLabel.toUpperCase()).width + pillSide * 2);
    const pillH = Math.round(46 * scale);
    add({
      id: "badgeLabel",
      editKind: "element",
      label: "Badge label",
      natural: { x: W / 2 - pillW / 2, y: pillTop, w: pillW, h: pillH },
      vAnchor: "top",
      selectable: true,
      resizable: false,
      draw: (ctx) => {
        drawPill(ctx, W / 2, pillTop, badgeLabel, scale, p, true);
      },
    });
    y = pillTop + pillH + Math.round(28 * scale);

    const hPad = Math.round(100 * scale);
    const nameUpper = playerName.toUpperCase();
    const namePx = fitFontSize(m, nameUpper, W - hPad * 2, 900, Math.round(60 * scale), CARD_FONT);
    const lineH = Math.round(namePx * 1.08);
    const nameLines = wrapText(m, nameUpper, W - hPad * 2);
    const nameTop = y;
    add({
      id: "name",
      editKind: "element",
      label: "Name",
      natural: { x: hPad, y: nameTop, w: W - hPad * 2, h: nameLines.length * lineH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      draw: (ctx) => {
        ctx.fillStyle = TEXT_LIGHT;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const px = fitFontSize(ctx, nameUpper, W - hPad * 2, 900, Math.round(60 * scale), CARD_FONT);
        const lh = Math.round(px * 1.08);
        const lines = wrapText(ctx, nameUpper, W - hPad * 2);
        lines.forEach((line, i) => ctx.fillText(line, W / 2, nameTop + i * lh));
      },
    });
    y = nameTop + nameLines.length * lineH + Math.round(26 * scale);

    const tileW = Math.min(W - hPad * 2, Math.round(560 * scale));
    const tileH = Math.round(200 * scale);
    const tileTop = y;
    add({
      id: "value",
      editKind: "element",
      label: "Value tile",
      natural: { x: W / 2 - tileW / 2, y: tileTop, w: tileW, h: tileH },
      vAnchor: "top",
      selectable: true,
      resizable: true,
      numeric: true,
      draw: (ctx) => drawStatTile(ctx, W / 2 - tileW / 2, tileTop, tileW, tileH, bigValue, tileLabel, scale, p, true),
      drawCount: (ctx, frac) =>
        drawStatTile(ctx, W / 2 - tileW / 2, tileTop, tileW, tileH, countValue(bigValue, frac), tileLabel, scale, p, true),
    });
    y = tileTop + tileH + Math.round(28 * scale);

    if (caption) {
      const capTop = y;
      add({
        id: "caption",
        editKind: "element",
        label: "Caption",
        natural: { x: hPad, y: capTop, w: W - hPad * 2, h: Math.round(32 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = TEXT_LIGHT;
          ctx.font = `600 ${Math.round(26 * scale)}px ${CARD_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(caption, W / 2, capTop);
        },
      });
      y = capTop + Math.round(40 * scale);
    }
    if (subtitle) {
      const subTop = y;
      add({
        id: "subtitle",
        editKind: "element",
        label: "Subtitle",
        natural: { x: hPad, y: subTop, w: W - hPad * 2, h: Math.round(28 * scale) },
        vAnchor: "top",
        selectable: true,
        resizable: false,
        draw: (ctx) => {
          ctx.fillStyle = TEXT_MUTED;
          ctx.font = `500 ${Math.round(23 * scale)}px ${CARD_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(subtitle, W / 2, subTop);
        },
      });
    }
  }

  // --- Footer (always last so it sits on top) -------------------------------
  add({
    id: "footer",
    editKind: "element",
    label: "Footer",
    natural: { x: 0, y: H - Math.round(48 * scale), w: W, h: Math.round(28 * scale) },
    vAnchor: "bottom",
    selectable: true,
    resizable: false,
    draw: (ctx) =>
      drawFooter(ctx, W, H, opts.clubUrl ?? "hallsheadcricket.com.au", opts.hashtag ?? "#HHCC", scale, p),
  });

  return layers;
};

// Convert a saved layer's normalised rect (fractions of 1080) into pixels at the
// current size, honouring the vertical anchor.
const savedRectToPx = (s: CardLayoutLayer, H: number): PxRect => {
  const x = (s.x ?? 0) * 1080;
  const w = (s.w ?? 0.2) * 1080;
  const h = (s.h ?? 0.1) * 1080;
  const yTop = (s.y ?? 0) * 1080;
  const y = (s.vAnchor ?? "top") === "bottom" ? H - yTop : yTop;
  return { x, y, w, h };
};

// Build a custom (image/sticker/text) layer from a saved entry. These draw
// directly within their rect (drawsAtNatural = false).
const buildCustomLayer = (
  s: CardLayoutLayer,
  H: number,
  z: number,
  input: ShareCardInput,
  tplCtx: TemplateContext,
): RenderLayer => {
  const rect = savedRectToPx(s, H);
  const label =
    s.kind === "image"
      ? "Image"
      : s.kind === "sticker"
        ? "Shape"
        : s.kind === "libsticker"
          ? getSticker(s.assetId)?.name ?? "Sticker"
          : "Text";
  return {
    id: s.id,
    editKind: s.kind,
    label,
    natural: { ...rect },
    rect,
    vAnchor: (s.vAnchor ?? "top") as "top" | "bottom",
    z,
    hidden: s.hidden ?? false,
    selectable: true,
    resizable: true,
    drawsAtNatural: false,
    ...(hasLayerEffects(s.effects) ? { effects: s.effects } : {}),
    draw: (ctx) => {
      if (s.kind === "image") return drawCustomImage(ctx, s, rect);
      if (s.kind === "libsticker") return drawCustomLibSticker(ctx, s, rect, input, tplCtx);
      if (s.kind === "sticker") drawCustomSticker(ctx, s, rect);
      else drawCustomText(ctx, s, rect);
      return undefined;
    },
  };
};

const drawCustomImage = async (ctx: CanvasRenderingContext2D, s: CardLayoutLayer, r: PxRect) => {
  if (!s.url) return;
  const img = await loadImage(s.url).catch(() => null);
  if (!img) return;
  const focalX = s.focalX ?? 0.5;
  const focalY = s.focalY ?? 0.5;
  const zoom = s.zoom ?? 1;
  ctx.save();
  if (s.shape === "circle") {
    const rad = Math.min(r.w, r.h) / 2;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    drawImageCoverFocal(ctx, img, cx - rad, cy - rad, rad * 2, rad * 2, focalX, focalY, zoom);
  } else if (s.fit === "contain") {
    drawImageContain(ctx, img, r.x, r.y, r.w, r.h);
  } else {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.closePath();
    ctx.clip();
    drawImageCoverFocal(ctx, img, r.x, r.y, r.w, r.h, focalX, focalY, zoom);
  }
  ctx.restore();
};

const drawCustomSticker = (ctx: CanvasRenderingContext2D, s: CardLayoutLayer, r: PxRect) => {
  ctx.fillStyle = s.color || "#FBAC27";
  if (s.shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.shape === "line") {
    const th = Math.max(2, (s.radius ?? 0.008) * 1080);
    ctx.fillRect(r.x, r.y + r.h / 2 - th / 2, r.w, th);
  } else {
    const rad = (s.radius ?? 0) * r.w;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, rad);
    ctx.fill();
  }
};

// Draw a built-in library sticker. The asset's own canvas draw fn recolours to
// `color`; data-bound badges auto-fill their text from a card field (falling
// back to a manual override or the asset's default label).
const drawCustomLibSticker = async (
  ctx: CanvasRenderingContext2D,
  s: CardLayoutLayer,
  r: PxRect,
  input: ShareCardInput,
  tplCtx: TemplateContext,
) => {
  const asset = getSticker(s.assetId);
  if (!asset) return;
  let text = asset.defaultText ?? "";
  if (asset.dataBound && s.field) {
    const resolved = resolveTextField(input, s.field, tplCtx);
    if (resolved) text = resolved;
    else if (s.text) text = s.text;
  } else if (s.text) {
    text = s.text;
  }
  const color = s.color || "#FBAC27";
  await asset.draw(ctx, r.x, r.y, r.w, r.h, { color, text });
};

const drawCustomText = (ctx: CanvasRenderingContext2D, s: CardLayoutLayer, r: PxRect) => {
  const px = Math.max(8, (s.fontSize ?? 0.05) * 1080);
  const family = s.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : CARD_FONT;
  ctx.font = `${s.fontWeight ?? 700} ${px}px ${family}`;
  ctx.fillStyle = s.color || "#F5F2E8";
  ctx.textBaseline = "top";
  const align = s.align ?? "center";
  ctx.textAlign = align;
  let text = s.text ?? "";
  if (s.uppercase) text = text.toUpperCase();
  const lines = wrapText(ctx, text, r.w);
  const lineH = px * 1.15;
  const tx = align === "center" ? r.x + r.w / 2 : align === "right" ? r.x + r.w : r.x;
  lines.forEach((ln, i) => ctx.fillText(ln, tx, r.y + i * lineH));
};

// Apply a saved layout to the freshly built built-in layers: override matching
// `element` rects/z/hidden in place and append custom layers.
const applyLayout = (
  builtins: RenderLayer[],
  saved: CardLayoutLayer[],
  H: number,
  input: ShareCardInput,
  tplCtx: TemplateContext,
): RenderLayer[] => {
  const byId = new Map(builtins.map((l) => [l.id, l]));
  const customs: RenderLayer[] = [];
  for (const s of saved) {
    if (s.kind === "element") {
      const l = byId.get(s.id);
      if (!l) continue;
      if (
        typeof s.x === "number" &&
        typeof s.y === "number" &&
        typeof s.w === "number" &&
        typeof s.h === "number"
      ) {
        l.rect = savedRectToPx(s, H);
      }
      if (typeof s.z === "number") l.z = s.z;
      if (typeof s.hidden === "boolean") l.hidden = s.hidden;
      if (hasLayerEffects(s.effects)) l.effects = s.effects;
      if (l.photoTransform) {
        l.photoTransform = {
          focalX: typeof s.focalX === "number" ? s.focalX : l.photoTransform.focalX,
          focalY: typeof s.focalY === "number" ? s.focalY : l.photoTransform.focalY,
          zoom: typeof s.zoom === "number" ? s.zoom : l.photoTransform.zoom,
        };
      }
    } else {
      const z = typeof s.z === "number" ? s.z : builtins.length + customs.length;
      customs.push(buildCustomLayer(s, H, z, input, tplCtx));
    }
  }
  return [...builtins, ...customs];
};

// Apply a built-in layer's natural→rect transform to the context (identity when
// rect === natural). Shared by the still renderer and the animation baker so a
// baked layer lands in exactly the same pixels as the static draw.
const applyLayerTransform = (ctx: CanvasRenderingContext2D, l: RenderLayer) => {
  if (l.drawsAtNatural && l.natural.w > 0 && l.natural.h > 0) {
    const sx = l.rect.w / l.natural.w;
    const sy = l.rect.h / l.natural.h;
    ctx.translate(l.rect.x, l.rect.y);
    ctx.scale(sx, sy);
    ctx.translate(-l.natural.x, -l.natural.y);
  }
};

// Apply the natural→rect transform a built-in layer expects, then run its draw.
const drawLayerContent = async (ctx: CanvasRenderingContext2D, l: RenderLayer) => {
  ctx.save();
  applyLayerTransform(ctx, l);
  try {
    await l.draw(ctx);
  } catch {}
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
const drawEffectedLayer = async (
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

const drawLayers = async (ctx: CanvasRenderingContext2D, layers: RenderLayer[]) => {
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

// A baked layer: its draw() output rendered once onto a full-frame transparent
// canvas (so its pixels already sit at final position). Compositing the bitmap
// with a per-layer alpha/transform is what lets every element animate
// independently without re-running its (sometimes async) draw each frame.
type BakedLayer = {
  layer: RenderLayer;
  bitmap: ImageBitmap | null;
  // Element-space centre + bounds (final pixels) for popIn scaling / wipe clip.
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rw: number;
  rh: number;
};

// Render a single layer onto its own full-frame canvas and snapshot it. Returns
// a null bitmap if the layer is empty/zero-sized (composited as a no-op).
const bakeLayer = async (
  l: RenderLayer,
  W: number,
  H: number,
): Promise<BakedLayer> => {
  const rect = l.rect;
  const meta = {
    cx: rect.x + rect.w / 2,
    cy: rect.y + rect.h / 2,
    rx: rect.x,
    ry: rect.y,
    rw: rect.w,
    rh: rect.h,
  };
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { layer: l, bitmap: null, ...meta };
  // Bake with the same effect-compositing the still renderer uses, so a toned /
  // masked / gradient feature photo (or any effected layer) carries into video.
  if (hasLayerEffects(l.effects)) {
    await drawEffectedLayer(ctx, l, W, H);
  } else {
    await drawLayerContent(ctx, l);
  }
  try {
    const bitmap = await createImageBitmap(canvas);
    return { layer: l, bitmap, ...meta };
  } catch {
    return { layer: l, bitmap: null, ...meta };
  }
};

// Match Summary as a single base layer: the bespoke two-innings scorecard is
// painted onto an offscreen canvas at natural full-frame size, then wrapped as
// one geometry-locked `element` layer so it flows through the same
// computeCardLayers / applyLayout / drawLayers pipeline as every other card.
// With no saved layout the layer draws 1:1 at (0,0) under an identity transform,
// so the output is byte-identical to the original bespoke renderer; admins can
// still add image/text/sticker overlays and toggle / restack / effect it.
const buildMatchSummaryLayers = async (
  input: Extract<ShareCardInput, { kind: "matchSummary" }>,
  opts: RenderOptions,
  p: Palette,
  W: number,
  H: number,
  scale: number,
): Promise<RenderLayer[]> => {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const offCtx = off.getContext("2d");
  if (offCtx) {
    await renderMatchSummaryCard(offCtx, W, H, scale, input, opts, p);
  }
  const natural: PxRect = { x: 0, y: 0, w: W, h: H };
  return [
    {
      id: "scorecard",
      editKind: "element",
      label: "Scorecard",
      natural,
      rect: { ...natural },
      vAnchor: "top",
      z: 0,
      hidden: false,
      selectable: true,
      // Geometry-locked (like the background): the full-frame scorecard never
      // persists x/y/w/h, so it stays correct across square/portrait/story.
      resizable: false,
      drawsAtNatural: true,
      draw: (ctx) => {
        ctx.drawImage(off, 0, 0);
      },
    },
  ];
};

// The built-in layer source for a card kind: matchSummary renders its bespoke
// scorecard into a single base layer; every other kind builds the standard body.
// Shared by the editor, the still renderer, and the animation baker so all three
// agree on the layer model.
const buildBuiltinLayers = async (
  input: ShareCardInput,
  opts: RenderOptions,
  p: Palette,
  W: number,
  H: number,
  scale: number,
): Promise<RenderLayer[]> => {
  if (input.kind === "matchSummary") {
    return buildMatchSummaryLayers(input, opts, p, W, H, scale);
  }
  const assets = await loadCardAssets(input, opts);
  return buildLayers(input, opts, p, W, H, scale, assets);
};

// Exported for the editor: compute the normalised editable layers for a card,
// merging any saved layout. Returns [] only when a custom template is selected
// (matchSummary now flows through the layer pipeline as a base scorecard layer).
export const computeCardLayers = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<EditorLayer[]> => {
  if (opts.template) return [];
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }
  const { w: W, h: H } = SIZES[opts.size];
  const scale = W / 1080;
  const p = isJuniorInput(input) ? resolvePalette(JUNIOR_THEME) : resolvePalette(opts.theme);
  const builtins = await buildBuiltinLayers(input, opts, p, W, H, scale);
  const toNorm = (l: RenderLayer): EditorLayer => ({
    id: l.id,
    editKind: l.editKind,
    label: l.label,
    selectable: l.selectable,
    resizable: l.resizable,
    x: l.rect.x / 1080,
    y: (l.vAnchor === "bottom" ? H - l.rect.y : l.rect.y) / 1080,
    w: l.rect.w / 1080,
    h: l.rect.h / 1080,
    vAnchor: l.vAnchor,
    z: l.z,
    hidden: l.hidden,
    focalX: l.photoTransform?.focalX,
    focalY: l.photoTransform?.focalY,
    zoom: l.photoTransform?.zoom,
    effects: l.effects,
  });
  const order: EditorLayer[] = builtins.map(toNorm);
  const byId = new Map(order.map((e) => [e.id, e]));
  for (const s of opts.layout ?? []) {
    if (s.kind === "element") {
      const e = byId.get(s.id);
      if (!e) continue;
      if (typeof s.x === "number") e.x = s.x;
      if (typeof s.y === "number") e.y = s.y;
      if (typeof s.w === "number") e.w = s.w;
      if (typeof s.h === "number") e.h = s.h;
      if (typeof s.z === "number") e.z = s.z;
      if (typeof s.hidden === "boolean") e.hidden = s.hidden;
      if (typeof s.focalX === "number") e.focalX = s.focalX;
      if (typeof s.focalY === "number") e.focalY = s.focalY;
      if (typeof s.zoom === "number") e.zoom = s.zoom;
      // The Background element can carry an uploaded full-bleed image.
      if (typeof s.url === "string") e.url = s.url;
      if (s.fit) e.fit = s.fit;
      if (hasLayerEffects(s.effects)) e.effects = s.effects;
    } else {
      order.push({
        id: s.id,
        editKind: s.kind,
        label:
          s.kind === "image"
            ? "Image"
            : s.kind === "sticker"
              ? "Shape"
              : s.kind === "libsticker"
                ? getSticker(s.assetId)?.name ?? "Sticker"
                : "Text",
        selectable: true,
        resizable: true,
        x: s.x ?? 0,
        y: s.y ?? 0,
        w: s.w ?? 0.2,
        h: s.h ?? 0.1,
        vAnchor: (s.vAnchor ?? "top") as "top" | "bottom",
        z: s.z ?? order.length,
        hidden: s.hidden ?? false,
        url: s.url,
        shape: s.shape,
        fit: s.fit,
        focalX: s.focalX,
        focalY: s.focalY,
        zoom: s.zoom,
        color: s.color,
        radius: s.radius,
        text: s.text,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        align: s.align,
        fontFamily: s.fontFamily,
        uppercase: s.uppercase,
        assetId: s.assetId,
        field: s.field,
        effects: hasLayerEffects(s.effects) ? s.effects : undefined,
      });
    }
  }
  return order.sort((a, b) => a.z - b.z);
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

  // Ensure web fonts (Montserrat) are ready so canvas text matches the app and
  // the trading card rather than falling back to a system sans.
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }

  // Junior cards force the brown palette regardless of the selected theme so
  // junior content is always visually distinct from the navy senior cards.
  const p = isJuniorInput(input)
    ? resolvePalette(JUNIOR_THEME)
    : resolvePalette(opts.theme);

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

  // Build the card as an ordered layer list, then draw. With no saved layout
  // this is pixel-identical to the pre-studio renderer (each layer draws at its
  // natural coords under an identity transform); a saved layout overrides element
  // rects/z/visibility and appends custom image/sticker/text layers. matchSummary
  // collapses to a single full-frame base scorecard layer (still byte-identical
  // when no layout is applied).
  const builtins = await buildBuiltinLayers(input, opts, p, W, H, scale);
  const tplCtx: TemplateContext = {
    clubUrl: opts.clubUrl,
    hashtag: opts.hashtag,
    photoUrl: opts.photoUrl,
  };
  const layers = opts.layout?.length
    ? applyLayout(builtins, opts.layout, H, input, tplCtx)
    : builtins;
  await drawLayers(ctx, layers);

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
  const jr = isJuniorInput(input) ? "junior-" : "";
  switch (input.kind) {
    case "milestone":
      return `hhcc-${jr}${slugify(input.playerName)}-${slugify(input.tierLabel)}`;
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
      return `hhcc-${jr}match-${slugify(input.club.name)}-vs-${slugify(input.opposition.name)}`;
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

// Default clip length when no admin override is supplied.
export const DEFAULT_DURATION_MS = 3500;
// Safe clip-length band (admin-configurable; bounds protect export feasibility).
export const MIN_DURATION_MS = 1500;
export const MAX_DURATION_MS = 10000;
// Safe animation-speed band (1 = default).
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

// Animated cards are short looping clips. Clamp every duration into a sane band.
const clampDuration = (ms: number): number =>
  Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, Math.round(ms)));

// Clamp the animation speed multiplier into its safe band (default 1).
const clampSpeed = (s: number): number =>
  Math.max(MIN_SPEED, Math.min(MAX_SPEED, s));

// The effective clip length for a card: an explicit admin override wins (clamped),
// else a video template's own background duration, else the default.
export const effectiveDuration = (opts: RenderOptions): number => {
  if (typeof opts.durationMs === "number" && Number.isFinite(opts.durationMs)) {
    return clampDuration(opts.durationMs);
  }
  return DEFAULT_DURATION_MS;
};

// The effective animation speed for a card (clamped; default 1).
export const effectiveSpeed = (opts: RenderOptions): number =>
  typeof opts.speed === "number" && Number.isFinite(opts.speed)
    ? clampSpeed(opts.speed)
    : 1;

// Build an animation for a card. Preloads every asset up front so each draw()
// call is synchronous and cheap (safe to run inside a rAF / capture loop).
export const prepareAnimation = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<AnimationHandle> => {
  const { w: W, h: H } = SIZES[opts.size];
  const scale = W / 1080;
  const p = isJuniorInput(input) ? resolvePalette(JUNIOR_THEME) : resolvePalette(opts.theme);
  const motion = effectiveMotion(opts);
  const speed = effectiveSpeed(opts);

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

    // Admin clip length wins; else a video bg's own duration; else the default.
    let durationMs = effectiveDuration(opts);
    if (typeof opts.durationMs !== "number" && bgKind === "video" && bg?.video) {
      const vid = bg.video.duration ? bg.video.duration * 1000 : 4000;
      durationMs = clampDuration(template.backgroundDurationMs ?? vid);
    }

    return {
      width: W,
      height: H,
      durationMs,
      loop: true,
      draw: (ctx, t) =>
        drawTemplateFrame(ctx, W, H, scale, input, template, opts, p, bg, photoImg, logos, motion, t, speed),
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

  const durationMs = effectiveDuration(opts);

  // Built-in still card (motion "none" or no real layers): render once, draw flat.
  if (motion === "none") {
    const stillBlob = await renderShareCard(input, { ...opts, template: null, motionPreset: "none" });
    const bmp = await createImageBitmap(stillBlob);
    return {
      width: W,
      height: H,
      durationMs,
      loop: true,
      draw: (ctx, t) => {
        void t;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(bmp, 0, 0, W, H);
      },
      cleanup: () => bmp.close(),
    };
  }

  // Built-in animated card: build the real layer model and bake every visible
  // layer to its own bitmap so each element can enter independently. The
  // background draws immediately (full alpha, no flash); foreground layers
  // composite in z-order with a per-layer stagger + entrance. "countUp" redraws
  // numeric layers live (drawCount) instead of compositing their bitmap.
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }
  const builtins = await buildBuiltinLayers(input, opts, p, W, H, scale);
  const tplCtx: TemplateContext = {
    clubUrl: opts.clubUrl,
    hashtag: opts.hashtag,
    photoUrl: opts.photoUrl,
  };
  const laidOut =
    opts.layout && opts.layout.length > 0
      ? applyLayout(builtins, opts.layout, H, input, tplCtx)
      : builtins;
  const ordered = laidOut.filter((l) => !l.hidden).sort((a, b) => a.z - b.z);
  const baked = await Promise.all(ordered.map((l) => bakeLayer(l, W, H)));
  const fg = baked.filter((b) => b.layer.id !== "background");
  const bgBaked = baked.filter((b) => b.layer.id === "background");

  // Per-preset stagger spread (fraction of timeline the element starts spread
  // over) and per-element entrance window. fadeIn/slideUp move as one block
  // (zero spread); the per-element presets spread their starts out. Both shrink
  // with speed so faster = snappier and holds longer.
  const spreadBase =
    motion === "popIn" || motion === "wipe" || motion === "countUp"
      ? 0.3
      : motion === "stagger"
        ? 0.55
        : 0;
  const winBase = 0.45;
  const spread = spreadBase / speed;
  const win = winBase / speed;
  const n = Math.max(1, fg.length);
  const layerProgress = (idx: number, t: number): number => {
    const start = n > 1 ? (idx / (n - 1)) * spread : 0;
    return clamp01((t - start) / win);
  };

  // Composite one foreground baked layer at local progress `lp` (0-1) under the
  // active preset's entrance. Skips zero-progress layers (avoids a blank flash).
  const drawFg = (ctx: CanvasRenderingContext2D, b: BakedLayer, lp: number) => {
    if (lp <= 0) return;
    // countUp: re-render numeric layers live so the figure ticks up; the value
    // fades in alongside (alpha = lp). drawCount(1) === draw() so rest matches.
    if (motion === "countUp" && b.layer.numeric && b.layer.drawCount) {
      ctx.save();
      // countUp redraws live (not the baked bitmap), so fold in the layer's own
      // opacity here — the baked path already has it composited in.
      ctx.globalAlpha = easeOutCubic(lp) * Math.max(0, Math.min(1, b.layer.effects?.opacity ?? 1));
      applyLayerTransform(ctx, b.layer);
      try {
        b.layer.drawCount(ctx, lp);
      } catch {}
      ctx.restore();
      return;
    }
    if (!b.bitmap) return;
    const e = easeOutCubic(lp);
    ctx.save();
    if (motion === "popIn") {
      const s = easeOutBack(lp);
      ctx.globalAlpha = e;
      ctx.translate(b.cx, b.cy);
      ctx.scale(s, s);
      ctx.translate(-b.cx, -b.cy);
      ctx.drawImage(b.bitmap, 0, 0, W, H);
    } else if (motion === "wipe") {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.rect(b.rx, b.ry, Math.max(1, b.rw * e), b.rh);
      ctx.clip();
      ctx.drawImage(b.bitmap, 0, 0, W, H);
    } else {
      // fadeIn / slideUp / stagger / countUp(non-numeric): fade (+ rise).
      ctx.globalAlpha = e;
      if (motion === "slideUp" || motion === "stagger") {
        ctx.translate(0, (1 - e) * 0.06 * H);
      }
      ctx.drawImage(b.bitmap, 0, 0, W, H);
    }
    ctx.restore();
  };

  return {
    width: W,
    height: H,
    durationMs,
    loop: true,
    draw: (ctx, t) => {
      ctx.clearRect(0, 0, W, H);
      // Background is always fully visible from frame 0 so nothing flashes.
      for (const b of bgBaked) {
        if (b.bitmap) ctx.drawImage(b.bitmap, 0, 0, W, H);
      }
      fg.forEach((b, idx) => drawFg(ctx, b, layerProgress(idx, t)));
    },
    cleanup: () => {
      for (const b of baked) b.bitmap?.close();
    },
  };
};

// Pick the best MediaRecorder container the browser supports. MP4 is preferred
// (broad social-platform support); WebM is the universal fallback in Chromium.
// When `withAudio` is set, prefer mime strings that name an audio codec too
// (avc1+mp4a for MP4, vp9/vp8+opus for WebM) so the muxed track is actually
// encoded — a video-only mime can silently drop the audio track.
export const pickVideoMime = (withAudio = false): { mime: string; ext: string } => {
  const supported = (m: string): boolean =>
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(m);
  if (withAudio) {
    if (supported("video/mp4;codecs=avc1,mp4a.40.2"))
      return { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" };
    if (supported("video/mp4")) return { mime: "video/mp4", ext: "mp4" };
    if (supported("video/webm;codecs=vp9,opus"))
      return { mime: "video/webm;codecs=vp9,opus", ext: "webm" };
    if (supported("video/webm;codecs=vp8,opus"))
      return { mime: "video/webm;codecs=vp8,opus", ext: "webm" };
    if (supported("video/webm")) return { mime: "video/webm", ext: "webm" };
    return { mime: "", ext: "webm" };
  }
  if (supported("video/mp4;codecs=avc1")) return { mime: "video/mp4;codecs=avc1", ext: "mp4" };
  if (supported("video/mp4")) return { mime: "video/mp4", ext: "mp4" };
  if (supported("video/webm;codecs=vp9")) return { mime: "video/webm;codecs=vp9", ext: "webm" };
  if (supported("video/webm")) return { mime: "video/webm", ext: "webm" };
  return { mime: "", ext: "webm" };
};

// Load + decode a track and build a looping audio graph feeding a MediaStream
// audio track, ready to mux into the canvas capture stream. Returns the stream
// track plus start/stop controls and a cleanup, or null if anything fails (so
// the caller degrades to a silent clip instead of throwing). The source loops
// from `trimStartMs` so a clip longer than the (trimmed) track never falls
// silent; volume is applied via a GainNode.
type ClipAudio = {
  track: MediaStreamTrack;
  start: (when: number) => void;
  stop: () => void;
  cleanup: () => void;
};
const prepareClipAudio = async (spec: CardAudioSpec): Promise<ClipAudio | null> => {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    const res = await fetch(spec.url);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const ctx = new AudioCtx();
    const buffer = await ctx.decodeAudioData(arrayBuf);
    const dest = ctx.createMediaStreamDestination();
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, spec.volume));
    gain.connect(dest);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Loop the trimmed window: playback starts at trimStart and wraps back to
    // it (not to 0) so the clip keeps using the admin-chosen section.
    const trimStart = Math.max(0, Math.min(spec.trimStartMs / 1000, buffer.duration));
    src.loopStart = trimStart;
    src.loopEnd = buffer.duration;
    src.connect(gain);
    const track = dest.stream.getAudioTracks()[0];
    if (!track) {
      void ctx.close();
      return null;
    }
    return {
      track,
      start: (when: number) => {
        void ctx.resume().catch(() => {});
        src.start(when, trimStart);
      },
      stop: () => {
        try {
          src.stop();
        } catch {}
      },
      cleanup: () => {
        try {
          src.disconnect();
          gain.disconnect();
        } catch {}
        void ctx.close().catch(() => {});
      },
    };
  } catch {
    return null;
  }
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

  // Optional background music: build a looping audio graph and mux its stream
  // track into the canvas capture stream BEFORE constructing the recorder (a
  // track added after start() is not encoded). A failed decode/load yields null
  // → silent clip, never a thrown error.
  const clipAudio = opts.audio ? await prepareClipAudio(opts.audio) : null;
  const { mime, ext } = pickVideoMime(!!clipAudio);
  const stream = canvas.captureStream(30);
  if (clipAudio) stream.addTrack(clipAudio.track);
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
  // Start the music in lockstep with recording so the audio aligns with frame 0.
  if (clipAudio) clipAudio.start(0);
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
  if (clipAudio) {
    clipAudio.stop();
    clipAudio.cleanup();
  }
  anim.cleanup();
  return { blob, ext };
};

// Whether GIF export is feasible in this browser (needs an offscreen 2D canvas
// + createImageBitmap, both used by the animation pipeline). gifenc itself is
// pure JS and loaded on demand.
export const canExportGif = (): boolean =>
  typeof document !== "undefined" &&
  typeof document.createElement("canvas").getContext === "function" &&
  typeof createImageBitmap === "function";

// Render a card to a looping GIF via gifenc. Downscales to ~540px wide (GIFs are
// heavy) at ~12fps over a single pass of the animation, then quantises each
// frame to a 256-colour palette and writes a looping image. Returns the blob +
// "gif" extension. Loaded dynamically so gifenc stays out of the main bundle.
export const renderShareCardGif = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<{ blob: Blob; ext: string }> => {
  if (!canExportGif()) {
    throw new Error("This browser can't export GIF.");
  }
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const anim = await prepareAnimation(input, opts);

  // Downscale: GIF palette + size make full-res clips huge. Cap the long edge.
  const maxW = 540;
  const ratio = anim.height / anim.width;
  const gw = Math.min(maxW, anim.width);
  const gh = Math.round(gw * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  const fps = 12;
  const frameCount = Math.max(2, Math.round((anim.durationMs / 1000) * fps));
  const delay = Math.round(1000 / fps);
  const gif = GIFEncoder();

  for (let i = 0; i < frameCount; i++) {
    const t = frameCount > 1 ? i / (frameCount - 1) : 1;
    ctx.clearRect(0, 0, gw, gh);
    // The animation draws at full size; scale the whole frame down to GIF size.
    ctx.save();
    ctx.scale(gw / anim.width, gh / anim.height);
    anim.draw(ctx, t);
    ctx.restore();
    const { data } = ctx.getImageData(0, 0, gw, gh);
    const palette = quantize(data, 256);
    const indexed = applyPalette(data, palette);
    gif.writeFrame(indexed, gw, gh, { palette, delay, repeat: 0 });
  }

  gif.finish();
  anim.cleanup();
  const bytes = gif.bytes();
  const blob = new Blob([bytes as BlobPart], { type: "image/gif" });
  return { blob, ext: "gif" };
};
