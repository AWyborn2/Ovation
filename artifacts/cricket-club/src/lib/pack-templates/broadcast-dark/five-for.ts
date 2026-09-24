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

// A16 — Five-for. Figures as the hero numeral with overs beside them, player,
// match line; bowler photo right. Wicket count rides under the chip.

const html = bdCard({
  chip: bdChip("FIVE-FOR"),
  tag: "{{wickets}} WICKETS",
  photo: "photo",
  body: bdColumn(
    bdEyebrow("FIVE-WICKET HAUL") +
      `<div style="display:flex;align-items:flex-end;gap:2.4cqmin">` +
      bdDisplay("{{figures}}", 32, ";line-height:.84") +
      `<div style="font-family:${SK_COND};font-weight:700;font-size:6cqmin;line-height:1;color:${MUTED};padding-bottom:1cqmin">(<span>{{overs}}</span>)</div>` +
      `</div>` +
      bdCond("FIVE-FOR", 8.4, ";margin-top:1cqmin") +
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

export const fiveFor: PackCardTemplate = {
  kind: "fiveFor",
  designKey: "five-for",
  name: "Five-for",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("playerName", "Player name", "Alex Osborne"),
    textField("grade", "Grade", "A GRADE"),
    textField("wickets", "Wickets", "5"),
    textField("figures", "Figures", "5/23"),
    textField("overs", "Overs", "8.2"),
    textField("opponent", "Opponent", "MANDURAH"),
    textField("round", "Round", "5"),
    photoField("photo", "Bowler photo", "Bowler photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: bdFormats(() => html),
};
