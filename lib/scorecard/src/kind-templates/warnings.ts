import type { TemplateSize } from "./document";

/**
 * Why a rendered card needs a look before it can post (plan KTD9, KTD10):
 * text that still overflows at the minimum size, a font that failed to load,
 * or a list that would need more carousel slides than Meta allows.
 */
export type LayoutWarningReason = "overflow" | "font" | "slides";

export type LayoutWarning = {
  reason: LayoutWarningReason;
  size: TemplateSize;
  /** The layer the warning is about (overflow). */
  layerId?: string;
  /** The list row, for an overflowing cell in a `rows` layer. */
  row?: number;
  /** The row field, for an overflowing cell in a `rows` layer. */
  field?: string;
  /** The font family (font), or a short human detail. */
  detail?: string;
};

/** Layout warnings stored on a draft, by size; a size absent has not been checked. */
export type DraftLayoutWarnings = Partial<Record<TemplateSize, LayoutWarning[]>>;

/** The smallest a fitted text element may shrink to, as a share of its designed size. */
export const MIN_TEXT_FIT = 0.6;

/** Replace the warnings for the sizes just rendered, keeping the others (KTD10). */
export function mergeRenderedWarnings(
  current: DraftLayoutWarnings | null | undefined,
  rendered: DraftLayoutWarnings,
): DraftLayoutWarnings {
  return { ...(current ?? {}), ...rendered };
}

/** Whether any checked size has a warning. */
export function hasLayoutWarnings(warnings: DraftLayoutWarnings | null | undefined): boolean {
  return Object.values(warnings ?? {}).some((list) => (list?.length ?? 0) > 0);
}

/** Whether every one of `sizes` has been checked (has an entry, possibly empty). */
export function warningsCoverSizes(
  warnings: DraftLayoutWarnings | null | undefined,
  sizes: readonly TemplateSize[],
): boolean {
  return sizes.every((size) => Array.isArray(warnings?.[size]));
}
