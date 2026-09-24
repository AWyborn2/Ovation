import type { PackCardTemplate } from "../types";
import { clubHeaderFields, photoField, textField } from "../shared";
import { centuryFormats } from "../skeleton-designs";
import { SUNSET_LOOK } from "./fragments";

// Sunset — Century. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

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
  formats: centuryFormats(SUNSET_LOOK, { on: "clubHashtag", off: "hashtags" }),
};
