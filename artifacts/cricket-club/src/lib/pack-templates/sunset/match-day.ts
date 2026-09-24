import type { PackCardTemplate } from "../types";
import { clubHeaderFields, logoField, textField } from "../shared";
import { matchDayFormats } from "../skeleton-designs";
import { SUNSET_LOOK } from "./fragments";

// Sunset — Match Day. The kind's shared skeleton body (`skeleton-designs.ts`)
// in this pack's look (`./fragments`). Field keys, slots, repeats and sponsor
// variants are the pack's own, unchanged.

export const matchDay: PackCardTemplate = {
  kind: "matchDay",
  designKey: "match-day",
  name: "Match Day",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("roundLabel", "Round label", "THIS SATURDAY · ROUND 3"),
    textField("opposition.name", "Opposition name", "MARINERS"),
    logoField("opposition.logo", "Opposition logo", "Opponent logo"),
    textField("homeAway", "Club home/away label", "HOME"),
    textField("oppositionHomeAway", "Opposition home/away label", "AWAY"),
    textField("venue", "Ground", "Rushton Park"),
    textField("date", "Date", "Sat 8 Nov"),
    textField("startTime", "Start time", "12:30 PM"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  formats: matchDayFormats(SUNSET_LOOK, { note: false }),
};
