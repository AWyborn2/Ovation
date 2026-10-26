/** A draft's own design (full draft editor plan). */
import { primaryPage } from "@workspace/scorecard/kind-templates";

/**
 * The draft's design, with any layers the previous draft editor put at the root
 * of a page-based (format v2) document moved onto its primary page: format v2
 * draws pages only, so they were never shown.
 */
export function withRootLayersOnPage(adjustments: unknown, kind: string): unknown {
  const doc = (adjustments ?? {}) as Record<string, unknown> & {
    layers?: unknown[];
    pages?: Record<string, { layers?: unknown[] } | undefined>;
  };
  if (doc.formatVersion !== 2 || !doc.pages || !doc.layers?.length) return doc;
  const key = primaryPage(kind);
  const page = doc.pages[key] ?? {};
  const { layers, ...rest } = doc;
  return {
    ...rest,
    pages: { ...doc.pages, [key]: { ...page, layers: [...(page.layers ?? []), ...layers] } },
  };
}
