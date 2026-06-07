import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Crown, Trophy, Medal, Award, Star, Shield, Sparkles, type LucideIcon } from "lucide-react";
import { HALLS_HEAD_BRAND } from "@workspace/scorecard";

const TIER_ICONS: LucideIcon[] = [Crown, Trophy, Medal, Award, Star, Shield, Sparkles];

export interface MilestoneShareInput {
  playerName: string;
  tierLabel: string;
  tierIndex: number;
  milestoneLabel: string;
  currentValue: number;
  threshold?: number | null;
  headline?: string;
  photoUrl?: string | null;
}

// Official club brand (clubs id 2), via the shared single source of truth.
const logoUrl = HALLS_HEAD_BRAND.logoUrl ?? "";

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [251, 172, 39];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const lighten = (hex: string, amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const c = (n: number) => Math.round(n + (255 - n) * amount);
  return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const BG_DARK = HALLS_HEAD_BRAND.primaryColour ?? "#333F48";
const BG_PANEL = lighten(BG_DARK, 0.1);
const GOLD = HALLS_HEAD_BRAND.secondaryColour ?? "#FBAC27";
const GOLD_SOFT = rgba(GOLD, 0.18);
const TEXT_LIGHT = "#F5F2E8";
const TEXT_MUTED = "rgba(245, 242, 232, 0.65)";

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

const slugify = (s: string): string =>
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

export const generateMilestoneCard = async (input: MilestoneShareInput): Promise<Blob> => {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, BG_PANEL);
  bgGrad.addColorStop(1, BG_DARK);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle diagonal accent
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.78);
  ctx.lineTo(W, H * 0.62);
  ctx.lineTo(W, H * 0.7);
  ctx.lineTo(0, H * 0.86);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Outer border
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = "rgba(251, 208, 57, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(46, 46, W - 92, H - 92);

  // Header: logo + club name
  try {
    const logo = await loadImage(logoUrl);
    const logoH = 120;
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, 80, 80, logoW, logoH);
    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = "700 28px Georgia, 'Times New Roman', serif";
    ctx.textBaseline = "top";
    ctx.fillText("HALLS HEAD CRICKET CLUB", 80 + logoW + 28, 96);
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = "500 18px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText("EST. 1991  •  HONOUR BOARD", 80 + logoW + 28, 138);
  } catch {
    // Logo failed — fall back to text-only header
    ctx.fillStyle = TEXT_LIGHT;
    ctx.font = "700 36px Georgia, serif";
    ctx.textBaseline = "top";
    ctx.fillText("HALLS HEAD CRICKET CLUB", 80, 96);
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = "500 18px Arial, sans-serif";
    ctx.fillText("EST. 1991  •  HONOUR BOARD", 80, 142);
  }

  // Headline ribbon
  const ribbonY = 240;
  ctx.fillStyle = GOLD;
  ctx.fillRect(80, ribbonY, W - 160, 64);
  ctx.fillStyle = BG_DARK;
  ctx.font = "800 26px 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((input.headline ?? "JUST PROMOTED").toUpperCase(), W / 2, ribbonY + 32);

  // Tier badge medallion
  const badgeCx = W / 2;
  const badgeCy = 510;
  const badgeR = 140;

  let photoImg: HTMLImageElement | null = null;
  if (input.photoUrl) {
    try {
      photoImg = await loadImage(input.photoUrl);
    } catch {
      photoImg = null;
    }
  }

  if (photoImg) {
    // Circular headshot fills the medallion; tier icon shown as a small overlay badge.
    ctx.save();
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const scale = Math.max((badgeR * 2) / photoImg.width, (badgeR * 2) / photoImg.height);
    const dw = photoImg.width * scale;
    const dh = photoImg.height * scale;
    ctx.drawImage(photoImg, badgeCx - dw / 2, badgeCy - dh / 2, dw, dh);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Small tier icon badge bottom-right
    const miniCx = badgeCx + badgeR * 0.72;
    const miniCy = badgeCy + badgeR * 0.72;
    const miniR = 44;
    ctx.beginPath();
    ctx.arc(miniCx, miniCy, miniR, 0, Math.PI * 2);
    ctx.fillStyle = BG_DARK;
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.stroke();
    try {
      const svg = iconSvgString(input.tierIndex, GOLD, 256, 1.75);
      const iconImg = await loadImage(svgToDataUrl(svg));
      const iconSize = 52;
      ctx.drawImage(iconImg, miniCx - iconSize / 2, miniCy - iconSize / 2, iconSize, iconSize);
    } catch {
      // ignore
    }
  } else {
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = GOLD_SOFT;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Draw tier icon SVG
    try {
      const svg = iconSvgString(input.tierIndex, GOLD, 256, 1.75);
      const iconImg = await loadImage(svgToDataUrl(svg));
      const iconSize = 160;
      ctx.drawImage(iconImg, badgeCx - iconSize / 2, badgeCy - iconSize / 2, iconSize, iconSize);
    } catch {
      // ignore
    }
  }

  // Tier label
  ctx.fillStyle = GOLD;
  ctx.font = "800 36px 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const tierY = badgeCy + badgeR + 30;
  ctx.fillText(input.tierLabel.toUpperCase(), W / 2, tierY);

  // Player name
  ctx.fillStyle = TEXT_LIGHT;
  ctx.font = "700 64px Georgia, 'Times New Roman', serif";
  const nameY = tierY + 64;
  const nameLines = wrapText(ctx, input.playerName.toUpperCase(), W - 200);
  nameLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, nameY + i * 72);
  });

  // Milestone stat line
  const statY = nameY + nameLines.length * 72 + 24;
  ctx.fillStyle = TEXT_LIGHT;
  ctx.font = "800 56px 'Helvetica Neue', Arial, sans-serif";
  const statText = `${input.currentValue.toLocaleString()} ${input.milestoneLabel.toLowerCase()}`;
  ctx.fillText(statText, W / 2, statY);

  if (input.threshold && input.threshold > 0) {
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = "500 22px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(
      `Just past the ${input.threshold.toLocaleString()} ${input.milestoneLabel.toLowerCase()} mark`,
      W / 2,
      statY + 68,
    );
  }

  // Footer
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = "600 18px 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("HALLSHEADCRICKET.COM.AU  •  #HHCC", W / 2, H - 70);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode PNG"));
    }, "image/png");
  });
};

export const downloadMilestoneCard = async (
  input: MilestoneShareInput,
  filename?: string,
): Promise<void> => {
  const blob = await generateMilestoneCard(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name =
    filename ??
    `hhcc-${slugify(input.playerName)}-${slugify(input.tierLabel)}.png`;
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
