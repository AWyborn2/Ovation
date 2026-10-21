/**
 * Which pages and sizes a template document designs (ADR-011 §2, `coverage`).
 *
 * A size is covered when every page the document has puts at least one layer
 * on it: the library lists a template under a size only when all its pages can
 * render there.
 */
import {
  documentPages,
  normaliseDocument,
  sizesWithLayers,
  TEMPLATE_SIZE_ORDER,
  type PageKey,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";

export type TemplateCoverage = { pages: PageKey[]; sizes: TemplateSize[] };

export function documentCoverage(document: unknown, kind: string): TemplateCoverage {
  const doc = normaliseDocument(document, kind);
  const pages = documentPages(doc).filter((page) => (doc.pages[page]?.layers.length ?? 0) > 0);
  if (pages.length === 0) return { pages: [], sizes: [] };
  const sizes = TEMPLATE_SIZE_ORDER.filter((size) =>
    pages.every((page) =>
      sizesWithLayers({ layers: doc.pages[page]?.layers ?? [] }).includes(size),
    ),
  );
  return { pages, sizes };
}

/** Whether `coverage` (a stored jsonb value) includes `size`. */
export function coversSize(
  coverage: { sizes?: unknown } | null | undefined,
  size: string,
): boolean {
  return Array.isArray(coverage?.sizes) && coverage.sizes.includes(size);
}
