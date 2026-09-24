import type { PackCardTemplate } from "../types";
import { clubHeaderFields, photoField, textField } from "../shared";
import { premiershipFormats } from "../skeleton-designs";
import { BOLD_LOOK } from "./fragments";

// Bold Type — Premiership. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

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
  formats: premiershipFormats(BOLD_LOOK),
};
