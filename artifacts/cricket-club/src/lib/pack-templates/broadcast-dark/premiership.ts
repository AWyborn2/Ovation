import type { PackCardTemplate } from "../types";
import { SK_MONO, skeletonFooter, skeletonPresentedBy } from "../shared";
import {
  ACC,
  BD_RULE,
  MUTED,
  bdCard,
  bdChip,
  bdColumn,
  bdCond,
  bdDisplay,
  bdEyebrow,
  bdFormats,
  bdHashtags,
  clubHeaderFields,
  photoField,
  sponsorsOn,
  textField,
} from "./fragments";

// A14 — Premiership. Grade and season, PREMIERS in display type, competition,
// the result and the player of the final; the team photo takes the right-hand
// photo slot (dropped with its fades when none was uploaded).

const html = bdCard({
  chip: bdChip("PREMIERS"),
  tag: "CHAMPIONS",
  photo: "teamPhoto",
  body: bdColumn(
    bdEyebrow("<span>{{grade}}</span> · <span>{{season}}</span>") +
      bdDisplay("PREMIERS", 22, ";line-height:.86") +
      bdCond("{{competition}}", 5, `;color:${MUTED};margin-top:1.4cqmin;line-height:1.1`) +
      BD_RULE +
      `<div style="font-size:3.8cqmin;line-height:1.3;font-weight:700;max-width:80cqmin">{{result}}</div>` +
      `<div style="font-family:${SK_MONO};font-weight:500;font-size:2.3cqmin;letter-spacing:.16em;color:${MUTED};margin-top:2.4cqmin">PLAYER OF THE MATCH · <span style="color:${ACC};font-weight:700">{{mom}}</span></div>`,
  ),
  footer: skeletonFooter(
    sponsorsOn(skeletonPresentedBy("season proudly supported by")),
    bdHashtags("hashtags"),
  ),
});

export const premiership: PackCardTemplate = {
  kind: "premiership",
  designKey: "premiership",
  name: "Premiership",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("grade", "Grade", "A GRADE"),
    textField("season", "Season", "2024/25"),
    textField("competition", "Competition", "retraVision Premier T20"),
    textField("result", "Result", "Defeated Rockingham Hornets by 8 wickets"),
    textField("mom", "Player of the match", "ALEX OSBORNE"),
    photoField("teamPhoto", "Team photo", "Premiership team photo"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #PREMIERS"),
    textField("sponsorPresentedBy", "Season sponsor", "Your Sponsor"),
  ],
  formats: bdFormats(() => html),
};
