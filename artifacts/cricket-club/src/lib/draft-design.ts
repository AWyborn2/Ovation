/** A draft's own design (full draft editor plan). */
import { primaryPage } from "@workspace/scorecard/kind-templates";
import { withInningsWording } from "@/lib/pack-render/bind";
import type { ShareCardInput } from "@/lib/share-card";

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

/**
 * The design the card editor opens (round 3 retest follow-up): the draft's own
 * design, in its innings' wording. A century design prints "CENTURY" as fixed
 * text, and previews and posts swap it for "FIFTY" on a 50 to 99 innings; the
 * editor opens it the same way, so the canvas matches them and a save keeps it.
 */
export function draftEditorDocument(adjustments: unknown, input: ShareCardInput): unknown {
  return withInningsWording(withRootLayersOnPage(adjustments, input.kind), input);
}
