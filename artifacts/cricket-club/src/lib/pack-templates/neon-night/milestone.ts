import type { PackCardTemplate } from "../types";
import {
  clubHeaderFields,
  neonText,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// D5 — Milestone. Giant neon number, cyan-ring photo, tribute line.
//
// Field keys are IDENTICAL to Broadcast Dark's milestone: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The bundle's header
// tag literal "CLUB MILESTONE" is exactly Pack A's {{tierLabel}} sample, so it
// binds {{tierLabel}}; the giant "100 GAMES" splits into {{currentValue}} /
// {{milestoneLabel}} as Pack A does.
//
// Sponsors: like Pack A's A5 this card is ["on"]-only. The bundle's three-logo
// strip needed `sponsor1..3` keys the reference design for "milestone" does
// not declare, and its sponsors-off hashtag line needed `hashtags` — both
// replaced with Pack A's footer contract ({{clubHashtag}} always visible,
// proudly-supported-by line only when sponsors are on).
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in on the pack's storyColumnRoot/storyHeader. The shared layout is
// authored from Pack A's shared structure (number block top-left, player +
// tribute bottom-left, photo right) in Neon Night's language.

const STORY_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:520px;margin:20px 0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:22px;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(4,7,13,.9)"></div></div></div>`;

const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:22px;overflow:hidden;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(4,7,13,.9)"></div></div>`;

/** {{clubHashtag}} always visible; sponsor line only when sponsors are on. */
const FOOTER_ROW =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:22px;line-height:1;letter-spacing:.1em;color:var(--gold,#F5B21A)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">proudly supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — neon number, cyan-ring photo, neon name + tribute
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("{{tierLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;margin:17px 0 22px">` +
    `<div style="flex:none">` +
    neonText("{{currentValue}}", 280, "gold", ";line-height:.82") +
    neonText("{{milestoneLabel}}", 92, "cyan", ";line-height:.9;margin-top:-3px") +
    `</div>` +
    // Photo drops when empty so the number and tribute close ranks instead of
    // framing a blank glowing box.
    STORY_PHOTO +
    `<div style="flex:none">` +
    neonText("{{playerName}}", 90, "gold", ";line-height:.9") +
    `<div style="font-weight:500;font-size:22px;line-height:1.4;color:rgba(255,255,255,.78);margin-top:12px;max-width:620px">{{headline}}</div>` +
    `</div>` +
    `</div>` +
    FOOTER_ROW,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: number + player left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("MILESTONE", "{{currentValue}} {{milestoneLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between">` +
    `<div style="flex:none"><div style="font:700 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7)">{{tierLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*170px);line-height:.86;color:var(--gold,#FBAC27);margin-top:8px">{{currentValue}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*60px);line-height:.9;margin-top:calc(var(--k,1.4)*-2px);text-transform:uppercase">{{milestoneLabel}}</div></div>` +
    `<div style="flex:none"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);line-height:.92;color:var(--gold,#FBAC27);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.4;color:rgba(255,255,255,.78);margin-top:12px;max-width:560px">{{headline}}</div></div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    FOOTER_ROW,
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
      "100 Premier League games for the club. A true club great — thanks for every one, Milesy.",
    ),
    photoField("photo", "Player photo", "Player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
