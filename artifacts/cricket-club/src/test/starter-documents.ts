/**
 * The original v1 starter documents, for render tests (T1.6's pinned hashes,
 * the template lint, the v1 → v2 render parity).
 *
 * The starters' TypeScript was deleted with T5.18, and they lived on as the
 * `club-kit-classic`, `broadcast-classic` and `clubhouse` bundles. Their
 * library elements became native layers in C3 (format v2), so the original
 * documents are kept here, frozen as they were: `__fixtures__/v1-starters/
 * <look>.json` holds each kind's v1 document (for Match Day and Match
 * Summary, their primary page, as the original was).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CardAdjustments } from "@/lib/pack-render";

export const STARTER_IDS = ["club-kit", "broadcast", "clubhouse"] as const;
export type StarterId = (typeof STARTER_IDS)[number];

const LOOK: Record<StarterId, string> = {
  "club-kit": "club-kit-classic",
  broadcast: "broadcast-classic",
  clubhouse: "clubhouse",
};

const FIXTURES = path.resolve(__dirname, "__fixtures__", "v1-starters");

const loaded = new Map<StarterId, Record<string, CardAdjustments>>();

/** A starter's original v1 document for a kind, or null when the starter has none. */
export function starterDocument(starter: StarterId, kind: string): CardAdjustments | null {
  let all = loaded.get(starter);
  if (!all) {
    all = JSON.parse(readFileSync(path.join(FIXTURES, `${LOOK[starter]}.json`), "utf8")) as Record<
      string,
      CardAdjustments
    >;
    loaded.set(starter, all);
  }
  return all[kind] ?? null;
}
