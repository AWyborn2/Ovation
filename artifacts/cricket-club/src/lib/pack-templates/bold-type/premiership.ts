import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// C14 — Premiership. Flag won — season, competition, result & POTM.
//
// Field keys are deliberately IDENTICAL to Broadcast Dark's premiership:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack. {{mom}} is KEPT (Pack A's premiership binds it — unlike the
// removed potm.* fields elsewhere, the grand-final POTM is real curated input).
//
// The bundle ships ONE `--k`-scaled composition; transcribed as the story with
// `--k` resolved at its 1.4 default into fixed px, shared keeps the calcs.
//
// Bundle departures, all contract-driven:
//  - the bundle's team-photo slot is data-field="photo", but the premiership
//    contract key is teamPhoto — bound (and dropped-if-empty) under that key;
//  - the three-logo sponsor strip is dropped: sponsor1–3 are not in Pack A's
//    premiership contract. Sponsors-on rides fragments' PRESENTED_BY_STORY;
//    sponsors-off is a local gold bar binding {{hashtags}} (this contract has
//    no clubHashtag, so HASHTAG_FOOTER_STORY's key is unavailable);
//  - the bundle card note promises the competition but its markup never shows
//    it — {{competition}} is added as the mono line under the PREMIERS hero
//    (grade + season take the header tag, as in the bundle's own header).

/**
 * Gold-framed team photo, sharp 2px corners, bottom shade.
 * `data-drop-if-empty` collapses the flex block when no photo is bound.
 */
const PHOTO_BLOCK =
  `<div data-drop-if-empty="teamPhoto" style="flex:1;min-height:0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">${slot("teamPhoto", "photo", "rect")}` +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div></div>`;

/** PREMIERS hero (gold, poster size) + mono competition line. */
function heroBlock(flex: boolean): string {
  const size = flex ? "calc(var(--k,1.4)*118px)" : "165px";
  return (
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${size};line-height:.82;text-transform:uppercase;color:var(--gold,#F5B21A)">PREMIERS</div>` +
    `<div style="margin-top:10px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">{{competition}}</div></div></div>`
  );
}

/** Result line + POTM credit (gold name in the mono line). */
const RESULT_BLOCK =
  `<div><div style="font-weight:800;font-size:32px;line-height:1.12;color:#fff">{{result}}</div>` +
  `<div style="margin-top:12px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">PLAYER OF THE MATCH · <span style="color:var(--gold,#F5B21A)">{{mom}}</span></div></div></div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

// Sponsors-off gold bar: same full-bleed band as fragments' footers (the
// negative margins pair with storyColumnRoot's padding) but binding
// {{hashtags}} — see the module note.
const hashtagBarStory =
  `<div style="flex:none;background:var(--gold,#F5B21A);margin:0 -80px -70px;padding:30px 80px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
  `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>` +
  `<span style="font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em">{{hashtags}}</span></div>`;

const storyHtml = storyColumnRoot(
  storyHeader("{{grade}} · {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:22px 0 31px;gap:20px">` +
    heroBlock(false) +
    PHOTO_BLOCK +
    RESULT_BLOCK +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(hashtagBarStory),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("PREMIERS", "{{grade}} · {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:calc(var(--k,1.4)*16px) 0 calc(var(--k,1.4)*14px);gap:calc(var(--k,1.4)*14px)">` +
    heroBlock(true) +
    PHOTO_BLOCK +
    RESULT_BLOCK +
    `</div>` +
    sponsorsOn(
      `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;color:rgba(255,255,255,.6)">season proudly supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
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
