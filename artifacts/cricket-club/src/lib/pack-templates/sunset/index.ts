import type { PackManifest } from "../types";
import { matchResult } from "./match-result";
import { teamList } from "./team-list";
import { weekendWrap } from "./weekend-wrap";
import { ladder } from "./ladder";

/**
 * Pack E — Sunset. Golden-hour warmth: a photo-first story format over a
 * sunset wash, frosted glass panels, and Kaushan Script accent type
 * (`scriptText`) against clean grotesk body copy. The softest pack in the
 * catalogue — club-social warmth where Broadcast Dark is TV graphics.
 *
 * Coverage grows card by card; the api-server `PACKS` entry declares the SAME
 * kinds (enforced by `pack-coverage-parity.test.ts`). Stories transcribed from
 * `Pack E - Sunset.dc.html`; shared layouts authored in-repo where the bundle
 * ships story-only.
 */
export const SUNSET_PACK: PackManifest = {
  packId: "sunset-v1",
  name: "Sunset",
  designs: [
    { designKey: "match-result", kind: "matchSummary", template: matchResult },
    { designKey: "team-list", kind: "teamList", template: teamList },
    { designKey: "weekend-wrap", kind: "weekendWrap", template: weekendWrap },
    { designKey: "ladder", kind: "ladder", template: ladder },
  ],
};
