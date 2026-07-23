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
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorStripShared,
  storyHeader,
  textField,
} from "./fragments";

// A2 — Match Day. Fixture announce: head-to-head, ground, date, start time.

const storyHtml = formatRoot(
  bgLayers() +
    storyHeader(goldChip("MATCH DAY", "story") + headerTag("{{roundLabel}}")) +
    `<div style="position:absolute;top:236px;left:70px;right:70px;text-align:center">` +
    `<div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#F5B21A)">{{roundLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:154px;line-height:.94;text-transform:uppercase;margin-top:14px">MATCH DAY</div>` +
    `</div>` +
    `<div style="position:absolute;top:560px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="width:360px;text-align:center">` +
    `<div style="width:230px;height:230px;border-radius:50%;overflow:hidden;margin:0 auto;box-shadow:0 0 0 4px color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent)">${slot("clubLogo", "logo", "circle")}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:52px;line-height:1;margin-top:22px;color:var(--gold,#F5B21A)">{{clubName}}</div>` +
    `<div style="font:500 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-top:8px">{{homeAway}}</div>` +
    `</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:120px;line-height:1;text-shadow:0 0 34px color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent)">VS</div>` +
    `<div style="width:360px;text-align:center">` +
    `<div style="width:230px;height:230px;border-radius:50%;overflow:hidden;margin:0 auto;background:var(--surface-2,#1f2530);box-shadow:0 0 0 2px rgba(255,255,255,.16)">${slot("opposition.logo", "logo", "circle")}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:52px;line-height:1;margin-top:22px">{{opposition.name}}</div>` +
    `<div style="font:500 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-top:8px">{{oppositionHomeAway}}</div>` +
    `</div>` +
    `</div>` +
    `<div style="position:absolute;top:1096px;left:70px;right:70px;background:linear-gradient(90deg,var(--panel,var(--panel,#6E1C2B)),var(--panel-2,var(--panel-2,#4a121e)));border-left:9px solid var(--gold,#F5B21A);border-radius:9px;padding:28px 30px;display:flex;align-items:center;justify-content:space-around;text-align:center">` +
    `<div><div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">GROUND</div><div style="font-weight:800;font-size:30px;line-height:1.1;margin-top:10px">{{venue}}</div></div>` +
    `<div style="width:1px;height:64px;background:rgba(255,255,255,.2)"></div>` +
    `<div><div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">DATE</div><div style="font-weight:800;font-size:30px;line-height:1.1;margin-top:10px">{{date}}</div></div>` +
    `<div style="width:1px;height:64px;background:rgba(255,255,255,.2)"></div>` +
    `<div><div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">START</div><div style="font-weight:800;font-size:30px;line-height:1.1;margin-top:10px">{{startTime}}</div></div>` +
    `</div>` +
    `<div style="position:absolute;top:1300px;left:70px;right:70px;text-align:center">` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:50px;line-height:1;color:var(--gold,#F5B21A)">{{note.title}}</div>` +
    `<div style="font-weight:500;font-size:24px;line-height:1.3;color:rgba(255,255,255,.72);margin-top:12px">{{note.body}}</div>` +
    `</div>` +
    SPONSOR_STRIP_STORY +
    hashtagFooterStory(66),
);

const sharedHtml = sharedColumnRoot(
  bgLayers(),
  sharedHeader(goldChip("MATCH DAY", "shared") + headerTag("{{roundLabel}}")) +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:none"><div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#FBAC27)">{{roundLabel}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*104px);line-height:.94;text-transform:uppercase;margin-top:14px">MATCH DAY</div></div>` +
    `<div style="flex:none;width:100%;display:flex;align-items:center;justify-content:space-between;gap:20px">` +
    `<div style="flex:1;text-align:center"><div style="width:calc(var(--k,1.4)*158px);height:calc(var(--k,1.4)*158px);border-radius:50%;overflow:hidden;margin:0 auto;box-shadow:0 0 0 4px color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent)">${slot("clubLogo", "logo", "circle")}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*38px);line-height:1;margin-top:20px;color:var(--gold,#FBAC27)">{{clubName}}</div><div style="font:500 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-top:8px">{{homeAway}}</div></div>` +
    `<div style="flex:none;font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:1;text-shadow:0 0 34px color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent)">VS</div>` +
    `<div style="flex:1;text-align:center"><div style="width:calc(var(--k,1.4)*158px);height:calc(var(--k,1.4)*158px);border-radius:50%;overflow:hidden;margin:0 auto;background:var(--surface-2,#1f2530);box-shadow:0 0 0 2px rgba(255,255,255,.16)">${slot("opposition.logo", "logo", "circle")}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*38px);line-height:1;margin-top:20px">{{opposition.name}}</div><div style="font:500 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-top:8px">{{oppositionHomeAway}}</div></div>` +
    `</div>` +
    `<div style="flex:none;width:100%;background:linear-gradient(90deg,var(--panel,#42342B),var(--panel-2,#241c17));border-left:9px solid var(--gold,#FBAC27);border-radius:9px;padding:26px 30px;display:flex;align-items:center;justify-content:space-around">` +
    `<div><div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">GROUND</div><div style="font-weight:800;font-size:28px;line-height:1.1;margin-top:10px">{{venue}}</div></div><div style="width:1px;height:56px;background:rgba(255,255,255,.2)"></div><div><div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">DATE</div><div style="font-weight:800;font-size:28px;line-height:1.1;margin-top:10px">{{date}}</div></div><div style="width:1px;height:56px;background:rgba(255,255,255,.2)"></div><div><div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">START</div><div style="font-weight:800;font-size:28px;line-height:1.1;margin-top:10px">{{startTime}}</div></div>` +
    `</div>` +
    `<div style="flex:none"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*44px);line-height:1;color:var(--gold,#FBAC27)">{{note.title}}</div><div style="font-weight:500;font-size:23px;line-height:1.3;color:rgba(255,255,255,.72);margin-top:10px">{{note.body}}</div></div>` +
    `</div>` +
    sponsorStripShared() +
    hashtagFooterShared(),
);

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
    textField("note.title", "Note title", "BAR & KITCHEN OPEN"),
    textField("note.body", "Note body", "Get down early and get behind the boys."),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    textField("hashtags", "Hashtag footer", "#HALLSHEAD · #PEELPREMIERLEAGUE"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
