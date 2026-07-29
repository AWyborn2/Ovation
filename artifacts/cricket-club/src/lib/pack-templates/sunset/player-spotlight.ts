import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  STORY_BG,
  clubHeaderFields,
  glassPanel,
  photoField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// E3 — Player Spotlight. The Pack E bundle ships no spotlight design (its
// slot in the grid was the since-removed POTM card), so this card is authored
// fully in Sunset's language: the pack's photo-first full-bleed story with
// the script flourish + glass stat chips, and Broadcast Dark's shared
// structure (content column left, photo right) for portrait/square. Neon
// Night's player-spotlight is the structural reference for both.
//
// Field keys are IDENTICAL to Broadcast Dark's player-spotlight: `bindInput`
// maps a ShareCardInput onto keys per card KIND, not per pack.
//
// Sponsors: like Pack A's A3 (and Packs B/C/D) this card is ["on"]-only, with
// Pack A's footer contract: {{clubHashtag}} always visible, presented-by line
// only when sponsors are on.
//
// {{season}} appears in the shared header tag (as in Packs B/C/D); the story
// header carries the card tag, per the pack's story-header convention.

/** Sunset wash beneath a full-bleed player photo under the pack's cinematic
 * scrims; the photo drops to the pack's own sky when nothing is bound. */
const STORY_LAYERS =
  STORY_BG +
  `<div data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`;

/** Sunset-styled photo panel for the authored shared layout: gold hairline
 * ring + bottom scrim; drops entirely when no photo is bound. */
const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:20px;overflow:hidden;box-shadow:0 0 0 2px color-mix(in srgb, var(--gold,#FBAC27) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(10,6,3,.9)"></div></div>`;

/** {{clubHashtag}} always visible; sponsor line only when sponsors are on. */
const FOOTER_ROW =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:22px;line-height:1;letter-spacing:.1em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55);text-shadow:0 2px 10px rgba(0,0,0,.8)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

/** Chip label under the value. */
function chipLabel(labelKey: string): string {
  return `<div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.6);margin-top:8px">{{${labelKey}}}</div>`;
}

/** Stat chip: the hero chip is accent-tinted frosted glass with a gold value;
 * the others are the pack's plain glass panel with white values. */
function statChip(valueKey: string, labelKey: string, hero: boolean, valueSize: string): string {
  const value = `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${valueSize};line-height:.9;color:${hero ? "var(--gold,#F5B21A)" : "#fff"}">{{${valueKey}}}</div>`;
  if (hero) {
    return (
      `<div style="flex:1;background:color-mix(in srgb, var(--gold,#FBAC27) 16%, rgba(10,12,16,.5));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent);border-radius:20px;backdrop-filter:blur(9px);padding:20px 14px;text-align:center">` +
      value +
      chipLabel(labelKey) +
      `</div>`
    );
  }
  return glassPanel(value + chipLabel(labelKey), ";flex:1;padding:20px 14px;text-align:center");
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — full-bleed photo, script flourish, name, glass stat
// chips + headline at the foot (spacer absorbs the sky, so the layout stays
// balanced when the photo drops)
// ---------------------------------------------------------------------------

const storyHtml = columnRoot(
  STORY_LAYERS,
  storyHeader("PLAYER SPOTLIGHT") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Player Spotlight", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:118px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:6px">{{playerName}}</div>` +
    `<div style="display:flex;gap:14px;margin-top:16px">` +
    statChip("stat1Value", "stat1Label", true, "56px") +
    statChip("stat2Value", "stat2Label", false, "56px") +
    statChip("stat3Value", "stat3Label", false, "56px") +
    `</div>` +
    `<div style="font-weight:500;font-size:23px;line-height:1.45;color:rgba(255,255,255,.8);margin-top:16px;max-width:820px;text-shadow:0 2px 12px rgba(0,0,0,.8)">{{headline}}</div>` +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    FOOTER_ROW,
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: content column left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("SPOTLIGHT", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    // justify-content keeps the column balanced whether or not the photo
    // panel is present.
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*18px)">` +
    `<div>` +
    `<div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*40px);line-height:1;color:var(--gold,#F5B21A);text-shadow:0 3px 18px rgba(0,0,0,.75)">Player Spotlight</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:.92;text-transform:uppercase;color:#fff;margin-top:12px">{{playerName}}</div>` +
    `</div>` +
    `<div style="display:flex;gap:14px">` +
    statChip("stat1Value", "stat1Label", true, "calc(var(--k,1.4)*44px)") +
    statChip("stat2Value", "stat2Label", false, "calc(var(--k,1.4)*44px)") +
    statChip("stat3Value", "stat3Label", false, "calc(var(--k,1.4)*44px)") +
    `</div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.45;color:rgba(255,255,255,.8);max-width:560px">{{headline}}</div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    FOOTER_ROW,
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
