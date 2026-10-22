/**
 * The original v1 starter documents, for render tests (T1.6's pinned hashes,
 * the template lint, the v1 → v2 render parity).
 *
 * The starters' TypeScript was deleted with T5.18; they live on as the
 * `club-kit-classic`, `broadcast-classic` and `clubhouse` bundles. This reads
 * those files from disk (the web app never imports the bundles package). A
 * starter's Match Day and Match Summary bundles are format v2 since L4-D, with
 * the starter as the primary page plus `fit` on long text; taking that page
 * with `fit` removed gives the original document back exactly.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { primaryPage } from "@workspace/scorecard/kind-templates";
import type { CardAdjustments } from "@/lib/pack-render";

export const STARTER_IDS = ["club-kit", "broadcast", "clubhouse"] as const;
export type StarterId = (typeof STARTER_IDS)[number];

const LOOK: Record<StarterId, string> = {
  "club-kit": "club-kit-classic",
  broadcast: "broadcast-classic",
  clubhouse: "clubhouse",
};

const BUNDLES = path.resolve(__dirname, "../../../../lib/template-bundles");

const withoutFit = (layers: unknown[]): unknown[] =>
  layers.map((layer) => {
    const { fit: _fit, ...rest } = layer as { fit?: unknown; children?: unknown[] };
    return rest.children ? { ...rest, children: withoutFit(rest.children) } : rest;
  });

/** A starter's original v1 document for a kind, or null when the starter has none. */
export function starterDocument(starter: StarterId, kind: string): CardAdjustments | null {
  const file = path.join(BUNDLES, LOOK[starter], `${kind}.json`);
  if (!existsSync(file)) return null;
  const { document } = JSON.parse(readFileSync(file, "utf8")) as {
    document: { layers?: unknown[]; pages?: Record<string, { layers: unknown[] }> };
  };
  if (!document.pages) return document as CardAdjustments;
  const page = document.pages[primaryPage(kind)];
  return page ? ({ layers: withoutFit(page.layers) } as CardAdjustments) : null;
}
