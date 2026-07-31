import type { PackManifest } from "../types";
import { matchResult } from "./match-result";
import { matchDay } from "./match-day";
import { countdown } from "./countdown";
import { newSigning } from "./new-signing";
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
import { record } from "./record";
import { gradeLeaderRuns } from "./grade-leader-runs";
import { gradeLeaderWickets } from "./grade-leader-wickets";
import { clubLeaderboardRuns } from "./club-leaderboard-runs";
import { clubLeaderboardWickets } from "./club-leaderboard-wickets";

/**
 * Pack B — Gold Foil. Grand-final prestige: metallic foil display type on
 * black, concentric gold grooves, gold ribbon callouts.
 *
 * **Complete: all 19 designs, all 17 kinds** (gradeLeader and clubLeaderboard
 * carry two category-preset designs each, as in Pack A; the bundle's 20th
 * design, new-cap, went with the retired `newCap` kind). The api-server `PACKS`
 * entry declares the SAME kinds — that pairing is the coverage contract,
 * enforced by `pack-coverage-parity.test.ts`. Stories are transcribed from
 * `Pack B - Gold Foil.dc.html`; the shared (portrait/square) layouts are
 * authored in-repo in the pack's own language, since the bundle ships a single
 * fluid composition per card.
 */
export const GOLD_FOIL_PACK: PackManifest = {
  packId: "gold-foil-v1",
  // `packId` stays `gold-foil-v1`: it is stored on every tenant's
  // `card_templates` row, so renaming it would orphan their pack selection.
  // Only the display name changes.
  name: "Metallic Foil",
  // Foil only reads as metal against a near-black stage — that is why every
  // fragment in this pack asks for `var(--ink,#070603)`. Half the club's tone,
  // half that base: the card still carries the tenant's colour, and the ramp
  // keeps the contrast it needs.
  inkTint: { toward: "#070603", tenantWeight: 50 },
  designs: [
    { designKey: "match-result", kind: "matchSummary", template: matchResult },
    { designKey: "match-day", kind: "matchDay", template: matchDay },
    { designKey: "countdown", kind: "countdown", template: countdown },
    { designKey: "new-signing", kind: "newSigning", template: newSigning },
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
