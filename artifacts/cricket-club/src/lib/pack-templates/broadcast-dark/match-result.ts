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
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorStripShared,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A1 — Match Result. The only card with three distinct layouts in the bundle
// (isStoryFmt / isTallFmt / isSquareFmt).

const storyHtml = formatRoot(
  bgLayers() +
    storyHeader(goldChip("RESULT", "story") + headerTag("{{matchTitle}}")) +
    `<div style="position:absolute;top:248px;left:70px;right:70px">` +
    `<div style="display:flex;align-items:center;gap:13px;font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#F5B21A)"><span style="width:14px;height:14px;border-radius:50%;background:var(--gold,#F5B21A);box-shadow:0 0 18px var(--gold,#F5B21A)"></span>FULL TIME</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:188px;line-height:.94;letter-spacing:.005em;margin-top:22px;text-transform:uppercase">MATCH<br><span style="color:var(--gold,#F5B21A)">RESULT</span></div>` +
    `</div>` +
    `<div style="position:absolute;top:672px;left:70px;right:70px;background:linear-gradient(90deg,var(--panel,var(--panel,#6E1C2B)),var(--panel-2,var(--panel-2,#4a121e)));border-left:9px solid var(--gold,#F5B21A);border-radius:9px;padding:26px 30px;display:flex;align-items:center;gap:20px;box-shadow:0 22px 44px -22px color-mix(in srgb, var(--panel,#42342B) 90%, transparent)">` +
    `<span style="font-size:38px;line-height:1;color:var(--gold,#F5B21A)">★</span>` +
    `<span style="font-weight:800;font-size:42px;line-height:1;letter-spacing:.01em">{{result}}</span>` +
    `</div>` +
    `<div style="position:absolute;top:806px;left:70px;right:70px;display:flex;align-items:center;gap:24px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:26px 28px">` +
    `<div style="width:112px;height:112px;border-radius:13px;overflow:hidden;flex:none;background:var(--surface-2,#1f2530)">${slot("opposition.logo", "logo", "rounded", 13)}</div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:37px;line-height:1.05">{{opposition.name}}</div><div style="font-weight:500;font-size:21px;line-height:1.5;color:rgba(255,255,255,.62);margin-top:6px">{{opposition.performers}}</div></div>` +
    `<div style="text-align:right;flex:none"><div style="font-family:var(--disp,'Anton',sans-serif);font-size:86px;line-height:.9">{{opposition.score}}</div><div style="font:500 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.5);margin-top:5px">{{opposition.oversLabel}}</div></div>` +
    `</div>` +
    `<div style="position:absolute;top:990px;left:70px;right:70px;display:flex;align-items:center;gap:20px">` +
    `<div style="flex:1;height:1px;background:rgba(255,255,255,.15)"></div>` +
    `<span style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#F5B21A)">{{resultVerb}}</span>` +
    `<div style="flex:1;height:1px;background:rgba(255,255,255,.15)"></div>` +
    `</div>` +
    `<div style="position:absolute;top:1048px;left:70px;right:70px;display:flex;align-items:center;gap:24px;background:linear-gradient(90deg,color-mix(in srgb, var(--gold,#FBAC27) 17%, transparent),color-mix(in srgb, var(--gold,#FBAC27) 4%, transparent));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 42%, transparent);border-radius:16px;padding:26px 28px">` +
    `<div style="width:112px;height:112px;border-radius:13px;overflow:hidden;flex:none;background:var(--surface-2,#2a2410)">${slot("club.logo", "logo", "rounded", 13)}</div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:37px;line-height:1.05">{{club.name}}</div><div style="font-weight:500;font-size:21px;line-height:1.5;color:rgba(255,255,255,.72);margin-top:6px">{{club.performers}}</div></div>` +
    `<div style="text-align:right;flex:none"><div style="font-family:var(--disp,'Anton',sans-serif);font-size:86px;line-height:.9;color:var(--gold,#F5B21A)">{{club.score}}</div><div style="font:500 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:color-mix(in srgb, var(--gold,#FBAC27) 75%, transparent);margin-top:5px">{{club.oversLabel}}</div></div>` +
    `</div>` +
    `<div style="position:absolute;top:1308px;left:70px;right:70px;display:flex;align-items:center;gap:28px;background:linear-gradient(90deg,rgba(55,207,230,.14),rgba(255,255,255,.03));border:1px solid rgba(55,207,230,.34);border-radius:18px;padding:26px">` +
    `<div style="width:212px;height:212px;border-radius:14px;overflow:hidden;flex:none;box-shadow:0 0 0 2px rgba(55,207,230,.4)">${slot("potm.photo", "photo", "rounded", 14)}</div>` +
    `<div style="flex:1;min-width:0">` +
    `<div style="font:700 21px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#37CFE6">PLAYER OF THE MATCH</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:80px;line-height:.92;color:var(--gold,#F5B21A);margin-top:12px">{{potm.name}}</div>` +
    `<div style="font-weight:700;font-size:34px;line-height:1;margin-top:11px">{{potm.figures}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:25px">{{potm.detail}}</span></div>` +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5);margin-top:12px">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>` +
    `</div>` +
    SPONSOR_STRIP_STORY +
    hashtagFooterStory(66),
);

// Shared pieces for the two non-story layouts (header + footers are common).
const nonStoryHeader = sharedHeader(
  goldChip("RESULT", "shared") + headerTag("{{matchTitle}}"),
);

const nonStoryFooters =
  sponsorStripShared() +
  hashtagFooterShared();

const tallMiddle =
  `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;gap:20px;padding:calc(var(--k,1.4)*16px) 0">` +
  `<div style="flex:none">` +
  `<div style="display:flex;align-items:center;gap:13px;font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#FBAC27)"><span style="width:14px;height:14px;border-radius:50%;background:var(--gold,#FBAC27);animation:hhPulse 2.6s ease-in-out infinite"></span>FULL TIME</div>` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*116px);line-height:.92;letter-spacing:.005em;margin-top:calc(var(--k,1.4)*14px);text-transform:uppercase">MATCH<br><span style="color:var(--gold,#FBAC27)">RESULT</span></div>` +
  `</div>` +
  `<div style="flex:none;display:flex;flex-direction:column;gap:18px">` +
  `<div style="background:linear-gradient(90deg,var(--panel,#42342B),var(--panel-2,#241c17));border-left:9px solid var(--gold,#FBAC27);border-radius:9px;padding:24px 30px;display:flex;align-items:center;gap:20px;box-shadow:0 22px 44px -22px color-mix(in srgb, var(--panel,#42342B) 90%, transparent)"><span style="font-size:38px;line-height:1;color:var(--gold,#FBAC27)">★</span><span style="font-weight:800;font-size:40px;line-height:1;letter-spacing:.01em">{{result}}</span></div>` +
  `<div style="display:flex;align-items:center;gap:24px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:24px 28px"><div style="width:104px;height:104px;border-radius:13px;overflow:hidden;flex:none;background:var(--surface-2,#1f2530)">${slot("opposition.logo", "logo", "rounded", 13)}</div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:36px;line-height:1.05">{{opposition.name}}</div><div style="font-weight:500;font-size:20px;line-height:1.5;color:rgba(255,255,255,.62);margin-top:6px">{{opposition.performers}}</div></div><div style="text-align:right;flex:none"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:80px;line-height:.9">{{opposition.score}}</div><div style="font:500 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.5);margin-top:5px">{{opposition.oversLabel}}</div></div></div>` +
  `<div style="display:flex;align-items:center;gap:20px"><div style="flex:1;height:1px;background:rgba(255,255,255,.15)"></div><span style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{resultVerb}}</span><div style="flex:1;height:1px;background:rgba(255,255,255,.15)"></div></div>` +
  `<div style="display:flex;align-items:center;gap:24px;background:linear-gradient(90deg,color-mix(in srgb, var(--gold,#FBAC27) 17%, transparent),color-mix(in srgb, var(--gold,#FBAC27) 4%, transparent));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 42%, transparent);border-radius:16px;padding:24px 28px"><div style="width:104px;height:104px;border-radius:13px;overflow:hidden;flex:none;background:var(--surface-2,#2a2410)">${slot("club.logo", "logo", "rounded", 13)}</div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:36px;line-height:1.05">{{club.name}}</div><div style="font-weight:500;font-size:20px;line-height:1.5;color:rgba(255,255,255,.72);margin-top:6px">{{club.performers}}</div></div><div style="text-align:right;flex:none"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:80px;line-height:.9;color:var(--gold,#FBAC27)">{{club.score}}</div><div style="font:500 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:color-mix(in srgb, var(--gold,#FBAC27) 75%, transparent);margin-top:5px">{{club.oversLabel}}</div></div></div>` +
  `</div>` +
  `<div style="flex:none;display:flex;align-items:center;gap:26px;background:linear-gradient(90deg,rgba(55,207,230,.14),rgba(255,255,255,.03));border:1px solid rgba(55,207,230,.34);border-radius:18px;padding:24px 26px"><div style="width:calc(var(--k,1.4)*128px);height:calc(var(--k,1.4)*128px);border-radius:14px;overflow:hidden;flex:none;box-shadow:0 0 0 2px rgba(55,207,230,.4)">${slot("potm.photo", "photo", "rounded", 14)}</div><div style="flex:1;min-width:0"><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#37CFE6">PLAYER OF THE MATCH</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:.92;color:var(--gold,#FBAC27);margin-top:12px">{{potm.name}}</div><div style="font-weight:700;font-size:32px;line-height:1;margin-top:10px">{{potm.figures}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:24px">{{potm.detail}}</span></div></div></div>` +
  `</div>`;

const squareMiddle =
  `<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;padding:16px 0">` +
  `<div style="flex:none;display:flex;align-items:center;gap:16px;background:linear-gradient(90deg,var(--panel,#42342B),var(--panel-2,#241c17));border-left:8px solid var(--gold,#FBAC27);border-radius:9px;padding:20px 26px;box-shadow:0 20px 40px -22px color-mix(in srgb, var(--panel,#42342B) 90%, transparent)"><span style="font:600 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27);display:flex;align-items:center;gap:11px"><span style="width:12px;height:12px;border-radius:50%;background:var(--gold,#FBAC27);animation:hhPulse 2.6s ease-in-out infinite"></span>FULL TIME</span><span style="width:1px;height:34px;background:rgba(255,255,255,.2)"></span><span style="font-weight:800;font-size:38px;line-height:1;letter-spacing:.01em">{{result}}</span></div>` +
  `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:16px">` +
  `<div style="flex:1;display:flex;flex-direction:column;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:26px 28px"><div style="display:flex;align-items:center;gap:15px"><div style="width:70px;height:70px;border-radius:11px;overflow:hidden;flex:none;background:var(--surface-2,#1f2530)">${slot("opposition.logo", "logo", "rounded", 11)}</div><div style="font-weight:700;font-size:27px;line-height:1.08">{{opposition.name}}</div></div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:104px;line-height:.86;margin-top:auto;padding-top:18px">{{opposition.score}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.5);margin-top:8px">{{opposition.oversLabel}}</div><div style="font-weight:500;font-size:19px;line-height:1.5;color:rgba(255,255,255,.62);margin-top:12px">{{opposition.performers}}</div></div>` +
  `<div style="flex:none;align-self:center;font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#FBAC27);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:14px 12px;writing-mode:vertical-rl;text-orientation:upright">{{resultVerbShort}}</div>` +
  `<div style="flex:1;display:flex;flex-direction:column;background:linear-gradient(160deg,color-mix(in srgb, var(--gold,#FBAC27) 17%, transparent),color-mix(in srgb, var(--gold,#FBAC27) 4%, transparent));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 42%, transparent);border-radius:16px;padding:26px 28px"><div style="display:flex;align-items:center;gap:15px"><div style="width:70px;height:70px;border-radius:11px;overflow:hidden;flex:none;background:var(--surface-2,#2a2410)">${slot("club.logo", "logo", "rounded", 11)}</div><div style="font-weight:700;font-size:27px;line-height:1.08">{{club.name}}</div></div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:104px;line-height:.86;margin-top:auto;padding-top:18px;color:var(--gold,#FBAC27)">{{club.score}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:color-mix(in srgb, var(--gold,#FBAC27) 75%, transparent);margin-top:8px">{{club.oversLabel}}</div><div style="font-weight:500;font-size:19px;line-height:1.5;color:rgba(255,255,255,.72);margin-top:12px">{{club.performers}}</div></div>` +
  `</div>` +
  `<div style="flex:none;display:flex;align-items:center;gap:22px;background:linear-gradient(90deg,rgba(55,207,230,.14),rgba(255,255,255,.03));border:1px solid rgba(55,207,230,.34);border-radius:16px;padding:20px 24px"><div style="width:118px;height:118px;border-radius:12px;overflow:hidden;flex:none;box-shadow:0 0 0 2px rgba(55,207,230,.4)">${slot("potm.photo", "photo", "rounded", 12)}</div><div style="flex:1;min-width:0"><div style="font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#37CFE6">PLAYER OF THE MATCH</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:54px;line-height:.92;color:var(--gold,#FBAC27);margin-top:9px">{{potm.name}}</div><div style="font-weight:700;font-size:26px;line-height:1;margin-top:7px">{{potm.figures}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:20px">{{potm.detail}}</span></div></div></div>` +
  `</div>`;

const portraitHtml = sharedColumnRoot(
  bgLayers(),
  nonStoryHeader + tallMiddle + nonStoryFooters,
);

const squareHtml = sharedColumnRoot(
  bgLayers(),
  nonStoryHeader + squareMiddle + nonStoryFooters,
);

export const matchResult: PackCardTemplate = {
  kind: "matchSummary",
  designKey: "match-result",
  name: "Match Result",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("matchTitle", "Match title", "GAME 2 · ROUND 2"),
    textField("result", "Result banner", "YOUR CLUB WON BY 8 WICKETS"),
    textField("resultVerb", "Result verb (divider)", "DEFEATED BY"),
    textField("resultVerbShort", "Result verb (square, abbreviated)", "DEF"),
    textField("club.name", "Club side name", "Your Club"),
    textField("club.score", "Club score", "2/102"),
    textField("club.oversLabel", "Club overs label", "15 OVERS"),
    textField("club.performers", "Club top performers", "J. Manuel 39* (38) · T. Miles 35* (35)"),
    logoField("club.logo", "Club side logo", "Logo"),
    textField("opposition.name", "Opposition name", "Rockingham Hornets"),
    textField("opposition.score", "Opposition score", "9/97"),
    textField("opposition.oversLabel", "Opposition overs label", "20 OVERS"),
    textField("opposition.performers", "Opposition top performers", "E. Smith 33 (28) · A. Beattie 2/9 (4)"),
    logoField("opposition.logo", "Opposition logo", "Logo"),
    textField("potm.name", "Player of the match", "ALEX OSBORNE"),
    textField("potm.figures", "POTM figures", "3/13"),
    textField("potm.detail", "POTM detail", "(4 overs)"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    photoField("potm.photo", "POTM photo", "Player photo"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  formats: {
    story: storyHtml,
    portrait: portraitHtml,
    square: squareHtml,
  },
};
