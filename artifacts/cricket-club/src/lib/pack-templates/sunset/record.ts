import type { PackCardTemplate } from "../types";
import { clubHeaderFields, photoField, textField } from "../shared";
import { recordFormats } from "../skeleton-designs";
import { SUNSET_LOOK } from "./fragments";

// Sunset — Record. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

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
    textField("sponsorPresentedBy", "Records sponsor", "Your Sponsor"),
  ],
  formats: recordFormats(SUNSET_LOOK, { on: "clubHashtag", off: "clubHashtag" }),
};
