import type { PackCardTemplate } from "../types";
import {
  ACC,
  BD_RULE,
  DISP,
  bdCard,
  bdChip,
  bdColumn,
  bdCond,
  bdDisplay,
  bdEyebrow,
  bdFooterPresented,
  bdFormats,
  bdSub,
  clubHeaderFields,
  textField,
  type BdFormat,
} from "./fragments";

// A10 — Countdown. Hype lines, the days-to-go numeral with its label beside
// it, date/venue and fixture. Landscape sets the hype beside the number.

function build(fmt: BdFormat): string {
  const hype =
    bdEyebrow("{{eventLabel}}") +
    bdDisplay(
      `{{hypeLine1}}<br><span style="color:${ACC}">{{hypeLine2}}</span>`,
      10,
      ";line-height:.92",
    );
  const days =
    `<div style="display:flex;align-items:flex-end;gap:2.6cqmin">` +
    `<div style="font-family:${DISP};font-size:34cqmin;line-height:.82">{{daysToGo}}</div>` +
    bdCond("DAYS<br>TO GO", 7, `;line-height:.95;color:${ACC};padding-bottom:1.4cqmin`) +
    `</div>`;
  const when =
    BD_RULE + bdCond("{{dateVenue}}", 5) + bdSub("{{fixtureLine}}", ";margin-top:1.2cqmin");
  if (fmt === "landscape") {
    return bdCard({
      chip: bdChip("COUNTDOWN"),
      body:
        `<div style="display:flex;align-items:center;gap:8cqmin">` +
        `<div style="flex:none;width:82cqmin">${hype}</div>` +
        `<div style="flex:none">${days}${when}</div>` +
        `</div>`,
      footer: bdFooterPresented("season launch ·", { offLeft: "hashtagsExtra" }),
    });
  }
  return bdCard({
    chip: bdChip("COUNTDOWN"),
    body: bdColumn(hype + `<div style="margin-top:3cqmin">${days}</div>` + when, true),
    footer: bdFooterPresented("season launch ·", { offLeft: "hashtagsExtra" }),
  });
}

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
    textField("hashtagsExtra", "Secondary hashtag", "#YOURLEAGUE"),
    textField("sponsorPresentedBy", "Season launch sponsor", "Your Sponsor"),
  ],
  formats: bdFormats(build),
};
