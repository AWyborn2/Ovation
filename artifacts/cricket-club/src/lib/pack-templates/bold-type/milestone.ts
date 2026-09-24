import type { PackCardTemplate } from "../types";
import { clubHeaderFields, photoField, textField } from "../shared";
import { milestoneFormats } from "../skeleton-designs";
import { BOLD_LOOK } from "./fragments";

// Bold Type — Milestone. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

export const milestone: PackCardTemplate = {
  kind: "milestone",
  designKey: "milestone",
  name: "Milestone",
  sponsorVariants: ["on"],
  fields: [
    ...clubHeaderFields(),
    textField("tierLabel", "Tier label", "CLUB MILESTONE"),
    textField("currentValue", "Milestone value", "100"),
    textField("milestoneLabel", "Milestone label", "GAMES"),
    textField("playerName", "Player name", "TIM MILES"),
    textField(
      "headline",
      "Tribute line",
      "100 Premier League games for the club. A true club great — thanks for every one, Milesy.",
    ),
    photoField("photo", "Player photo", "Player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: milestoneFormats(BOLD_LOOK),
};
