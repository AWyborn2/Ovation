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
  slot,
  sharedHeader,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A3 — Player Spotlight. Cutout, name, stat chips, one-line story.
// No sponsors-off branch in the bundle — honoured as designed.

const statChipsStory =
  `<div style="position:absolute;top:760px;left:70px;display:flex;gap:16px">` +
  `<div style="background:color-mix(in srgb, var(--gold,#FBAC27) 14%, transparent);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent);border-radius:14px;padding:20px 24px;text-align:center"><div style="font-family:var(--disp,'Anton',sans-serif);font-size:64px;line-height:.9;color:var(--gold,#F5B21A)">{{stat1Value}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.6);margin-top:8px">{{stat1Label}}</div></div>` +
  `<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:20px 24px;text-align:center"><div style="font-family:var(--disp,'Anton',sans-serif);font-size:64px;line-height:.9">{{stat2Value}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.6);margin-top:8px">{{stat2Label}}</div></div>` +
  `<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:20px 24px;text-align:center"><div style="font-family:var(--disp,'Anton',sans-serif);font-size:64px;line-height:.9">{{stat3Value}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.6);margin-top:8px">{{stat3Label}}</div></div>` +
  `</div>`;

const storyHtml = formatRoot(
  bgLayers() +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216) 0%, rgba(16,18,22,.35) 24%, transparent 52%)"></div>` +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0;pointer-events:none;background:linear-gradient(0deg, rgba(8,9,12,.92), transparent 32%)"></div>` +
    storyHeader(goldChip("SPOTLIGHT", "story") + headerTag("{{season}}")) +
    `<div style="position:absolute;top:308px;left:70px;width:600px">` +
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#37CFE6">PLAYER SPOTLIGHT</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:132px;line-height:.92;margin-top:18px;text-transform:uppercase">{{playerName}}</div>` +
    `</div>` +
    statChipsStory +
    `<div style="position:absolute;top:948px;left:70px;width:560px;font-weight:500;font-size:27px;line-height:1.45;color:rgba(255,255,255,.8)">{{headline}}</div>` +
    `<div style="position:absolute;bottom:52px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div>` +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6);text-shadow:0 2px 10px rgba(0,0,0,.8)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>`,
);

const sharedHtml = sharedColumnRoot(
  bgBase() +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216) 0%, rgba(16,18,22,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#101216), transparent)"></div>`,
  sharedHeader(goldChip("SPOTLIGHT", "shared") + headerTag("{{season}}")) +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*22px);max-width:600px">` +
    `<div><div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#37CFE6">PLAYER SPOTLIGHT</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*94px);line-height:.92;margin-top:16px;text-transform:uppercase">{{playerName}}</div></div>` +
    `<div style="display:flex;gap:16px"><div style="background:color-mix(in srgb, var(--gold,#FBAC27) 14%, transparent);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent);border-radius:14px;padding:18px 22px;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:56px;line-height:.9;color:var(--gold,#FBAC27)">{{stat1Value}}</div><div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.6);margin-top:8px">{{stat1Label}}</div></div><div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:18px 22px;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:56px;line-height:.9">{{stat2Value}}</div><div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.6);margin-top:8px">{{stat2Label}}</div></div><div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:18px 22px;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:56px;line-height:.9">{{stat3Value}}</div><div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.6);margin-top:8px">{{stat3Label}}</div></div></div>` +
    `<div style="font-weight:500;font-size:26px;line-height:1.45;color:rgba(255,255,255,.82);max-width:540px">{{headline}}</div>` +
    `</div>` +
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between"><div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div>` +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6);text-shadow:0 2px 10px rgba(0,0,0,.8)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>`,
);

export const playerSpotlight: PackCardTemplate = {
  kind: "player",
  designKey: "player-spotlight",
  name: "Player Spotlight",
  sponsorVariants: ["on"],
  fields: [
    ...clubHeaderFields(),
    textField("season", "Season", "2025/26"),
    textField("playerName", "Player name", "JACK MANUEL"),
    textField("stat1Value", "Stat 1 value", "428"),
    textField("stat1Label", "Stat 1 label", "RUNS"),
    textField("stat2Value", "Stat 2 value", "12"),
    textField("stat2Label", "Stat 2 label", "WICKETS"),
    textField("stat3Value", "Stat 3 value", "89"),
    textField("stat3Label", "Stat 3 label", "GAMES"),
    textField(
      "headline",
      "Headline",
      "A mainstay of the top order — 428 runs across the 2025/26 season so far.",
    ),
    photoField("photo", "Player photo", "Player photo / cutout"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
