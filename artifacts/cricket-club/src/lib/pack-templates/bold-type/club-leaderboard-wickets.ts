import type { PackCardTemplate } from "../types";
import { clubHeaderFields, repeatField, textField } from "../shared";
import { clubLeadersFormats } from "../skeleton-designs";
import { BOLD_LOOK } from "./fragments";

// Bold Type — Club Leaders — Wickets. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

export const clubLeaderboardWickets: PackCardTemplate = {
  kind: "clubLeaderboard",
  designKey: "club-leaderboard-wickets",
  name: "Club Leaders — Wickets",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("category", "Category chip", "TOP WICKETS"),
    textField("season", "Season", "2025/26"),
    textField("subtitle", "Subtitle", "LEADING WICKET-TAKERS · BY GRADE"),
    textField("title", "Title", "CLUB WICKETS"),
    repeatField("leaders", "Per-grade leader rows", "4 grade leaders"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtagsExtra", "Secondary hashtag", "#YOURLEAGUE"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  repeats: [
    {
      key: "leaders",
      maxRows: 4,
      fields: [
        textField("gradeLabel", "Grade", "A"),
        textField("gradeSub", "Grade sub-label", "GRADE"),
        textField("playerName", "Leader", "Alex Osborne"),
        textField("value", "Value", "24"),
      ],
    },
  ],
  formats: clubLeadersFormats(BOLD_LOOK, "Wickets", {
    on: "clubHashtag",
    off: "clubHashtag",
    offLeft: "hashtagsExtra",
  }),
};
