import type { PackCardTemplate } from "../types";
import { clubLeadersBuild } from "./club-leaderboard-runs";
import { bdFormats, clubHeaderFields, repeatField, textField } from "./fragments";

// A20 — Club Leaders · Wickets (clubLeaderboard · Wickets preset). Leading
// wicket-taker for every grade, one card. Same layout as A19.

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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
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
  formats: bdFormats(clubLeadersBuild),
};
