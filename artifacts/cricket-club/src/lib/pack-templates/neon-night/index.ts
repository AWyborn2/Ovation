import type { PackManifest } from "../types";
import { matchResult } from "./match-result";

/**
 * Pack D — Neon Night. Night-sky navy with blurred neon orbs (fixed cyan +
 * tenant accent) on the app-side `hhGlow` pulse, glassmorphism panels, and
 * layered neon-glow display type (`neonText`) in place of Gold Foil's metal
 * ramp. Circular club logo in a cyan glow ring as the story wordmark.
 *
 * Coverage grows card by card; the api-server `PACKS` entry declares the SAME
 * kinds (enforced by `pack-coverage-parity.test.ts`).
 */
export const NEON_NIGHT_PACK: PackManifest = {
  packId: "neon-night-v1",
  name: "Neon Night",
  designs: [{ designKey: "match-result", kind: "matchSummary", template: matchResult }],
};
