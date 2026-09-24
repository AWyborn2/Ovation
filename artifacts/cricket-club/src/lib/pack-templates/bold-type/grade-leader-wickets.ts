import type { PackCardTemplate } from "../types";
import { clubHeaderFields, photoField, textField } from "../shared";
import { gradeLeaderFormats } from "../skeleton-designs";
import { BOLD_LOOK } from "./fragments";

// Bold Type — Leaderboard — Leading Wicket-Taker. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

export const gradeLeaderWickets: PackCardTemplate = {
  kind: "gradeLeader",
  designKey: "grade-leader-wickets",
  name: "Leaderboard — Leading Wicket-Taker",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("grade", "Grade", "A GRADE"),
    textField("category", "Category", "WICKETS"),
    textField("value", "Leading value", "24"),
    textField("playerName", "Leader", "Alex Osborne"),
    textField("season", "Season", "2025/26"),
    photoField("photo", "Player photo", "Bowler photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  formats: gradeLeaderFormats(BOLD_LOOK, "Wickets", { on: "clubHashtag", off: "clubHashtag" }),
};
