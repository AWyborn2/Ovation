import type { PackManifest } from "../types";
import { matchResult } from "./match-result";
import { record } from "./record";
import { gradeLeaderRuns } from "./grade-leader-runs";
import { gradeLeaderWickets } from "./grade-leader-wickets";
import { clubLeaderboardRuns } from "./club-leaderboard-runs";
import { clubLeaderboardWickets } from "./club-leaderboard-wickets";

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
  designs: [
    { designKey: "match-result", kind: "matchSummary", template: matchResult },
    { designKey: "record", kind: "record", template: record },
    {
      designKey: "grade-leader-runs",
      kind: "gradeLeader",
      categoryPreset: "Runs",
      template: gradeLeaderRuns,
    },
    {
      designKey: "grade-leader-wickets",
      kind: "gradeLeader",
      categoryPreset: "Wickets",
      template: gradeLeaderWickets,
    },
    {
      designKey: "club-leaderboard-runs",
      kind: "clubLeaderboard",
      categoryPreset: "Runs",
      template: clubLeaderboardRuns,
    },
    {
      designKey: "club-leaderboard-wickets",
      kind: "clubLeaderboard",
      categoryPreset: "Wickets",
      template: clubLeaderboardWickets,
    },
  ],
};
