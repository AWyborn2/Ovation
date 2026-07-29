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

// E5 — Milestone. Games / caps — giant number, player, tribute line on a
// full-bleed photo, per Sunset's photo-first story identity.
//
// Field keys are IDENTICAL to Broadcast Dark's milestone: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The bundle's header
// tag literal "Club Milestone" is exactly Pack A's {{tierLabel}} sample, so it
// binds {{tierLabel}}; the giant "100 GAMES" splits into {{currentValue}} /
// {{milestoneLabel}} as Pack A does.
//
// Sponsors: like Pack A's A5 (and Packs B/C/D) this card is ["on"]-only. The
// bundle's three-logo strip needed `sponsor1..3` keys the reference design for
// "milestone" does not declare, and its sponsors-off hashtag line needed
// per-club literals — both replaced with the packs' shared footer contract for
// this kind: {{clubHashtag}} always visible, proudly-supported-by line only
// when sponsors are on.
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in to px (62→87, 150→210, 56→78, 12→17, 14→20). The shared layout is
// authored from Broadcast Dark's shared structure (number block top-left,
// player + tribute bottom-left, photo right) in Sunset's language.

/**
 * Story layers: sunset wash beneath a full-bleed photo under the bundle's
 * cinematic scrim + accent horizon glow. The photo carries
 * `data-drop-if-empty` so a milestone posted without a photo falls back to the
 * pack's own sky — the scrims read correctly over either.
 */
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
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55);text-shadow:0 2px 10px rgba(0,0,0,.8)">proudly supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

/** The glass tribute card: player name over the tribute line. */
function tributePanel(extraStyle: string): string {
  return glassPanel(
    `<div style="font-weight:800;font-size:38px;line-height:1.1;color:#fff">{{playerName}}</div>` +
      `<div style="font-weight:500;font-size:20px;line-height:1.4;color:rgba(255,255,255,.72);margin-top:8px">{{headline}}</div>`,
    extraStyle,
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — full-bleed photo, script flourish, giant number, glass
// tribute card hugging the foot (a spacer absorbs the sky, so the layout
// stays balanced when the photo drops)
// ---------------------------------------------------------------------------

const storyHtml = columnRoot(
  STORY_LAYERS,
  storyHeader("{{tierLabel}}") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Milestone", 87) +
    `<div style="display:flex;align-items:flex-end;gap:20px;margin-top:4px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:210px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82)">{{currentValue}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:78px;line-height:.9;text-transform:uppercase;color:var(--gold,#F5B21A);text-shadow:0 4px 22px rgba(0,0,0,.7);padding-bottom:17px">{{milestoneLabel}}</div>` +
    `</div>` +
    `<div style="margin-top:16px">${tributePanel(";padding:26px 28px")}</div>` +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    FOOTER_ROW,
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: number block top-left, glass tribute
// bottom-left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("MILESTONE", "{{currentValue}} {{milestoneLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    // justify-content keeps the column balanced whether or not the photo
    // panel is present.
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between">` +
    `<div style="flex:none">` +
    `<div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*44px);line-height:1;color:var(--gold,#F5B21A);text-shadow:0 3px 18px rgba(0,0,0,.75)">Milestone</div>` +
    `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.6);margin-top:12px">{{tierLabel}}</div>` +
    `<div style="display:flex;align-items:flex-end;gap:18px;margin-top:calc(var(--k,1.4)*8px)">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*150px);line-height:.9;color:#fff">{{currentValue}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:.9;text-transform:uppercase;color:var(--gold,#FBAC27);padding-bottom:calc(var(--k,1.4)*12px)">{{milestoneLabel}}</div>` +
    `</div>` +
    `</div>` +
    tributePanel(";flex:none;padding:24px 26px;max-width:620px") +
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
