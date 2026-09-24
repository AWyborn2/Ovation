import type { PackCardTemplate } from "../types";
import { bdFormats, clubHeaderFields, photoField, textField } from "./fragments";
import { gradeLeaderHtml } from "./grade-leader-runs";

// A18 — Leading Wicket-Taker (gradeLeader · Wickets preset). Same layout as
// A13 with the heading swapped.

const html = gradeLeaderHtml("LEADING<br>WICKET-TAKER");

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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  formats: bdFormats(() => html),
};
