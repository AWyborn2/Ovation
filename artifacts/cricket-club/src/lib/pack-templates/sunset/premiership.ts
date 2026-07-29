import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  HASHTAG_FOOTER_SHARED,
  PRESENTED_BY_STORY,
  STORY_BG,
  clubHeaderFields,
  glassPanel,
  photoField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// E14 — Premiership. Flag won — full-bleed team photo, script flourish,
// CHAMPIONS hero & the glass result / Player-of-the-Match panel. Unlike the
// forbidden potm.* blocks, {{mom}} is real admin-entered data on this kind
// ("Player of the final" on ShareCardInput; Pack A renders the same line), so
// the "PLAYER OF THE MATCH · {{mom}}" ribbon stays.
//
// Field keys are IDENTICAL to Broadcast Dark's premiership — `bindInput` maps
// a ShareCardInput onto keys per card KIND, not per pack. Contract points, all
// following Packs B/C/D's calls on the same card:
//  - the bundle's team-photo slot is data-field="photo", but the premiership
//    contract key is teamPhoto — bound (and dropped-if-empty) under that key;
//  - the premiership kind has NO sponsor1–3 keys, so the bundle's three-logo
//    strip becomes the presented-by line in both formats;
//  - the sponsors-off footer binds {{hashtags}} — the kind has no clubHashtag
//    key, so fragments' HASHTAG_FOOTER_STORY cannot be used; a local line with
//    the same styling stands in (the shared format's HASHTAG_FOOTER_SHARED
//    already binds {{hashtags}});
//  - the bundle card note promises the competition but its markup never shows
//    it — {{competition}} is added as the gold mono line under the CHAMPIONS
//    hero (grade + season take the header tag, as in the bundle's own header).
//    Packs B/C/D made the same call.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches).
// It is transcribed as the story with `--k` resolved at its 1.4 default into
// fixed px; the shared layout is authored from Pack A's shared structure
// (hero, framed team photo, result + POTM) in Sunset's language, with
// `justify-content:space-between` on the middle column so the layout stays
// balanced when the framed photo drops.

/** `scriptText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function scriptFlex(content: string, px: number, extraStyle = ""): string {
  return scriptText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

// Story layer stack: team photo over the sunset wash, under the bundle's
// cinematic scrim and accent horizon glow. `data-drop-if-empty` lets a flag
// announcement without a photo fall back to the pack's own sky.
const storyLayers =
  STORY_BG +
  `<div data-drop-if-empty="teamPhoto" style="position:absolute;inset:0">${slot("teamPhoto", "photo", "rect")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`;

/** Frosted result panel + the Player-of-the-Match ribbon (bundle styling). */
function resultPanel(extraStyle: string): string {
  return glassPanel(
    `<div style="font-weight:800;font-size:30px;line-height:1.15;color:#fff">{{result}}</div>` +
      `<div style="margin-top:10px"><div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">PLAYER OF THE MATCH · {{mom}}</div></div>`,
    `;padding:26px 28px${extraStyle}`,
  );
}

/** Gold mono competition line under the hero — see the module note. */
const COMPETITION_LINE = `<div style="font:700 20px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#F5B21A);margin-top:12px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{competition}}</div>`;

// Local sponsors-off footer binding {{hashtags}} — see the module note.
const hashtagFooterStory = `<div style="flex:none;text-align:center;font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.8)">{{hashtags}}</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — header up top, spacer sky, content hugging the foot
// ---------------------------------------------------------------------------

const storyHtml = columnRoot(
  storyLayers,
  storyHeader("Premiers · {{grade}} {{season}}") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Premiers", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:134px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:2px">CHAMPIONS</div>` +
    COMPETITION_LINE +
    resultPanel(";margin-top:16px") +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(hashtagFooterStory),
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait / square) — hero, gold-ringed team photo, glass result
// ---------------------------------------------------------------------------

/**
 * Gold-ringed team photo. `data-drop-if-empty` collapses the frame inside the
 * flex column when no photo is bound; the middle column's space-between keeps
 * the hero and result blocks balanced either way.
 */
const teamPhotoFrame =
  `<div data-drop-if-empty="teamPhoto" style="flex:1;min-height:0;width:100%;max-width:600px;margin:calc(var(--k,1.4)*14px) 0;position:relative;border-radius:20px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 60%, transparent),0 8px 30px rgba(0,0,0,.6)">` +
  slot("teamPhoto", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(10,6,3,.9)"></div></div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("PREMIERS", "{{grade}} · {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding:calc(var(--k,1.4)*12px) 0">` +
    `<div>` +
    scriptFlex("Premiers", 46) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*96px);line-height:.9;text-transform:uppercase;color:#fff;margin-top:2px">CHAMPIONS</div>` +
    COMPETITION_LINE +
    `</div>` +
    teamPhotoFrame +
    resultPanel(";width:100%") +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
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
