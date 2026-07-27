import type { PackCardTemplate } from "../types";
import {
  bgLayers,
  clubHeaderFields,
  footerRowShared,
  footerRowStory,
  formatRoot,
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

// A8 — Big Moment (live). In-play hit — fifty / century / wicket with live
// score. Uses the red LIVE chip instead of the gold pill and a slightly
// stronger gold beam (16%) per the bundle.

const liveChip =
  `<div style="display:inline-flex;align-items:center;gap:9px;background:#E23B3B;color:#fff;font-weight:800;font-size:20px;line-height:1;letter-spacing:.06em;padding:11px 15px;border-radius:7px"><span style="width:12px;height:12px;border-radius:50%;background:#fff;color:#E23B3B;animation:hhPulse 1.4s ease-in-out infinite"></span>LIVE</div>`;

const storyHtml = formatRoot(
  bgLayers(16) +
    storyHeader(liveChip + headerTag("vs {{oppositionName}}")) +
    `<div style="position:absolute;top:300px;left:70px;right:70px;text-align:center">` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:230px;line-height:.86;color:var(--gold,#F5B21A);text-shadow:0 0 46px color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent)">{{momentLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:120px;line-height:.94;margin-top:6px;text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:700;font-size:40px;line-height:1;color:#fff;margin-top:18px">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:32px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    `</div>` +
    `<div style="position:absolute;top:1120px;left:70px;right:70px;background:linear-gradient(90deg,var(--panel,var(--panel,#6E1C2B)),var(--panel-2,var(--panel-2,#4a121e)));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 35%, transparent);border-radius:18px;padding:36px 34px;text-align:center">` +
    `<div style="font:600 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.65)">{{inningsLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:150px;line-height:.9;color:var(--gold,#F5B21A);margin-top:12px">{{liveScore}}</div>` +
    `<div style="font-weight:600;font-size:30px;line-height:1.3;color:#fff;margin-top:12px">{{oversChaseLine}}</div>` +
    `<div style="font-weight:500;font-size:24px;color:rgba(255,255,255,.7);margin-top:6px">{{equation}}</div>` +
    `</div>` +
    hashtagFooterStory(60) +
    sponsorsOn(footerRowStory(56, presentedBy("live scoring by"))),
);

const sharedHtml = sharedColumnRoot(
  bgLayers(16),
  sharedHeader(liveChip + headerTag("vs {{oppositionName}}")) +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:calc(var(--k,1.4)*14px)">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*168px);line-height:.86;color:var(--gold,#FBAC27);text-shadow:0 0 46px color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent)">{{momentLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:.94;text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:700;font-size:36px;line-height:1;color:#fff">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:28px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    `<div style="width:100%;max-width:760px;margin-top:calc(var(--k,1.4)*10px);background:linear-gradient(90deg,var(--panel,#42342B),var(--panel-2,#241c17));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 35%, transparent);border-radius:18px;padding:30px 34px"><div style="font:600 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.65)">{{inningsLabel}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*100px);line-height:.9;color:var(--gold,#FBAC27);margin-top:10px">{{liveScore}}</div><div style="font-weight:600;font-size:27px;line-height:1.3;color:#fff;margin-top:10px">{{oversChaseLine}}</div><div style="font-weight:500;font-size:22px;color:rgba(255,255,255,.7);margin-top:5px">{{equation}}</div></div>` +
    `</div>` +
    footerRowShared(
      sponsorsOn(presentedBy("live scoring ·")) +
        sponsorsOff(
          `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
        ),
    ),
);

export const bigMoment: PackCardTemplate = {
  kind: "bigMoment",
  designKey: "big-moment",
  name: "Big Moment · Live",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("oppositionName", "Opposition name", "MARINERS"),
    textField("momentLabel", "Moment label", "FIFTY!"),
    textField("playerName", "Player name", "JACK MANUEL"),
    textField("runs", "Runs", "50"),
    textField("balls", "Balls faced", "41"),
    textField("boundaryDetail", "Boundary detail", "6 fours · 1 six"),
    textField("inningsLabel", "Innings label", "YOUR CLUB · 2ND INNINGS"),
    textField("liveScore", "Live score", "2/128"),
    textField("oversChaseLine", "Overs / chase line", "14.2 overs · chasing 176"),
    textField("equation", "Equation", "Need 48 from 34 balls"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · LIVE UPDATES"),
    textField("hashtagsExtra", "Secondary footer tag", "LIVE UPDATES"),
    textField("sponsorPresentedBy", "Live scoring sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
