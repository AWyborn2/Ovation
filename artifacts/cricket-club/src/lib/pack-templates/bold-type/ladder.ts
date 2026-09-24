import type { PackCardTemplate } from "../types";
import { clubHeaderFields, repeatField, textField } from "../shared";
import { ladderFormats } from "../skeleton-designs";
import { BOLD_LOOK } from "./fragments";

// Bold Type — Ladder. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

export const ladder: PackCardTemplate = {
  kind: "ladder",
  designKey: "ladder",
  name: "Ladder",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("competitionName", "Competition name", "retraVision PREMIER T20"),
    textField("gradeLabel", "Grade label", "A GRADE"),
    textField("asOfLabel", "As-of label", "AFTER RD 3"),
    repeatField("rows", "Ladder rows", "Up to 7 teams"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtagsExtra", "Secondary hashtag", "#YOURLEAGUE"),
    textField("sponsorPresentedBy", "Ladder source", "Your Sponsor"),
  ],
  repeats: [
    {
      key: "rows",
      maxRows: 7,
      variants: ["club"],
      fields: [
        textField("pos", "Position", "1"),
        textField("team", "Team", "Your Club"),
        textField("played", "Played", "3"),
        textField("won", "Won", "3"),
        textField("lost", "Lost", "0"),
        textField("points", "Points", "12"),
      ],
    },
  ],
  formats: ladderFormats(BOLD_LOOK, {
    on: "clubHashtag",
    off: "clubHashtag",
    offLeft: "hashtagsExtra",
  }),
};
