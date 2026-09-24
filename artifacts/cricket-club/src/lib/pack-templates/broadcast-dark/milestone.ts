import type { PackCardTemplate } from "../types";
import {
  BD_RULE,
  bdCard,
  bdChip,
  bdColumn,
  bdCond,
  bdDisplay,
  bdEyebrow,
  bdFooterOn,
  bdFormats,
  bdSub,
  clubHeaderFields,
  photoField,
  textField,
} from "./fragments";

// A5 — Milestone. The handoff's "career milestone" card: mono tier, giant
// display number, label, accent rule, player, tribute line; photo right.
// No sponsors-off branch in the bundle — honoured as designed. With no photo
// bound the photo treatment drops and the column stands on the stage.

const html = bdCard({
  chip: bdChip("MILESTONE"),
  photo: "photo",
  body: bdColumn(
    bdEyebrow("{{tierLabel}}") +
      bdDisplay("{{currentValue}}", 36, ";line-height:.84") +
      bdCond("{{milestoneLabel}}", 8.4, ";margin-top:1cqmin") +
      BD_RULE +
      bdCond("{{playerName}}", 7) +
      bdSub("{{headline}}", ";margin-top:1.6cqmin;max-width:76cqmin"),
  ),
  footer: bdFooterOn("proudly supported by"),
});

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
  formats: bdFormats(() => html),
};
