import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  neonText,
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

// D14 — Premiership. Flag won — season, competition, result & the
// Player-of-the-Match line. Unlike the forbidden potm.* blocks, {{mom}} is
// real admin-entered data on this kind (Pack A renders the same line), so the
// "PLAYER OF THE MATCH · {{mom}}" ribbon stays, in the bundle's glowing cyan.
//
// Field keys are a SUBSET of Broadcast Dark's premiership — `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. Contract points:
//  - the bundle's team-photo slot is data-field="photo", but the premiership
//    contract key is teamPhoto — bound (and dropped-if-empty) under that key;
//  - the premiership kind has NO sponsor1–3 keys, so the bundle's three-logo
//    strip becomes the presented-by line in both formats;
//  - the sponsors-off footer binds {{hashtags}} — in this pack the story
//    hashtag footer already binds that key, so the fragment constants serve
//    both formats directly (unlike Packs B/C, whose story footers bind
//    clubHashtag, a key this kind lacks);
//  - the bundle card note promises the competition but its markup never shows
//    it — {{competition}} is added as the glowing mono line under the PREMIERS
//    hero (grade + season take the header tag, as in the bundle's own header).
//    Packs B and C made the same call.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches —
// verified in the markup). It is transcribed as the story with `--k` resolved
// at its 1.4 default into fixed px; the shared layout keeps the
// `calc(var(--k)*…)` sizes so portrait and square reflow.

/** `neonText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function neonFlex(
  content: string,
  px: number,
  glow: "cyan" | "gold" = "cyan",
  extraStyle = "",
): string {
  return neonText(content, px, glow, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/** Glowing cyan mono line (the bundle's ribbon treatment). */
function cyanRibbon(content: string): string {
  return `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7);margin-top:12px">${content}</div>`;
}

/** PREMIERS hero in the gold neon glow + the competition ribbon. */
function heroBlock(heroHtml: string): string {
  return `<div>${heroHtml}${cyanRibbon("{{competition}}")}</div>`;
}

/**
 * Cyan-ringed team photo. `data-drop-if-empty` collapses the frame inside the
 * flex column when no photo is bound.
 */
function teamPhotoFrame(margin: string): string {
  return (
    `<div data-drop-if-empty="teamPhoto" style="flex:1;min-height:0;width:100%;max-width:600px;margin:${margin};position:relative;border-radius:22px;overflow:hidden;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
    slot("teamPhoto", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(4,7,13,.9)"></div></div>`
  );
}

/** Result headline + the Player-of-the-Match ribbon. */
const RESULT_BLOCK =
  `<div><div style="font-weight:800;font-size:32px;line-height:1.15;color:#fff">{{result}}</div>` +
  cyanRibbon("PLAYER OF THE MATCH · {{mom}}") +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("PREMIERS · {{grade}} {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:14px;margin-bottom:22px">` +
    heroBlock(neonText("PREMIERS", 151, "gold", ";line-height:.9")) +
    teamPhotoFrame("17px 0") +
    RESULT_BLOCK +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("PREMIERS", "{{grade}} · {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding:calc(var(--k,1.4)*10px) 0 calc(var(--k,1.4)*12px)">` +
    heroBlock(neonFlex("PREMIERS", 108, "gold", ";line-height:.9")) +
    teamPhotoFrame("calc(var(--k,1.4)*12px) 0") +
    RESULT_BLOCK +
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
