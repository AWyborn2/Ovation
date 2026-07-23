import type { PackCardTemplate } from "../types";
import {
  bgLayers,
  clubHeaderFields,
  footerRowShared,
  footerRowStory,
  formatRoot,
  goldChip,
  hashtagFooterStory,
  headerTag,
  presentedBy,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A10 — Countdown. Hype / countdown to the season opener or finals. Slightly
// stronger gold beam (14%) per the bundle.

const storyHtml = formatRoot(
  bgLayers(14) +
    storyHeader(goldChip("COUNTDOWN", "story") + headerTag("{{eventLabel}}")) +
    `<div style="position:absolute;top:250px;left:70px;right:70px;text-align:center">` +
    `<div style="font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;color:#37CFE6">{{eventLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:112px;line-height:.94;margin-top:16px;text-transform:uppercase">{{hypeLine1}}<br><span style="color:var(--gold,#F5B21A)">{{hypeLine2}}</span></div>` +
    `</div>` +
    `<div style="position:absolute;top:720px;left:0;right:0;text-align:center">` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:400px;line-height:.8;color:var(--gold,#F5B21A);text-shadow:0 0 70px color-mix(in srgb, var(--gold,#FBAC27) 35%, transparent)">{{daysToGo}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:92px;line-height:1;margin-top:-6px;text-transform:uppercase">Days to go</div>` +
    `</div>` +
    `<div style="position:absolute;top:1420px;left:70px;right:70px;background:linear-gradient(90deg,var(--panel,var(--panel,#6E1C2B)),var(--panel-2,var(--panel-2,#4a121e)));border-left:9px solid var(--gold,#F5B21A);border-radius:9px;padding:28px 32px;text-align:center">` +
    `<div style="font-weight:800;font-size:34px;line-height:1.2">{{dateVenue}}</div>` +
    `<div style="font-weight:500;font-size:24px;color:rgba(255,255,255,.72);margin-top:8px">{{fixtureLine}}</div>` +
    `</div>` +
    hashtagFooterStory(60) +
    sponsorsOn(footerRowStory(56, presentedBy("season launch ·"))),
);

const sharedHtml = sharedColumnRoot(
  bgLayers(14),
  sharedHeader(goldChip("COUNTDOWN", "shared") + headerTag("{{eventLabel}}")) +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">` +
    `<div style="flex:none"><div style="font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;color:#37CFE6">{{eventLabel}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*76px);line-height:.98;margin-top:14px;text-transform:uppercase">{{hypeLine1}}<br><span style="color:var(--gold,#FBAC27)">{{hypeLine2}}</span></div></div>` +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*4px)"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*260px);line-height:.8;color:var(--gold,#FBAC27);text-shadow:0 0 70px color-mix(in srgb, var(--gold,#FBAC27) 35%, transparent)">{{daysToGo}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*66px);line-height:1;margin-top:calc(var(--k,1.4)*-6px);text-transform:uppercase">Days to go</div></div>` +
    `<div style="flex:none;width:100%;max-width:820px;margin-top:calc(var(--k,1.4)*18px);background:linear-gradient(90deg,var(--panel,#42342B),var(--panel-2,#241c17));border-left:9px solid var(--gold,#FBAC27);border-radius:9px;padding:26px 32px"><div style="font-weight:800;font-size:32px;line-height:1.2">{{dateVenue}}</div><div style="font-weight:500;font-size:23px;color:rgba(255,255,255,.72);margin-top:8px">{{fixtureLine}}</div></div>` +
    `</div>` +
    footerRowShared(
      sponsorsOn(presentedBy("season launch ·")) +
        sponsorsOff(
          `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
        ),
    ),
);

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
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("hashtags", "Hashtag footer", "#HALLSHEAD · #PEELPREMIERLEAGUE"),
    textField("hashtagsExtra", "Secondary hashtag", "#PEELPREMIERLEAGUE"),
    textField("sponsorPresentedBy", "Season launch sponsor", "eSA Sport"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
