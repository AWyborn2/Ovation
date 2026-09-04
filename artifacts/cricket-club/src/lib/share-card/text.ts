// Text formatting + measurement helpers (no drawing of their own beyond
// setting ctx.font while fitting) and the per-kind default headline.
import type { ShareCardInput } from "./types";

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const wrapText = (
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

export const fmt = (v: string | number) => (typeof v === "number" ? v.toLocaleString() : v);

export const headlineFor = (input: ShareCardInput): string => {
  if ("headline" in input && input.headline) return input.headline;
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
    case "century":
      return `${input.grade} • Century`;
    case "fiveFor":
      return `${input.grade} • Five-For`;
    case "matchSummary":
      return input.matchTitle;
    case "matchDay":
      return `${input.roundLabel} • Match Day`;
    case "teamList":
      return input.gradeRound;
    case "weekendWrap":
      return input.roundLabel;
    case "ladder":
      return `${input.gradeLabel} • Ladder`;
    case "bigMoment":
      return input.momentLabel;
    case "newSigning":
      return "New Signing";
    case "countdown":
      return input.eventLabel;
    case "clubLeaderboard":
      return input.title;
  }
};

// Shrink `weight px family` until `text` fits within maxW (down to a floor) and
// leave that font set on ctx. Returns the chosen pixel size.
export const fitFontSize = (
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

// Truncate `text` to fit `maxW` at the current ctx.font, appending an ellipsis.
export const ellipsize = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string => {
  if (maxW <= 0) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
};
