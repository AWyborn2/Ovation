import type { PackCardTemplate } from "../types";
import { clubHeaderFields, repeatField, textField } from "../shared";
import { weekendWrapFormats } from "../skeleton-designs";
import { BOLD_LOOK } from "./fragments";

// Bold Type — Weekend Wrap. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

export const weekendWrap: PackCardTemplate = {
  kind: "weekendWrap",
  designKey: "weekend-wrap",
  name: "Weekend Wrap",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("roundLabel", "Round label", "ROUND 3"),
    textField("dateRange", "Date range", "8–9 NOVEMBER"),
    repeatField("matches", "Per-grade result rows", "4 grade results"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtagsExtra", "Secondary hashtag", "#YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  repeats: [
    {
      key: "matches",
      maxRows: 4,
      variants: ["lost"],
      fields: [
        textField("gradeLabel", "Grade", "A"),
        textField("gradeSub", "Grade sub-label", "GRADE"),
        textField("resultLine", "Result line", "Your Club 2/102 d. R'ham Hornets 9/97"),
        textField("performers", "Top performers", "J. Manuel 39* · A. Osborne 3/13"),
        textField("outcome", "Outcome", "WON"),
      ],
    },
  ],
  formats: weekendWrapFormats(BOLD_LOOK, {
    on: "clubHashtag",
    off: "clubHashtag",
    offLeft: "hashtagsExtra",
  }),
};
