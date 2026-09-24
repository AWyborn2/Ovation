import type { PackCardTemplate } from "../types";
import { clubHeaderFields, photoField, textField } from "../shared";
import { fiveForFormats } from "../skeleton-designs";
import { NEON_LOOK } from "./fragments";

// Neon Night — Five-for. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: fiveForFormats(NEON_LOOK, { on: "hashtags", off: "hashtags" }),
};
