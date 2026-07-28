import type { PackManifest } from "../types";
import { matchResult } from "./match-result";

/**
 * Pack C — Bold Type. Oversized condensed type as the hero: 200px+ scores,
 * gold outline-stroke display faces, flat colour-block compositions, mono
 * tracked labels and hard hairline rules. No photography in the story formats —
 * the type IS the design.
 *
 * Coverage grows card by card; the api-server `PACKS` entry declares the SAME
 * kinds (enforced by `pack-coverage-parity.test.ts`). Stories transcribed from
 * `Pack C - Bold Type.dc.html`; shared layouts authored in-repo where the
 * bundle ships story-only.
 */
export const BOLD_TYPE_PACK: PackManifest = {
  packId: "bold-type-v1",
  name: "Bold Type",
  designs: [{ designKey: "match-result", kind: "matchSummary", template: matchResult }],
};
