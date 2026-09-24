import type { PackCardTemplate } from "../types";
import {
  ACC,
  BD_RULE,
  bdCard,
  bdChip,
  bdColumn,
  bdCond,
  bdDisplay,
  bdEyebrow,
  bdFooterPresented,
  bdFormats,
  clubHeaderFields,
  photoField,
  textField,
} from "./fragments";

// A13 — Leaderboard (gradeLeader · Runs preset). The grade's leader with the
// big number; photo right. A18 (Wickets preset) reuses this layout.

/** Shared Grade Leader markup; `title` is the preset's two-line heading. */
export function gradeLeaderHtml(title: string): string {
  return bdCard({
    chip: bdChip("LEADERBOARD"),
    tag: "{{season}}",
    photo: "photo",
    body: bdColumn(
      bdEyebrow("<span>{{grade}}</span> LEADERBOARD") +
        bdCond(title, 7, ";margin-top:1.4cqmin;line-height:.95") +
        bdDisplay("{{value}}", 34, ";line-height:.84;margin-top:2cqmin") +
        bdCond("{{category}}", 6, `;color:${ACC};margin-top:.6cqmin`) +
        BD_RULE +
        bdCond("{{playerName}}", 7),
    ),
    footer: bdFooterPresented("stats by"),
  });
}

const html = gradeLeaderHtml("LEADING<br>RUN-SCORER");

export const gradeLeaderRuns: PackCardTemplate = {
  kind: "gradeLeader",
  designKey: "grade-leader-runs",
  name: "Leaderboard — Leading Run-Scorer",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("grade", "Grade", "A GRADE"),
    textField("category", "Category", "RUNS"),
    textField("value", "Leading value", "428"),
    textField("playerName", "Leader", "Jack Manuel"),
    textField("season", "Season", "2025/26"),
    photoField("photo", "Player photo", "Player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  formats: bdFormats(() => html),
};
