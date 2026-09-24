import type { PackCardTemplate } from "../types";
import {
  BD_RULE,
  MUTED,
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

// A12 — Record. Record title, the value as the hero numeral, holder, grade;
// holder photo right.

const html = bdCard({
  chip: bdChip("RECORD"),
  tag: "CLUB BEST",
  photo: "photo",
  body: bdColumn(
    bdEyebrow("CLUB RECORD") +
      bdCond("{{title}}", 7.4, ";margin-top:1.4cqmin") +
      bdDisplay("{{value}}", 36, ";line-height:.84") +
      BD_RULE +
      bdCond("{{playerName}}", 7) +
      bdEyebrow("{{grade}}", MUTED, ";margin-top:1.6cqmin;font-weight:500"),
  ),
  footer: bdFooterPresented("records by"),
});

export const record: PackCardTemplate = {
  kind: "record",
  designKey: "record",
  name: "Record",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("title", "Record title", "HIGHEST SCORE"),
    textField("value", "Record value", "156*"),
    textField("playerName", "Record holder", "Tim Miles"),
    textField("grade", "Grade", "A GRADE"),
    photoField("photo", "Record holder photo", "Record holder photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Records sponsor", "Your Sponsor"),
  ],
  formats: bdFormats(() => html),
};
