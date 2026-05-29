import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Crown, Trophy, Medal, Award, Star, Shield, Sparkles, type LucideIcon } from "lucide-react";
import logoUrl from "@assets/HHCC_logo_(1)_1779834789645.png";

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
    };

export type CardKind = ShareCardInput["kind"];

export const CARD_KINDS: CardKind[] = [
  "milestone",
  "player",
  "record",
  "gradeLeader",
  "premiership",
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
  }
};

const seasonLabel = (year: number) =>
  `${year}/${String((year + 1) % 100).padStart(2, "0")}`;

// Draw `img` so it covers the rect (object-fit: cover), centred.
const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) => {
  const ir = img.width / img.height;
  const rr = dw / dh;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > rr) {
    sw = img.height * rr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / rr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
};

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
) => {
  if (bgImg) {
    // Photo background + dark overlay so foreground text stays legible.
    drawImageCover(ctx, bgImg, 0, 0, W, H);
    const ov = ctx.createLinearGradient(0, 0, 0, H);
    ov.addColorStop(0, rgba(p.bgPanel, 0.82));
    ov.addColorStop(1, rgba(p.bgDark, 0.92));
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

export type RenderOptions = {
  size: CardSize;
  sponsors?: CardSponsor[];
  clubUrl?: string;
  hashtag?: string;
  theme?: CardTheme | null;
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
  // Local aliases keep the per-kind body code below theme-agnostic.
  const GOLD = p.accent;
  const GOLD_SOFT = p.accentSoft;
  const TEXT_LIGHT = p.textLight;
  const TEXT_MUTED = p.textMuted;

  // Preload theme background + player photo (if any); failures fall back gracefully.
  const bgImg = opts.theme?.backgroundImageUrl
    ? await loadImage(opts.theme.backgroundImageUrl).catch(() => null)
    : null;
  const photoUrl = "photoUrl" in input ? input.photoUrl : null;
  const photoImg = photoUrl ? await loadImage(photoUrl).catch(() => null) : null;
  const logoSrc = opts.theme?.logoUrl || logoUrl;

  drawBackground(ctx, W, H, p, bgImg);
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
  }
};
