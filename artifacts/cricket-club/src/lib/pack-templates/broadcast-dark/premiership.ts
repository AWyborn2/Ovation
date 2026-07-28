import type { PackCardTemplate } from "../types";
import {
  bgLayers,
  clubHeaderFields,
  formatRoot,
  goldChip,
  headerTag,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A14 — Premiership. Flag won — season, competition, result & POTM.

const storyHtml = formatRoot(
  bgLayers() +
    storyHeader(goldChip("PREMIERS", "story") + headerTag("CHAMPIONS")) +
    `<div style="position:absolute;top:232px;left:70px;right:70px;text-align:center"><div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:#37CFE6"><span>{{grade}}</span> · <span>{{season}}</span></div><div style="font-family:var(--disp,'Anton',sans-serif);font-size:150px;line-height:.94;text-transform:uppercase;margin-top:14px">PREMIERS</div><div style="font-weight:700;font-size:38px;line-height:1.2;color:var(--gold,#F5B21A);margin-top:10px">{{competition}}</div></div>` +
    `<div style="position:absolute;top:660px;left:110px;right:110px;height:640px;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent)">${slot("teamPhoto", "photo")}<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -90px 90px -40px rgba(8,9,12,.82)"></div></div>` +
    `<div style="position:absolute;top:1360px;left:70px;right:70px;text-align:center;font-weight:800;font-size:46px;line-height:1.15">{{result}}</div>` +
    `<div style="position:absolute;top:1476px;left:70px;right:70px;text-align:center;font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.65)">PLAYER OF THE MATCH · <span style="color:var(--gold,#F5B21A)">{{mom}}</span></div>` +
    sponsorsOff(
      `<div style="position:absolute;bottom:60px;left:70px;right:70px;text-align:center;font-weight:700;font-size:26px;line-height:1;letter-spacing:.13em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{hashtags}}</div>`,
    ) +
    sponsorsOn(
      `<div style="position:absolute;bottom:56px;left:70px;right:70px;text-align:center;font-weight:500;font-size:20px;color:rgba(255,255,255,.6)">season proudly supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ),
);

const sharedHtml = sharedColumnRoot(
  bgLayers(),
  sharedHeader(goldChip("PREMIERS", "shared") + headerTag("CHAMPIONS")) +
    `<div style="flex:none;text-align:center;margin-top:calc(var(--k,1.4)*10px)"><div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:#37CFE6"><span>{{grade}}</span> · <span>{{season}}</span></div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*106px);line-height:.94;text-transform:uppercase;margin-top:12px">PREMIERS</div><div style="font-weight:700;font-size:34px;line-height:1.2;color:var(--gold,#FBAC27);margin-top:8px">{{competition}}</div></div>` +
    `<div style="flex:1;min-height:0;margin:calc(var(--k,1.4)*20px) 40px;border-radius:16px;overflow:hidden;position:relative;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent)">${slot("teamPhoto", "photo")}<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -90px 90px -40px rgba(8,9,12,.82)"></div></div>` +
    `<div style="flex:none;text-align:center"><div style="font-weight:800;font-size:42px;line-height:1.15">{{result}}</div><div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.65);margin-top:14px">PLAYER OF THE MATCH · <span style="color:var(--gold,#FBAC27)">{{mom}}</span></div></div>` +
    `<div style="flex:none;text-align:center;margin-top:calc(var(--k,1.4)*16px)">` +
    sponsorsOff(
      `<div style="font-weight:700;font-size:24px;line-height:1;letter-spacing:.13em;color:var(--gold,#FBAC27)">{{hashtags}}</div>`,
    ) +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6)">season proudly supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>`,
);

export const premiership: PackCardTemplate = {
  kind: "premiership",
  designKey: "premiership",
  name: "Premiership",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("grade", "Grade", "A GRADE"),
    textField("season", "Season", "2024/25"),
    textField("competition", "Competition", "retraVision Premier T20"),
    textField("result", "Result", "Defeated Rockingham Hornets by 8 wickets"),
    textField("mom", "Player of the match", "ALEX OSBORNE"),
    photoField("teamPhoto", "Team photo", "Premiership team photo"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #PREMIERS"),
    textField("sponsorPresentedBy", "Season sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
