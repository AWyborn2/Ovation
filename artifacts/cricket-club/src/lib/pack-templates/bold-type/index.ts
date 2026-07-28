import type { PackManifest } from "../types";
import { matchResult } from "./match-result";
import { matchDay } from "./match-day";
import { countdown } from "./countdown";
import { newSigning } from "./new-signing";
import { newCap } from "./new-cap";
import { premiership } from "./premiership";
import { record } from "./record";
import { teamList } from "./team-list";
import { weekendWrap } from "./weekend-wrap";
import { ladder } from "./ladder";
import { gradeLeaderRuns } from "./grade-leader-runs";
import { gradeLeaderWickets } from "./grade-leader-wickets";
import { clubLeaderboardRuns } from "./club-leaderboard-runs";
import { clubLeaderboardWickets } from "./club-leaderboard-wickets";

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
  designs: [
    { designKey: "match-result", kind: "matchSummary", template: matchResult },
    { designKey: "match-day", kind: "matchDay", template: matchDay },
    { designKey: "countdown", kind: "countdown", template: countdown },
    { designKey: "new-signing", kind: "newSigning", template: newSigning },
    { designKey: "new-cap", kind: "newCap", template: newCap },
    { designKey: "premiership", kind: "premiership", template: premiership },
    { designKey: "record", kind: "record", template: record },
    { designKey: "team-list", kind: "teamList", template: teamList },
    { designKey: "weekend-wrap", kind: "weekendWrap", template: weekendWrap },
    { designKey: "ladder", kind: "ladder", template: ladder },
    { designKey: "grade-leader-runs", kind: "gradeLeader", categoryPreset: "Runs", template: gradeLeaderRuns },
    { designKey: "grade-leader-wickets", kind: "gradeLeader", categoryPreset: "Wickets", template: gradeLeaderWickets },
    { designKey: "club-leaderboard-runs", kind: "clubLeaderboard", categoryPreset: "Runs", template: clubLeaderboardRuns },
    { designKey: "club-leaderboard-wickets", kind: "clubLeaderboard", categoryPreset: "Wickets", template: clubLeaderboardWickets },
  ],
};
