import type { PackCardTemplate } from "../types";
import { clubHeaderFields, photoField, textField } from "../shared";
import { debutFormats } from "../skeleton-designs";
import { SUNSET_LOOK } from "./fragments";

// Sunset — A Grade Debut. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.
//
// Gains `clubName` / `clubTagline`: the shared skeleton header carries the
// club identity on every card (Broadcast Dark's debut gained them in U12).

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
  formats: debutFormats(SUNSET_LOOK, { on: "clubHashtag", off: "hashtags" }),
};
