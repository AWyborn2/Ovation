import type { PackCardTemplate } from "../types";
import { SK_COND } from "../shared";
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

// A15 — Century. Runs as the hero numeral with balls beside it, player,
// match line; batter photo right.

const html = bdCard({
  chip: bdChip("CENTURY"),
  photo: "photo",
  body: bdColumn(
    bdEyebrow("RAISED THE BAT") +
      `<div style="display:flex;align-items:flex-end;gap:2.4cqmin">` +
      bdDisplay("{{runs}}", 36, ";line-height:.84") +
      `<div style="font-family:${SK_COND};font-weight:700;font-size:6cqmin;line-height:1;color:${MUTED};padding-bottom:1cqmin">(<span>{{balls}}</span>)</div>` +
      `</div>` +
      bdCond("CENTURY", 8.4, ";margin-top:1cqmin") +
      BD_RULE +
      bdCond("{{playerName}}", 7) +
      bdEyebrow(
        "<span>{{grade}}</span> · vs <span>{{opponent}}</span> · RD <span>{{round}}</span>",
        MUTED,
        ";margin-top:1.6cqmin;font-weight:500",
      ),
  ),
  footer: bdFooterPresented("presented by"),
});

export const century: PackCardTemplate = {
  kind: "century",
  designKey: "century",
  name: "Century",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("playerName", "Player name", "Jack Manuel"),
    textField("grade", "Grade", "A GRADE"),
    textField("runs", "Runs", "112*"),
    textField("balls", "Balls", "68"),
    textField("opponent", "Opponent", "BALDIVIS"),
    textField("round", "Round", "4"),
    photoField("photo", "Batter photo", "Batter photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: bdFormats(() => html),
};
