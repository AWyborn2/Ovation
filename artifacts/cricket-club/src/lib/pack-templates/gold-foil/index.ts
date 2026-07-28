import type { PackManifest } from "../types";
import { matchResult } from "./match-result";
import { matchDay } from "./match-day";
import { countdown } from "./countdown";
import { newSigning } from "./new-signing";
import { newCap } from "./new-cap";
import { premiership } from "./premiership";
import { teamList } from "./team-list";
import { weekendWrap } from "./weekend-wrap";
import { ladder } from "./ladder";

/**
 * Pack B — Gold Foil. Grand-final prestige: metallic foil display type on
 * black, concentric gold grooves, gold ribbon callouts.
 *
 * **Coverage is intentionally partial and grows card by card.** The bundle has
 * 20 designs; only those transcribed here are listed, and the api-server
 * `PACKS` entry declares the SAME kinds. That pairing is the coverage contract:
 * a tenant is only ever offered Gold Foil for a kind it can actually render, so
 * an untranscribed kind falls back to Broadcast Dark rather than rendering
 * blank. Add the kind in both places when its module lands.
 *
 * Remaining (18 of 20 need portrait/square authored — the bundle ships those
 * two formats only for Match Result and Club Leaderboard·Wickets):
 * match-day, player-spotlight, team-list, milestone, weekend-wrap, ladder,
 * big-moment, new-signing, countdown, debut, record, grade-leader-runs,
 * premiership, new-cap, century, five-for, grade-leader-wickets,
 * club-leaderboard-runs, club-leaderboard-wickets.
 */
export const GOLD_FOIL_PACK: PackManifest = {
  packId: "gold-foil-v1",
  name: "Gold Foil",
  designs: [
    { designKey: "match-result", kind: "matchSummary", template: matchResult },
    { designKey: "match-day", kind: "matchDay", template: matchDay },
    { designKey: "countdown", kind: "countdown", template: countdown },
    { designKey: "new-signing", kind: "newSigning", template: newSigning },
    { designKey: "new-cap", kind: "newCap", template: newCap },
    { designKey: "premiership", kind: "premiership", template: premiership },
    { designKey: "team-list", kind: "teamList", template: teamList },
    { designKey: "weekend-wrap", kind: "weekendWrap", template: weekendWrap },
    { designKey: "ladder", kind: "ladder", template: ladder },
  ],
};
