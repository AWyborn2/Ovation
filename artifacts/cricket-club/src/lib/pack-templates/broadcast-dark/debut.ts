import type { PackCardTemplate } from "../types";
import {
  MUTED,
  bdAccentPill,
  bdCard,
  bdChip,
  bdColumn,
  bdDisplay,
  bdEyebrow,
  bdFooterPresented,
  bdFormats,
  bdSub,
  clubHeaderFields,
  photoField,
  textField,
} from "./fragments";

// A11 — A Grade Debut. The player's name large, the round/opponent tribute
// line and the cap number on the accent; debut photo right.
//
// Now on the shared skeleton, so it carries the club header like every other
// card (it used to show a grade block instead). The cap line keeps its literal
// `CAP {{capNumber}}` shape inside one `<div>` — `dropEmptyCapNumber` removes
// that div when no cap number resolved, so no fabricated "CAP 246" and no
// orphan "CAP" label.

const html = bdCard({
  chip: bdChip("DEBUT"),
  tag: "{{season}}",
  photo: "photo",
  body: bdColumn(
    bdEyebrow("FIRST GRADE DEBUT · <span>{{grade}}</span>") +
      bdDisplay("{{playerName}}", 14, ";max-width:80cqmin") +
      bdSub(
        `<span style="color:${MUTED}">Round {{round}} · vs {{opponent}} —</span> {{tributeLine}}`,
        ";margin-top:3cqmin;max-width:76cqmin",
      ) +
      bdAccentPill("CAP {{capNumber}}", 5.4, ";margin-top:3.4cqmin"),
  ),
  footer: bdFooterPresented("presented by"),
});

export const debut: PackCardTemplate = {
  kind: "debut",
  designKey: "debut",
  name: "A Grade Debut",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("grade", "Grade", "A GRADE MENS"),
    textField("season", "Season", "2025/26"),
    textField("playerName", "Player name", "Oscar Smith"),
    textField("round", "Round", "2"),
    textField("opponent", "Opponent", "Rockingham Hornets"),
    textField("tributeLine", "Tribute line", "welcome to the top grade, Oscar."),
    textField("capNumber", "Cap number", "246"),
    photoField("photo", "Debut photo", "Cap presentation / debut photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: bdFormats(() => html),
};
