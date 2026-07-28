import type { PackManifest } from "../types";
import { matchResult } from "./match-result";
import { record } from "./record";
import { gradeLeaderRuns } from "./grade-leader-runs";
import { gradeLeaderWickets } from "./grade-leader-wickets";
import { clubLeaderboardRuns } from "./club-leaderboard-runs";
import { clubLeaderboardWickets } from "./club-leaderboard-wickets";
import { matchDay } from "./match-day";
import { countdown } from "./countdown";
import { newSigning } from "./new-signing";
import { newCap } from "./new-cap";
import { premiership } from "./premiership";
import { teamList } from "./team-list";
import { weekendWrap } from "./weekend-wrap";
import { ladder } from "./ladder";
import { playerSpotlight } from "./player-spotlight";
import { milestone } from "./milestone";
import { debut } from "./debut";
import { century } from "./century";
import { fiveFor } from "./five-for";
import { bigMoment } from "./big-moment";

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
    { designKey: "match-day", kind: "matchDay", template: matchDay },
    { designKey: "countdown", kind: "countdown", template: countdown },
    { designKey: "new-signing", kind: "newSigning", template: newSigning },
    { designKey: "new-cap", kind: "newCap", template: newCap },
    { designKey: "premiership", kind: "premiership", template: premiership },
    { designKey: "team-list", kind: "teamList", template: teamList },
    { designKey: "weekend-wrap", kind: "weekendWrap", template: weekendWrap },
    { designKey: "ladder", kind: "ladder", template: ladder },
    { designKey: "player-spotlight", kind: "player", template: playerSpotlight },
    { designKey: "milestone", kind: "milestone", template: milestone },
    { designKey: "debut", kind: "debut", template: debut },
    { designKey: "century", kind: "century", template: century },
    { designKey: "five-for", kind: "fiveFor", template: fiveFor },
    { designKey: "big-moment", kind: "bigMoment", template: bigMoment },
  ],
};
