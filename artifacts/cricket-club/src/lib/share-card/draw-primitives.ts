// Canvas drawing primitives shared by every renderer: image loading/cover/
// contain/circle draws, the standard card chrome (background, ribbon, sponsor
// strip, footer) and the trading-card visual language (section title, stat
// tile, pill). All colours come from the resolved Palette.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Crown, Trophy, Medal, Award, Star, Shield, Sparkles, type LucideIcon } from "lucide-react";
import { CARD_FONT } from "./fonts";
import { fmt, fitFontSize } from "./text";
import { rgba, type Palette } from "./theme";
import type { CardSponsor, PhotoTransform } from "./types";

const TIER_ICONS: LucideIcon[] = [Crown, Trophy, Medal, Award, Star, Shield, Sparkles];

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });

export const iconSvgString = (tierIndex: number, color: string, size = 256, strokeWidth = 1.75): string => {
  const Icon = TIER_ICONS[Math.min(Math.max(tierIndex, 0), TIER_ICONS.length - 1)];
  const node = createElement(Icon, { color, size, strokeWidth, absoluteStrokeWidth: true });
  return renderToStaticMarkup(node as React.ReactElement);
};

export const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// Draw `img` so it covers the rect (object-fit: cover) honouring a focal point
// and zoom. `focalX`/`focalY` are 0-1 (0.5 = centred) and select the point of
// the source image that stays in view; `zoom` (>= 1) crops in tighter. With the
// defaults this is a plain centred cover.
export const drawImageCoverFocal = (
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
export const drawCircularImage = (
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

export const drawBackground = (
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

export const drawRibbon = (
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

export const drawSponsors = async (
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

export const drawFooter = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  clubUrl: string,
  hashtag: string,
  scale: number,
  p: Palette,
) => {
  const text = [clubUrl.trim() ? clubUrl.toUpperCase() : null, hashtag.trim() || null]
    .filter(Boolean)
    .join("  •  ");
  if (!text) return;
  ctx.fillStyle = p.textMuted;
  ctx.font = `600 ${Math.round(18 * scale)}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(
    text,
    W / 2,
    H - Math.round(30 * scale),
  );
};

// Draw `img` so it fits inside the rect (object-fit: contain), centred.
export const drawImageContain = (
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

// Draw any CanvasImageSource so it covers the rect (object-fit: cover), centred.
// Unlike drawImageCover this takes explicit natural dimensions so it works for
// <video> elements (whose .width/.height attributes are unreliable).
export const drawSourceCover = (
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

// Synchronous sponsor strip using preloaded logos (mirrors drawSponsors).
export const drawSponsorsSync = (
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

// --- Trading-card visual language -------------------------------------------
// Shared helpers that bring the HTML trading card's look (StatTile / SectionTitle
// / role chip) to the canvas cards: a translucent rounded stat tile with a gold
// value over a muted uppercase label, a gold-barred section heading, and a gold
// pill chip. They draw from the resolved palette, so the junior brown theme and
// custom themes still apply. Type is IBM Plex Sans to match the app + trading card.

// Gold vertical bar + uppercase heading (trading-card SectionTitle). Left-aligned
// at x; returns the y just below the title row.
export const drawSectionTitle = (
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
export const drawStatTile = (
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
export const drawPill = (
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
