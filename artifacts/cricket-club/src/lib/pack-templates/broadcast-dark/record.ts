import type { PackCardTemplate } from "../types";
import {
  bgBase,
  bgLayers,
  clubHeaderFields,
  footerRowShared,
  footerRowStory,
  formatRoot,
  goldChip,
  hashtagFooterStory,
  headerTag,
  photoField,
  presentedBy,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A12 — Record. Club record — title, holder, value & grade.

const storyHtml = formatRoot(
  bgLayers() +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216) 0%, rgba(16,18,22,.35) 24%, transparent 52%)"></div>` +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0;pointer-events:none;background:linear-gradient(0deg, rgba(8,9,12,.92), transparent 32%)"></div>` +
    storyHeader(goldChip("RECORD", "story") + headerTag("CLUB BEST")) +
    `<div style="position:absolute;top:300px;left:70px;width:600px"><div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#37CFE6">CLUB RECORD</div><div style="font-family:var(--disp,'Anton',sans-serif);font-size:80px;line-height:.92;margin-top:16px;text-transform:uppercase">{{title}}</div></div>` +
    `<div style="position:absolute;top:660px;left:70px;font-family:var(--disp,'Anton',sans-serif);font-size:210px;line-height:.86;color:var(--gold,#F5B21A)">{{value}}</div>` +
    `<div style="position:absolute;top:1000px;left:74px;font-weight:700;font-size:60px;line-height:1">{{playerName}}</div>` +
    `<div style="position:absolute;top:1080px;left:74px;font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">{{grade}}</div>` +
    sponsorsOn(
      footerRowStory(52, presentedBy("records by", ";text-shadow:0 2px 10px rgba(0,0,0,.8)"), ";text-shadow:0 2px 10px rgba(0,0,0,.7)"),
    ) +
    hashtagFooterStory(60, ";text-shadow:0 2px 10px rgba(0,0,0,.7)"),
);

const sharedHtml = sharedColumnRoot(
  bgBase() +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216) 0%, rgba(16,18,22,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#101216), transparent)"></div>`,
  sharedHeader(goldChip("RECORD", "shared") + headerTag("CLUB BEST")) +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#37CFE6">CLUB RECORD</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);line-height:.92;margin-top:8px;text-transform:uppercase">{{title}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*172px);line-height:.86;color:var(--gold,#FBAC27);margin-top:calc(var(--k,1.4)*10px)">{{value}}</div>` +
    `<div style="font-weight:700;font-size:56px;line-height:1;margin-top:calc(var(--k,1.4)*10px)">{{playerName}}</div>` +
    `<div style="font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:12px">{{grade}}</div>` +
    `</div>` +
    footerRowShared(sponsorsOn(presentedBy("records by"))),
);

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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Records sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
