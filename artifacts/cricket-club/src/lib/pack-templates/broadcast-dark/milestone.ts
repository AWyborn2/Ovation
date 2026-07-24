import type { PackCardTemplate } from "../types";
import {
  bgBase,
  bgLayers,
  clubHeaderFields,
  formatRoot,
  goldChip,
  headerTag,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A5 — Milestone. Giant number, player, tribute line. No sponsors-off branch
// in the bundle — honoured as designed. The header tag composes the milestone
// from its parts ("100 GAMES").

const storyHtml = formatRoot(
  bgLayers() +
    `<div style="position:absolute;top:200px;right:-40px;width:520px;bottom:340px">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:200px;right:-40px;width:520px;bottom:340px;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216), rgba(16,18,22,.15) 34%, transparent 60%)"></div>` +
    storyHeader(goldChip("MILESTONE", "story") + headerTag("{{currentValue}} {{milestoneLabel}}")) +
    `<div style="position:absolute;top:250px;left:70px">` +
    `<div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:#37CFE6">{{tierLabel}}</div>` +
    `<div style="font-family: var(--disp,'Anton',sans-serif); font-size: 330px; line-height: .98; color: var(--gold,#F5B21A); margin-top: 8px; text-shadow: 0 12px 34px color-mix(in srgb, var(--gold,#FBAC27) 28%, transparent)">{{currentValue}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:96px;line-height:.9;margin-top:-4px">{{milestoneLabel}}</div>` +
    `</div>` +
    `<div style="position:absolute;top:1200px;left:70px;right:70px">` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:128px;line-height:.92;text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:500;font-size:28px;line-height:1.4;color:rgba(255,255,255,.78);margin-top:16px;max-width:820px">{{headline}}</div>` +
    `</div>` +
    `<div style="position:absolute;bottom:52px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A)">{{clubHashtag}}</div>` +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6)">proudly supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>`,
);

const sharedHtml = sharedColumnRoot(
  bgBase() +
    `<div style="position:absolute;top:0;right:-40px;width:48%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:-40px;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216), rgba(16,18,22,.15) 40%, transparent 66%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:38%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#101216), transparent)"></div>`,
  sharedHeader(goldChip("MILESTONE", "shared") + headerTag("{{currentValue}} {{milestoneLabel}}")) +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:none"><div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:#37CFE6">{{tierLabel}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*216px);line-height:.9;color:var(--gold,#FBAC27);margin-top:6px;text-shadow:0 12px 34px color-mix(in srgb, var(--gold,#FBAC27) 28%, transparent)">{{currentValue}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*72px);line-height:.9;margin-top:calc(var(--k,1.4)*-4px)">{{milestoneLabel}}</div></div>` +
    `<div style="flex:none;max-width:620px"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:.92;text-transform:uppercase">{{playerName}}</div><div style="font-weight:500;font-size:26px;line-height:1.4;color:rgba(255,255,255,.78);margin-top:14px">{{headline}}</div></div>` +
    `</div>` +
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between"><div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6)">proudly supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>`,
);

export const milestone: PackCardTemplate = {
  kind: "milestone",
  designKey: "milestone",
  name: "Milestone",
  sponsorVariants: ["on"],
  fields: [
    ...clubHeaderFields(),
    textField("tierLabel", "Tier label", "CLUB MILESTONE"),
    textField("currentValue", "Milestone value", "100"),
    textField("milestoneLabel", "Milestone label", "GAMES"),
    textField("playerName", "Player name", "TIM MILES"),
    textField(
      "headline",
      "Tribute line",
      "100 Premier League games in the black & gold. A true Halls Head great — thanks for every one, Milesy.",
    ),
    photoField("photo", "Player photo", "Player photo"),
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "eSA Sport"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
