import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  clubHeaderFields,
  foilText,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// B5 — Milestone. Giant foil number, player photo, tribute line.
//
// Field keys are IDENTICAL to Broadcast Dark's milestone: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The bundle's ruled tag
// literal "CLUB MILESTONE" binds {{tierLabel}} (that is exactly Pack A's
// sample), and the giant "100 GAMES" splits into {{currentValue}} /
// {{milestoneLabel}} as Pack A does.
//
// Sponsors: like Pack A's A5 this card is ["on"] only. The bundle's
// sponsors-off hashtag line needed a `hashtags` key the reference design does
// not declare, and its three-logo strip needed `sponsor1..3` — both replaced
// with Pack A's footer structure ({{clubHashtag}} always visible, presented-by
// only when sponsors are on).
//
// The bundle is story-only; the shared layout is authored from the story's
// visual language plus Pack A's shared structure (number block top-left,
// player + tribute bottom-left, photo right).

/** Bundle story header carries the club logo above the wordmark. */
const storyLogo = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

/** {{clubHashtag}} always visible; sponsor line only when sponsors are on. */
const footerRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:22px;line-height:1;letter-spacing:.1em;color:var(--gold,#F5B21A)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">proudly supported by <span style="color:var(--gold,#F5B21A);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — foil number, gold-ring photo, foil name + tribute
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyLogo +
    storyHeader("{{tierLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;margin:30px 0 34px">` +
    `<div style="flex:none">` +
    foilText("{{currentValue}}", 290, ";line-height:.82") +
    foilText("{{milestoneLabel}}", 98, ";margin-top:-6px") +
    `</div>` +
    // Photo drops when empty so the number and tribute close ranks instead of
    // framing a blank box.
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:520px;margin:22px 0;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>` +
    `<div style="flex:none">` +
    foilText("{{playerName}}", 98) +
    `<div style="font-weight:500;font-size:24px;line-height:1.4;color:rgba(255,255,255,.8);max-width:620px;margin:14px auto 0">{{headline}}</div>` +
    `</div>` +
    `</div>` +
    footerRow,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: number + player left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("MILESTONE", "{{currentValue}} {{milestoneLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between">` +
    `<div style="flex:none"><div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:var(--gold,#F5B21A)">{{tierLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*190px);line-height:.9;color:var(--gold,#F5B21A);margin-top:6px;text-shadow:0 12px 34px color-mix(in srgb, var(--gold,#FBAC27) 28%, transparent)">{{currentValue}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*64px);line-height:.9;margin-top:calc(var(--k,1.4)*-4px);text-transform:uppercase">{{milestoneLabel}}</div></div>` +
    `<div style="flex:none"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*72px);line-height:.92;text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.4;color:rgba(255,255,255,.78);margin-top:12px">{{headline}}</div></div>` +
    `</div>` +
    `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 24px 60px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>` +
    `</div>` +
    footerRow,
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
