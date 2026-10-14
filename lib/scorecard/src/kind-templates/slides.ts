/**
 * Slides for a templated draft (plan KTD13, U7). A card kind template's
 * `rows` layer holds a fixed number of rows per size; a list with more rows
 * spills onto extra carousel slides, split evenly, every slide rendering the
 * same template with its share of the rows. Junior and senior rows never share
 * a slide. Meta carousels take at most 10 images, so rows past slide 10 are
 * not posted and the card gets a "slides" warning.
 */
import {
  documentRowsCapacity,
  layersForSize,
  type LayerDocument,
  type TemplateSize,
} from "./document";
import type { LayoutWarning } from "./warnings";
import { isJuniorGradeLabel } from "../junior-grade";

/** The most images a Meta carousel takes. */
export const MAX_CAROUSEL_SLIDES = 10;

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
  const rowsLayer = layersForSize(doc, size).find(
    (l) => l.kind === "rows" && l.rows && Array.isArray(input[l.rows.repeat]),
  );
  if (!rowsLayer?.rows) return single;
  const repeat = rowsLayer.rows.repeat;
  const rows = input[repeat] as unknown[];
  const capacity = documentRowsCapacity(doc, size, repeat) ?? 0;
  // Seniors first, then juniors: they never share a slide, even when they'd fit.
  const groups = [rows.filter((r) => !isJuniorRow(r)), rows.filter(isJuniorRow)].filter(
    (g) => g.length > 0,
  );
  if (rows.length > 0 && capacity <= 0) {
    // Not even one row fits the list's box, so every row would be hidden.
    return {
      ...single,
      warning: {
        reason: "overflow",
        size,
        layerId: rowsLayer.id,
        detail: "No list row fits its box",
      },
    };
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
    plan.warning = {
      reason: "slides",
      size,
      layerId: rowsLayer.id,
      detail: `${needed} slides needed; only ${MAX_CAROUSEL_SLIDES} can post`,
    };
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
