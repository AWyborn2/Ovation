import type { PackManifest } from "../types";
import { matchResult } from "./match-result";
import { teamList } from "./team-list";
import { weekendWrap } from "./weekend-wrap";
import { ladder } from "./ladder";
import { playerSpotlight } from "./player-spotlight";
import { milestone } from "./milestone";
import { debut } from "./debut";
import { century } from "./century";
import { fiveFor } from "./five-for";
import { bigMoment } from "./big-moment";
import { matchDay } from "./match-day";
import { countdown } from "./countdown";
import { newSigning } from "./new-signing";
import { premiership } from "./premiership";
import { record } from "./record";
import { gradeLeaderRuns } from "./grade-leader-runs";
import { gradeLeaderWickets } from "./grade-leader-wickets";
import { clubLeaderboardRuns } from "./club-leaderboard-runs";
import { clubLeaderboardWickets } from "./club-leaderboard-wickets";

/**
 * Pack E — Sunset. Golden-hour, club-social warmth on the shared card
 * skeleton (U13): the full photo under an orange → magenta → plum wash, a sun
 * glow in the tenant accent, the body on a frosted glass panel with a Kaushan
 * Script word above it (see `./fragments`).
 *
 * All 19 designs / 17 kinds; the api-server `PACKS` entry declares the SAME
 * kinds (enforced by `pack-coverage-parity.test.ts`). Every design ships
 * story, shared (portrait/square) and landscape markup from one
 * container-query layout.
 */
export const SUNSET_PACK: PackManifest = {
  packId: "sunset-v1",
  name: "Sunset",
  // A warm dusk base, per this pack's own `var(--ink,#120a07)`; without it the
  // sunset bloom sits on a neutral slate and reads as just another dark card.
  //
  // A LOWER tenant share than the other packs, and deliberately so: #120a07 is
  // very low-chroma, so at an even 50/50 a cool tenant tone swamps it and the
  // stage comes out neutral-magenta rather than warm (measured against the
  // seeded #322F3D: 50% gives #221d22, red and blue level). At 35% red leads
  // and it reads as dusk. Neon Night's base carries enough blue to hold its
  // own at 50%; this one does not.
  inkTint: { toward: "#120a07", tenantWeight: 35 },
  designs: [
    { designKey: "match-result", kind: "matchSummary", template: matchResult },
    { designKey: "team-list", kind: "teamList", template: teamList },
    { designKey: "weekend-wrap", kind: "weekendWrap", template: weekendWrap },
    { designKey: "ladder", kind: "ladder", template: ladder },
    { designKey: "player-spotlight", kind: "player", template: playerSpotlight },
    { designKey: "milestone", kind: "milestone", template: milestone },
    { designKey: "debut", kind: "debut", template: debut },
    { designKey: "century", kind: "century", template: century },
    { designKey: "five-for", kind: "fiveFor", template: fiveFor },
    { designKey: "big-moment", kind: "bigMoment", template: bigMoment },
    { designKey: "match-day", kind: "matchDay", template: matchDay },
    { designKey: "countdown", kind: "countdown", template: countdown },
    { designKey: "new-signing", kind: "newSigning", template: newSigning },
    { designKey: "premiership", kind: "premiership", template: premiership },
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
