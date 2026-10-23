/**
 * Shrink-to-fit for card kind templates (plan KTD9, U2): live text that
 * doesn't fit its box steps its font size down to `MIN_TEXT_FIT` of its
 * designed size; if it still doesn't fit, the card gets an overflow warning
 * instead of being cut off silently.
 *
 * The step-down loop is pure and takes an injected `overflows` check, so it
 * is unit-tested without layout (jsdom does none). `fitLayersInDom` is the
 * thin browser adapter used by the render harness and the editor.
 */
import {
  MIN_TEXT_FIT,
  type LayoutWarning,
  type TextFit,
} from "@workspace/scorecard/kind-templates";
import type { CardSize } from "../share-card";

/** One fittable text element: its designed size and how to apply a scale. */
export interface FitTarget {
  /** Designed font size (any unit; only the ratio matters). */
  base: number;
  apply(scale: number): void;
  overflows(): boolean;
}

/** Scale steps tried, largest first, ending at the floor. */
export function fitScales(floor = MIN_TEXT_FIT, step = 0.05): number[] {
  const out: number[] = [];
  for (let s = 1; s > floor + 1e-9; s = Math.round((s - step) * 1000) / 1000) out.push(s);
  out.push(floor);
  return out;
}

/**
 * Fit one target: the largest scale at which it no longer overflows, or the
 * floor (and `fits: false`) when none does.
 */
export function fitTarget(
  target: FitTarget,
  floor = MIN_TEXT_FIT,
  step = 0.05,
): { scale: number; fits: boolean } {
  target.apply(1);
  if (!target.overflows()) return { scale: 1, fits: true };
  for (const scale of fitScales(floor, step).slice(1)) {
    target.apply(scale);
    if (!target.overflows()) return { scale, fits: true };
  }
  return { scale: floor, fits: false };
}

/** Layer-only marker: built-in `data-fit` values are character limits, not cqw. */
export const FIT_ATTR = "data-layer-fit";
/** Attribute recording the scale the fit step settled on (1 = designed size). */
export const FIT_SCALE_ATTR = "data-fit-scale";

/** Format v2 text fit (T1.17): the smallest scale, the most lines, and whether "…" may end it. */
export const FIT_MIN_ATTR = "data-fit-min";
export const FIT_LINES_ATTR = "data-fit-lines";
export const FIT_ELLIPSIS_ATTR = "data-fit-ellipsis";
/** Marks the text inside a v2 fitted box, so its lines can be counted. */
export const FIT_TEXT_ATTR = "data-fit-text";

/** The smallest `minScale` the renderer accepts (the validator holds the real range). */
const MIN_FIT_FLOOR = 0.3;

/** A v2 text layer's fit, read safely: defaults for anything missing or out of range. */
export function readTextFit(fit: TextFit | undefined): {
  minScale: number;
  maxLines: 1 | 2;
  ellipsis: boolean;
} {
  const min = Number(fit?.minScale);
  return {
    minScale: Number.isFinite(min) ? Math.min(1, Math.max(MIN_FIT_FLOOR, min)) : MIN_TEXT_FIT,
    maxLines: fit?.maxLines === 2 ? 2 : 1,
    ellipsis: fit?.ellipsis === true,
  };
}

/**
 * The attributes a v2 text layer's `fit` adds for the fit step; none for a
 * layer without one, which fits as v1 live text does.
 */
export function textFitAttrs(fit: TextFit | undefined): string {
  if (!fit || typeof fit !== "object") return "";
  const f = readTextFit(fit);
  return ` ${FIT_MIN_ATTR}="${f.minScale}" ${FIT_LINES_ATTR}="${f.maxLines}"${f.ellipsis ? ` ${FIT_ELLIPSIS_ATTR}="1"` : ""}`;
}

/** A v2 fittable text element: a scale, a line mode and an ellipsis to apply. */
export interface TextFitTarget extends FitTarget {
  /** Set the text on one line, or let it wrap onto two. */
  lines(n: 1 | 2): void;
  /** End the text in "…" where it is cut off. */
  ellipsis(): void;
}

export type TextFitResult = { scale: number; lines: 1 | 2; ellipsis: boolean; fits: boolean };

/**
 * Fit v2 text (ADR-010's one name-fit rule, ADR-011 §1): shrink on one line
 * to `minScale`; past that, wrap onto two lines when allowed and shrink
 * again; past that, end in "…" when allowed. Text that still doesn't fit is
 * a layout warning (`fits: false`).
 */
export function fitTextTarget(
  target: TextFitTarget,
  fit: { minScale: number; maxLines: 1 | 2; ellipsis: boolean },
  step = 0.05,
): TextFitResult {
  target.lines(1);
  const one = fitTarget(target, fit.minScale, step);
  if (one.fits) return { scale: one.scale, lines: 1, ellipsis: false, fits: true };
  if (fit.maxLines === 2) {
    target.lines(2);
    const two = fitTarget(target, fit.minScale, step);
    if (two.fits) return { scale: two.scale, lines: 2, ellipsis: false, fits: true };
  }
  target.apply(fit.minScale);
  if (fit.ellipsis) {
    target.ellipsis();
    return { scale: fit.minScale, lines: fit.maxLines, ellipsis: true, fits: true };
  }
  return { scale: fit.minScale, lines: fit.maxLines, ellipsis: false, fits: false };
}

/** Format v2 list-row cell: past the floor, it ends in "…" after its last whole word. */
export const FIT_WORDS_ATTR = "data-fit-words";
/** A cell's whole text, kept while the fit step truncates it (so a re-fit starts from it). */
const FIT_FULL_ATTR = "data-fit-full";

/** A v2 list-row cell: it shrinks like live text, then truncates at a word. */
export interface RowCellFitTarget extends FitTarget {
  /** The cell's words, in order. */
  readonly words: readonly string[];
  /** Show the first `n` words ending in "…", or (null) the whole text. */
  truncate(n: number | null): void;
  /** Cut the text mid-word, ending in "…": the last resort, when no whole word fits. */
  clip(): void;
}

export type RowCellFitResult = {
  scale: number;
  fits: boolean;
  /** Where the text was cut: not at all, after a whole word, or mid-word (which doesn't fit). */
  cut: "none" | "word" | "mid-word";
};

/** The first `n` words ending in "…", without a separator ("-", ",", "(") left before it. */
export function truncateAtWord(words: readonly string[], n: number): string {
  const kept = words.slice(0, Math.max(1, n));
  while (kept.length > 1 && !/[\p{L}\p{N}]/u.test(kept[kept.length - 1]!)) kept.pop();
  return `${kept.join(" ").replace(/[\s,;:&·(–—-]+$/u, "")}…`;
}

/**
 * Fit a v2 list-row cell: shrink to `floor` as live text does; past that,
 * keep the most whole words that fit and end in "…". A cell whose first word
 * alone doesn't fit is cut mid-word, and that doesn't fit.
 */
export function fitRowCellTarget(
  target: RowCellFitTarget,
  floor = MIN_TEXT_FIT,
  step = 0.05,
): RowCellFitResult {
  target.truncate(null);
  const shrunk = fitTarget(target, floor, step);
  if (shrunk.fits) return { scale: shrunk.scale, fits: true, cut: "none" };
  for (let n = target.words.length - 1; n >= 1; n--) {
    target.truncate(n);
    if (!target.overflows()) return { scale: floor, fits: true, cut: "word" };
  }
  target.clip();
  return { scale: floor, fits: false, cut: "mid-word" };
}

const overflowsBox = (el: HTMLElement) =>
  el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;

/** How many lines a block of text takes, from its height and line height. */
function lineCount(text: HTMLElement): number {
  const style = getComputedStyle(text);
  const fontSize = parseFloat(style.fontSize);
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.05;
  const height = text.getBoundingClientRect().height;
  return lineHeight > 0 ? Math.round(height / lineHeight) : 1;
}

/** The DOM adapter for a v2 fitted text element. */
function domTextTarget(el: HTMLElement, base: number): TextFitTarget {
  const text = el.querySelector<HTMLElement>(`[${FIT_TEXT_ATTR}]`);
  let lines: 1 | 2 = 1;
  return {
    base,
    apply: (scale) => {
      el.style.fontSize = `${(base * scale).toFixed(3)}cqw`;
      el.setAttribute(FIT_SCALE_ATTR, String(scale));
    },
    lines: (n) => {
      lines = n;
      el.style.whiteSpace = n === 1 ? "nowrap" : "normal";
      if (text) text.style.whiteSpace = n === 1 ? "nowrap" : "normal";
      el.setAttribute("data-fit-lines-used", String(n));
    },
    overflows: () => overflowsBox(el) || (text ? lineCount(text) > lines : false),
    ellipsis: () => {
      if (!text) return;
      text.style.overflow = "hidden";
      text.style.textOverflow = "ellipsis";
      text.style.maxWidth = "100%";
      if (lines === 1) {
        text.style.display = "block";
        text.style.whiteSpace = "nowrap";
      } else {
        text.style.display = "-webkit-box";
        text.style.setProperty("-webkit-line-clamp", "2");
        text.style.setProperty("-webkit-box-orient", "vertical");
      }
      el.setAttribute("data-fit-ellipsis-used", "1");
    },
  };
}

/** The DOM adapter for a v2 list-row cell. */
function domRowCellTarget(el: HTMLElement, base: number): RowCellFitTarget {
  const full = el.getAttribute(FIT_FULL_ATTR) ?? el.textContent ?? "";
  el.setAttribute(FIT_FULL_ATTR, full);
  const words = full.trim().split(/\s+/).filter(Boolean);
  return {
    base,
    words,
    apply: (scale) => {
      el.style.fontSize = `${(base * scale).toFixed(3)}cqw`;
      el.setAttribute(FIT_SCALE_ATTR, String(scale));
    },
    overflows: () => overflowsBox(el),
    truncate: (n) => {
      el.textContent = n === null ? full : truncateAtWord(words, n);
      if (n === null) el.removeAttribute("data-fit-ellipsis-used");
      else el.setAttribute("data-fit-ellipsis-used", "word");
    },
    clip: () => {
      const text = el.ownerDocument.createElement("span");
      text.textContent = full;
      text.style.cssText =
        "display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      el.replaceChildren(text);
      el.setAttribute("data-fit-ellipsis-used", "mid-word");
    },
  };
}

/**
 * Fit every marked element under `root` and return the overflow warnings for
 * `size`. Elements are text layers with live fields and list-row cells.
 */
export function fitLayersInDom(
  root: HTMLElement,
  size: CardSize,
  floor = MIN_TEXT_FIT,
): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${FIT_ATTR}]`))) {
    const base = Number(el.getAttribute(FIT_ATTR));
    if (!Number.isFinite(base) || base <= 0) continue;
    const cell = el.hasAttribute(FIT_WORDS_ATTR)
      ? fitRowCellTarget(domRowCellTarget(el, base), floor)
      : null;
    const result = cell
      ? cell
      : el.hasAttribute(FIT_LINES_ATTR)
        ? fitTextTarget(domTextTarget(el, base), {
            minScale: readTextFit({ minScale: Number(el.getAttribute(FIT_MIN_ATTR)) }).minScale,
            maxLines: el.getAttribute(FIT_LINES_ATTR) === "2" ? 2 : 1,
            ellipsis: el.hasAttribute(FIT_ELLIPSIS_ATTR),
          })
        : fitTarget(
            {
              base,
              apply: (scale) => {
                el.style.fontSize = `${(base * scale).toFixed(3)}cqw`;
                el.setAttribute(FIT_SCALE_ATTR, String(scale));
              },
              overflows: () => overflowsBox(el),
            },
            floor,
          );
    if (result.fits) continue;
    const layer = el.closest<HTMLElement>("[data-layer-id]");
    const row = el.closest<HTMLElement>("[data-row-index]");
    const warning: LayoutWarning = { reason: "overflow", size };
    if (layer) warning.layerId = layer.getAttribute("data-layer-id") ?? undefined;
    if (row) warning.row = Number(row.getAttribute("data-row-index"));
    const field = el.getAttribute("data-row-cell");
    if (field) warning.field = field;
    if (cell?.cut === "mid-word") warning.detail = "cut mid-word";
    warnings.push(warning);
  }
  return warnings;
}
