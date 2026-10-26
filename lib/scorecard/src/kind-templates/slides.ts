/**
 * Slides for a templated draft (plan KTD13, U7). A card kind template's
 * `rows` layer holds a fixed number of rows per size; a list with more rows
 * spills onto extra carousel slides, split evenly, every slide rendering the
 * same template with its share of the rows. Junior and senior rows never share
 * a slide. Meta carousels take at most 10 images, so rows past slide 10 are
 * not posted and the card gets a "slides" warning.
 *
 * A result's performance lists (full draft editor plan, D8) are derived from
 * the innings, not held in the input, so they split by their chosen rows
 * instead: each slide carries its share as `performanceRows` (indexes into
 * the list's rows, `PERFORMANCE_ROWS_KEY`), which the binding draws.
 */
import {
  documentRowsCapacity,
  layersForSize,
  type LayerDocument,
  type TemplateSize,
} from "./document";
import { isDocumentV2 } from "./format";
import { pageForInput } from "./pages";
import { isPerformanceRepeat, performancePickRows, pickRowIndexes } from "./rows-pick";
import type { MatchSummaryInnings } from "../match-summary-types";
import type { LayoutWarning } from "./warnings";
import { isJuniorGradeLabel } from "../junior-grade";

/** The most images a Meta carousel takes. */
export const MAX_CAROUSEL_SLIDES = 10;

/**
 * The slide input key holding a slide's share of a performance list: per
 * list, the indexes of its rows (`performanceEntries` order) the slide draws,
 * in draw order. Absent when the list fits one slide (it then draws its
 * whole choice).
 */
export const PERFORMANCE_ROWS_KEY = "performanceRows";

export type PerformanceRowsSlice = Partial<Record<string, number[]>>;

export type TemplateSlide<I> = { key: string; input: I; page: number; of: number };

export type TemplateSlidePlan<I> = {
  slides: TemplateSlide<I>[];
  /** Set when the rows needed more than MAX_CAROUSEL_SLIDES. */
  warning?: LayoutWarning;
};

/** Split `n` into `parts` sizes that differ by at most one, largest first. */
export function evenParts(n: number, parts: number): number[] {
  const base = Math.floor(n / parts);
  const extra = n % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Whether a list row is a junior one: flagged, or its grade is a junior grade
 * (rows carry `grade` or `gradeLabel`, as the pack planner reads them).
 */
export function isJuniorRow(row: unknown): boolean {
  if (typeof row !== "object" || row === null) return false;
  const r = row as { junior?: unknown; grade?: unknown; gradeLabel?: unknown };
  if (r.junior === true) return true;
  const grade =
    typeof r.grade === "string" ? r.grade : typeof r.gradeLabel === "string" ? r.gradeLabel : null;
  return isJuniorGradeLabel(grade);
}

/** No row fits a list's box, so every row would be hidden. */
const noRowFits = (size: TemplateSize, layerId: string): LayoutWarning => ({
  reason: "overflow",
  size,
  layerId,
  detail: "No list row fits its box",
});

/** The warning when a list needs more slides than a carousel posts. */
const tooManySlides = (size: TemplateSize, layerId: string, needed: number): LayoutWarning => ({
  reason: "slides",
  size,
  layerId,
  detail: `${needed} slides needed; only ${MAX_CAROUSEL_SLIDES} can post`,
});

/**
 * Split one list's rows (a performance list's chosen row indexes) evenly
 * across slides of `capacity` rows, each slide's input made by `slideInput`.
 */
function splitSlides<I extends Record<string, unknown>, R>(
  single: TemplateSlidePlan<I>,
  rows: R[],
  capacity: number,
  size: TemplateSize,
  layerId: string,
  slideInput: (chunk: R[]) => I,
): TemplateSlidePlan<I> {
  if (rows.length > 0 && capacity <= 0) return { ...single, warning: noRowFits(size, layerId) };
  if (rows.length <= capacity) return single;
  const chunks: R[][] = [];
  let start = 0;
  for (const n of evenParts(rows.length, Math.ceil(rows.length / capacity))) {
    chunks.push(rows.slice(start, start + n));
    start += n;
  }
  const kept = chunks.slice(0, MAX_CAROUSEL_SLIDES);
  const plan: TemplateSlidePlan<I> = {
    slides: kept.map((chunk, i) => ({
      key: `rows:${i + 1}`,
      input: slideInput(chunk),
      page: i + 1,
      of: kept.length,
    })),
  };
  if (chunks.length > MAX_CAROUSEL_SLIDES)
    plan.warning = tooManySlides(size, layerId, chunks.length);
  return plan;
}

/**
 * Plan a templated card's slides at `size`. A card without a rows layer on
 * that size, or whose list fits in one section, is one slide carrying the
 * input (marked junior when every row is a junior row).
 */
export function planTemplateSlides<I extends Record<string, unknown>>(
  input: I,
  doc: LayerDocument,
  size: TemplateSize,
): TemplateSlidePlan<I> {
  const single: TemplateSlidePlan<I> = { slides: [{ key: "single", input, page: 1, of: 1 }] };
  // A page-based design (format v2) plans from the page the card draws on.
  if (isDocumentV2(doc) && typeof input.kind === "string") {
    const page = pageForInput(input as unknown as Parameters<typeof pageForInput>[0]);
    doc = { layers: doc.pages[page]?.layers ?? [] } as LayerDocument;
  }
  // The first list on the size that splits decides the slides: one whose
  // rows are in the input, or a performance list. Other lists (an innings
  // list, a second list) draw the same rows on every slide.
  const rowsLayer = layersForSize(doc, size).find(
    (l) =>
      l.kind === "rows" &&
      l.rows &&
      (Array.isArray(input[l.rows.repeat]) || isPerformanceRepeat(l.rows.repeat)),
  );
  if (!rowsLayer?.rows) return single;
  const repeat = rowsLayer.rows.repeat;
  const capacity = documentRowsCapacity(doc, size, repeat) ?? 0;
  if (isPerformanceRepeat(repeat)) {
    // The rows the list's choice draws (a set count never spills past it),
    // split by its box; the card stays junior or not as a whole.
    const innings = Array.isArray(input.innings) ? (input.innings as MatchSummaryInnings[]) : [];
    const picked = pickRowIndexes(
      repeat,
      performancePickRows(innings, repeat),
      rowsLayer.rows.pick,
    );
    return splitSlides(single, picked, capacity, size, rowsLayer.id, (chunk) => ({
      ...input,
      [PERFORMANCE_ROWS_KEY]: {
        ...(input[PERFORMANCE_ROWS_KEY] as PerformanceRowsSlice | undefined),
        [repeat]: chunk,
      },
    }));
  }
  const rows = input[repeat] as unknown[];
  // Seniors first, then juniors: they never share a slide, even when they'd fit.
  const groups = [rows.filter((r) => !isJuniorRow(r)), rows.filter(isJuniorRow)].filter(
    (g) => g.length > 0,
  );
  if (rows.length > 0 && capacity <= 0) {
    // Not even one row fits the list's box, so every row would be hidden.
    return { ...single, warning: noRowFits(size, rowsLayer.id) };
  }
  if (groups.length <= 1 && rows.length <= capacity) {
    // One section that fits: a single slide, marked junior when it is (no photo).
    return groups[0] && isJuniorRow(groups[0][0])
      ? { slides: [{ key: "single", input: { ...input, junior: true } as I, page: 1, of: 1 }] }
      : single;
  }

  const chunks: Array<{ rows: unknown[]; junior: boolean }> = [];
  for (const group of groups) {
    const junior = isJuniorRow(group[0]);
    let start = 0;
    for (const n of evenParts(group.length, Math.ceil(group.length / capacity))) {
      chunks.push({ rows: group.slice(start, start + n), junior });
      start += n;
    }
  }

  const needed = chunks.length;
  const kept = chunks.slice(0, MAX_CAROUSEL_SLIDES);
  const of = kept.length;
  const slides = kept.map((chunk, i) => {
    const slideInput = { ...input, [repeat]: chunk.rows } as I;
    if (chunk.junior) (slideInput as Record<string, unknown>).junior = true;
    return { key: `rows:${i + 1}`, input: slideInput, page: i + 1, of };
  });
  const plan: TemplateSlidePlan<I> = { slides };
  if (needed > MAX_CAROUSEL_SLIDES) {
    plan.warning = tooManySlides(size, rowsLayer.id, needed);
  }
  return plan;
}

/** A draft's layout state as stored (kind templates, KTD10). */
export type DraftLayoutState = {
  templateVersion: number | null;
  layoutCheckPending: boolean;
  layoutWarnings: Partial<Record<string, unknown[]>> | null;
};

/**
 * Whether automation must leave a draft alone: a templated draft whose layout
 * hasn't been checked yet, or that has a warning on any size. Pack drafts are
 * never blocked.
 */
export function layoutBlocksAutomation(draft: DraftLayoutState): boolean {
  if (draft.templateVersion === null) return false;
  if (draft.layoutCheckPending) return true;
  return Object.values(draft.layoutWarnings ?? {}).some((list) => (list?.length ?? 0) > 0);
}
