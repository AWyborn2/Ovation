import type { PackCardTemplate } from "../types";
import { clubHeaderFields, textField } from "../shared";
import { countdownFormats } from "../skeleton-designs";
import { BOLD_LOOK } from "./fragments";

// Bold Type — Countdown. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

export const countdown: PackCardTemplate = {
  kind: "countdown",
  designKey: "countdown",
  name: "Countdown",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("eventLabel", "Event label", "SEASON OPENER"),
    textField("daysToGo", "Days to go", "2"),
    textField("hypeLine1", "Hype line 1", "NEW SEASON"),
    textField("hypeLine2", "Hype line 2", "SAME HUNGER"),
    textField("dateVenue", "Date / venue", "Sat 8 Nov · Rushton Park"),
    textField("fixtureLine", "Fixture line", "vs Mariners · first ball 12:30 PM"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Season launch sponsor", "Your Sponsor"),
  ],
  formats: countdownFormats(BOLD_LOOK, { on: "clubHashtag", off: "hashtags" }),
};
