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
  photoField,
  presentedBy,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A17 — Five-for. Five-wicket haul — figures, overs, opponent & round. The
// header tag composes "{{wickets}} WICKETS".

const wicketsTagStory = `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.6);margin-top:11px"><span>{{wickets}}</span> WICKETS</div>`;

const storyHtml = formatRoot(
  bgLayers() +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216) 0%, rgba(16,18,22,.35) 24%, transparent 52%)"></div>` +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0;pointer-events:none;background:linear-gradient(0deg, rgba(8,9,12,.92), transparent 32%)"></div>` +
    storyHeader(goldChip("FIVE-FOR", "story") + wicketsTagStory) +
    `<div style="position:absolute;top:300px;left:70px;width:600px"><div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#37CFE6">FIVE-WICKET HAUL</div><div style="font-family:var(--disp,'Anton',sans-serif);font-size:96px;line-height:.92;margin-top:14px;text-transform:uppercase">FIVE-FOR</div></div>` +
    `<div style="position:absolute;top:620px;left:70px;font-family:var(--disp,'Anton',sans-serif);font-size:200px;line-height:.86;color:var(--gold,#F5B21A)"><span>{{figures}}</span><span style="font-size:56px;color:rgba(255,255,255,.6)"> (<span>{{overs}}</span>)</span></div>` +
    `<div style="position:absolute;top:930px;left:74px;font-weight:700;font-size:64px;line-height:1">{{playerName}}</div>` +
    `<div style="position:absolute;top:1020px;left:74px;font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6)"><span>{{grade}}</span> · vs <span>{{opponent}}</span> · RD <span>{{round}}</span></div>` +
    sponsorsOn(
      footerRowStory(52, presentedBy("presented by", ";text-shadow:0 2px 10px rgba(0,0,0,.8)"), ";text-shadow:0 2px 10px rgba(0,0,0,.7)"),
    ) +
    hashtagFooterStory(60, ";text-shadow:0 2px 10px rgba(0,0,0,.7)"),
);

const sharedHtml = sharedColumnRoot(
  bgBase() +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216) 0%, rgba(16,18,22,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#101216), transparent)"></div>`,
  sharedHeader(goldChip("FIVE-FOR", "shared") + wicketsTagStory) +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:620px">` +
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#37CFE6">FIVE-WICKET HAUL</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*78px);line-height:.92;margin-top:6px;text-transform:uppercase">FIVE-FOR</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*158px);line-height:.86;color:var(--gold,#FBAC27);margin-top:calc(var(--k,1.4)*8px)"><span>{{figures}}</span><span style="font-size:calc(var(--k,1.4)*46px);color:rgba(255,255,255,.6)"> (<span>{{overs}}</span>)</span></div>` +
    `<div style="font-weight:700;font-size:60px;line-height:1;margin-top:calc(var(--k,1.4)*10px)">{{playerName}}</div>` +
    `<div style="font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6);margin-top:12px"><span>{{grade}}</span> · vs <span>{{opponent}}</span> · RD <span>{{round}}</span></div>` +
    `</div>` +
    footerRowShared(sponsorsOn(presentedBy("presented by"))),
);

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
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("hashtags", "Hashtag footer", "#HALLSHEAD · #PEELPREMIERLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "eSA Sport"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
