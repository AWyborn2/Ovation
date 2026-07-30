import type { PackManifest } from "../types";
import { bigMoment } from "./big-moment";
import { century } from "./century";
import { clubLeaderboardRuns } from "./club-leaderboard-runs";
import { clubLeaderboardWickets } from "./club-leaderboard-wickets";
import { countdown } from "./countdown";
import { debut } from "./debut";
import { fiveFor } from "./five-for";
import { gradeLeaderRuns } from "./grade-leader-runs";
import { gradeLeaderWickets } from "./grade-leader-wickets";
import { ladder } from "./ladder";
import { matchDay } from "./match-day";
import { matchResult } from "./match-result";
import { milestone } from "./milestone";
import { newSigning } from "./new-signing";
import { playerSpotlight } from "./player-spotlight";
import { premiership } from "./premiership";
import { record } from "./record";
import { teamList } from "./team-list";
import { weekendWrap } from "./weekend-wrap";

/**
 * Pack A — Broadcast Dark. 19 designs mapping onto 17 card kinds: gradeLeader
 * and clubLeaderboard each carry two category-preset designs.
 *
 * The bundle shipped 20 designs / 18 kinds (A1–A20). A15 "new-cap" was retired
 * with the `newCap` card kind — Debut covers the same moment with a superset of
 * its fields — so it is absent here and from every other pack. See the note on
 * `CARD_KIND_OPTIONS` in components/card-kind-picker.tsx.
 */
export const BROADCAST_DARK_PACK: PackManifest = {
  packId: "broadcast-dark-v1",
  name: "Broadcast Dark",
  designs: [
    { designKey: "match-result", kind: "matchSummary", template: matchResult },
    { designKey: "match-day", kind: "matchDay", template: matchDay },
    { designKey: "player-spotlight", kind: "player", template: playerSpotlight },
    { designKey: "team-list", kind: "teamList", template: teamList },
    { designKey: "milestone", kind: "milestone", template: milestone },
    { designKey: "weekend-wrap", kind: "weekendWrap", template: weekendWrap },
    { designKey: "ladder", kind: "ladder", template: ladder },
    { designKey: "big-moment", kind: "bigMoment", template: bigMoment },
    { designKey: "new-signing", kind: "newSigning", template: newSigning },
    { designKey: "countdown", kind: "countdown", template: countdown },
    { designKey: "debut", kind: "debut", template: debut },
    { designKey: "record", kind: "record", template: record },
    {
      designKey: "grade-leader-runs",
      kind: "gradeLeader",
      categoryPreset: "Runs",
      template: gradeLeaderRuns,
    },
    { designKey: "premiership", kind: "premiership", template: premiership },
    { designKey: "century", kind: "century", template: century },
    { designKey: "five-for", kind: "fiveFor", template: fiveFor },
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
