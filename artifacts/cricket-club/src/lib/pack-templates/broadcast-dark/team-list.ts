import type { PackCardTemplate } from "../types";
import {
  SPONSOR_STRIP_STORY,
  bgLayers,
  clubHeaderFields,
  formatRoot,
  goldChip,
  hashtagFooterShared,
  hashtagFooterStory,
  headerTag,
  logoField,
  photoField,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorStripShared,
  storyHeader,
  textField,
} from "./fragments";

// A4 — Team List. Starting XI (≤12 names) with captain & keeper marked, squad
// photo beside the list. The bundle's 12 hard-coded rows collapse into one
// data-repeat row template per format; the role suffix "(C)"/"(WK)" renders
// only when the row has a role.

const storyRow =
  `<div style="display:flex;align-items:center;gap:22px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.1)">` +
  `<span style="font-family:var(--disp,'Anton',sans-serif);font-size:38px;color:var(--gold,#F5B21A);width:52px">{{row.number}}</span>` +
  `<span style="font-weight:700;font-size:34px;line-height:1;flex:1">{{row.surname}} <span style="font-size:22px;color:var(--gold,#F5B21A)">({{row.role}})</span></span>` +
  `</div>`;

const storyHtml = formatRoot(
  bgLayers() +
    storyHeader(goldChip("TEAM LIST", "story") + headerTag("{{gradeRound}}")) +
    `<div style="position:absolute;top:236px;left:70px;right:70px">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#F5B21A)">{{competitionLine}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:150px;line-height:.94;text-transform:uppercase;margin-top:12px">TEAM LINE UP</div>` +
    `</div>` +
    `<div style="position: absolute; top: 512px; left: 470px; right: 70px; height: 1230px; border-radius: 16px; overflow: hidden; box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent); width: 597px">${slot("squadPhoto", "photo")}</div>` +
    `<div style="position: absolute; top: 512px; left: 84px; height: 396px; pointer-events: none; border-radius: 16px; box-shadow: inset 0 -90px 90px -40px rgba(8,9,12,.85)"></div>` +
    `<div style="position: absolute; top: 437px; left: 98px; font: 600 17px/1 ui-monospace,Menlo,monospace; letter-spacing: .16em; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.8)">{{venueDateTime}}</div>` +
    `<div data-repeat="players" style="position: absolute; top: 562px; left: 70px; right: 70px; display: flex; flex-direction: column; width: 540px; height: 957px">${storyRow}</div>` +
    SPONSOR_STRIP_STORY +
    hashtagFooterStory(66),
);

const sharedRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:16px;border-bottom:1px solid rgba(255,255,255,.1)">` +
  `<span style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1)*34px);color:var(--gold,#FBAC27);width:calc(var(--k,1)*48px)">{{row.number}}</span>` +
  `<span style="font-weight:700;font-size:calc(var(--k,1)*28px);line-height:1;flex:1">{{row.surname}} <span style="font-size:calc(var(--k,1)*18px);color:var(--gold,#FBAC27)">({{row.role}})</span></span>` +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  bgLayers(),
  sharedHeader(goldChip("TEAM LIST", "shared") + headerTag("{{gradeRound}}")) +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)"><div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{competitionLine}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*100px);line-height:.94;text-transform:uppercase;margin-top:12px">TEAM LINE UP</div></div>` +
    `<div style="flex:1;min-height:0;display:flex;gap:26px;margin-top:calc(var(--k,1.4)*18px)">` +
    `<div data-repeat="players" style="flex:1;min-width:0;display:flex;flex-direction:column">${sharedRow}</div>` +
    `<div style="flex:1.12;min-width:0;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent)">${slot("squadPhoto", "photo")}<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -90px 90px -40px rgba(8,9,12,.85)"></div><div style="position:absolute;bottom:22px;left:24px;right:24px;font:600 calc(var(--k,1)*15px)/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{venueDateTime}}</div></div>` +
    `</div>` +
    sponsorStripShared(";margin-top:calc(var(--k,1.4)*16px)") +
    hashtagFooterShared(";margin-top:calc(var(--k,1.4)*16px)"),
);

export const teamList: PackCardTemplate = {
  kind: "teamList",
  designKey: "team-list",
  name: "Team List",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("gradeRound", "Grade + round", "A GRADE · RD 3"),
    textField("competitionLine", "Competition line", "PREMIER T20 · ROUND 3 · vs MARINERS"),
    textField("venueDateTime", "Venue / date / time", "RUSHTON PARK · SAT 8 NOV · 12:30 PM"),
    photoField("squadPhoto", "Squad photo", "Squad / team photo"),
    repeatField("players", "Player rows", "Up to 12 players"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  repeats: [
    {
      key: "players",
      maxRows: 12,
      fields: [
        textField("number", "Order", "3"),
        textField("surname", "Surname", "MANUEL"),
        textField("role", "Role (C/WK)", "C"),
      ],
    },
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
