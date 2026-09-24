/**
 * Content layer kinds for the Studio editor (Social Studio U17): milestone
 * medals, stickers and cricket charts. Each renders to a self-contained HTML /
 * SVG string from data captured on the layer, so the browser preview and the
 * render harness stay identical and no fetch happens at render time. Colours
 * come from the pack's own tokens (--gold, --ink, --panel) so layers stay on
 * brand.
 */
import { escapeHtml } from "./html-utils";

export type ChartType =
  "bowlingFigures" | "battingCard" | "ladder" | "wagonWheel" | "runWorm" | "runsPerOver";

export type ChartRow = {
  label: string;
  value: string;
  /** Secondary figure (balls, overs, points…). */
  sub?: string;
  /** Highlight this row (the club's own team on a ladder). */
  highlight?: boolean;
};

export type ChartSpec = { type: ChartType; title?: string; rows: ChartRow[] };

/** Charts that need ball-by-ball data the club doesn't capture. */
export const NEEDS_BALL_BY_BALL: ReadonlySet<ChartType> = new Set([
  "wagonWheel",
  "runWorm",
  "runsPerOver",
]);

export const CHART_LABEL: Record<ChartType, string> = {
  bowlingFigures: "Bowling figures",
  battingCard: "Top scorers",
  ladder: "Ladder",
  wagonWheel: "Wagon wheel",
  runWorm: "Run worm",
  runsPerOver: "Runs per over",
};

const EMPTY_REASON: Record<ChartType, string> = {
  bowlingFigures: "No bowling figures for this match",
  battingCard: "No batting figures for this match",
  ladder: "No ladder for this grade",
  wagonWheel: "No shot data for this match",
  runWorm: "No over-by-over data for this match",
  runsPerOver: "No over-by-over data for this match",
};

/** A chart's empty state when it has nothing to draw. */
export function chartEmptyReason(spec: ChartSpec): string | null {
  if (NEEDS_BALL_BY_BALL.has(spec.type) || spec.rows.length === 0) return EMPTY_REASON[spec.type];
  return null;
}

export function renderChart(spec: ChartSpec): string {
  const empty = chartEmptyReason(spec);
  const frame =
    "width:100%;height:100%;box-sizing:border-box;padding:4cqw;border-radius:2cqw;background:var(--panel-2,var(--ink));display:flex;flex-direction:column;gap:1.6cqw;font-family:'IBM Plex Sans',sans-serif";
  const title = `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:4.2cqw;line-height:1;text-transform:uppercase;color:var(--gold)">${escapeHtml(
    spec.title ?? CHART_LABEL[spec.type],
  )}</div>`;
  if (empty) {
    return `<div data-chart="${spec.type}" data-chart-empty="1" style="${frame};align-items:flex-start">${title}<div style="font-size:3cqw;opacity:.7">${escapeHtml(empty)}</div></div>`;
  }
  const rows = spec.rows
    .slice(0, 8)
    .map(
      (r) =>
        `<div style="display:flex;align-items:baseline;gap:2cqw;padding:1cqw 1.6cqw;border-radius:1cqw;${
          r.highlight ? "background:var(--gold);color:var(--accent-ink,var(--ink))" : ""
        }"><span style="flex:1;font-size:3.4cqw;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(
          r.label,
        )}</span><span style="font-family:var(--disp,'Anton'),sans-serif;font-size:4.2cqw">${escapeHtml(
          r.value,
        )}</span>${
          r.sub
            ? `<span style="font-size:2.6cqw;opacity:.7;min-width:8cqw;text-align:right">${escapeHtml(r.sub)}</span>`
            : ""
        }</div>`,
    )
    .join("");
  return `<div data-chart="${spec.type}" style="${frame}">${title}${rows}</div>`;
}

export const MEDAL_VARIANTS = [
  "50",
  "100",
  "150",
  "250",
  "5-for",
  "Hat-trick",
  "Debut",
  "Cap",
] as const;

/** A circular milestone badge: accent ring, the milestone large, an optional sub-line. */
export function renderMedal(variant: string, sub?: string): string {
  const big = escapeHtml(variant.toUpperCase());
  const size = variant.length <= 3 ? 34 : variant.length <= 5 ? 24 : 18;
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" data-medal="${escapeHtml(variant)}" style="display:block">
<circle cx="50" cy="50" r="47" style="fill:var(--gold)"/>
<circle cx="50" cy="50" r="40" fill="none" stroke-width="2" stroke-dasharray="3 3" style="stroke:var(--ink)"/>
<text x="50" y="${sub ? 54 : 60}" text-anchor="middle" font-size="${size}" style="fill:var(--ink);font-family:var(--disp,'Anton'),sans-serif">${big}</text>
${sub ? `<text x="50" y="72" text-anchor="middle" font-family="'IBM Plex Sans',sans-serif" font-size="9" font-weight="700" style="fill:var(--ink)">${escapeHtml(sub.toUpperCase())}</text>` : ""}
</svg>`;
}

export const STICKERS = [
  "Howzat!",
  "Six!",
  "Out!",
  "Four!",
  "Ton up!",
  "Game day",
  "W",
  "Legend",
] as const;

/** A tilted, outlined sticker in the pack accent. */
export function renderSticker(text: string): string {
  return `<div data-sticker="1" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--gold);color:var(--accent-ink,var(--ink));border:0.8cqw solid var(--ink);border-radius:999px;font-family:var(--disp,'Anton'),sans-serif;font-size:6cqw;text-transform:uppercase;transform:rotate(-6deg);box-shadow:1cqw 1cqw 0 var(--ink)">${escapeHtml(text)}</div>`;
}
