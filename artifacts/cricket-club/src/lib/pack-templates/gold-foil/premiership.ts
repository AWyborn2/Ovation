import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  foilText,
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

// B14 — Premiership. Flag won — season, competition, result & the
// Player-of-the-Match line. Unlike the forbidden potm.* blocks, {{mom}} is
// real admin-entered data on this kind (Pack A renders the same line), so the
// "PLAYER OF THE MATCH · {{mom}}" ribbon stays.
//
// Field keys match Broadcast Dark's premiership — `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. Contract points:
//  - the photo key is {{teamPhoto}}, not photo (the bundle's data-field name
//    is rebound accordingly);
//  - the premiership kind has NO sponsor1–3 keys, so the bundle's three-logo
//    strip becomes the presented-by line in both formats;
//  - the story sponsors-off footer binds {{hashtags}} (the kind has no
//    clubHashtag key, so HASHTAG_FOOTER_STORY's {{clubHashtag}} cannot be
//    used — a local line with the same styling stands in).
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches).
// It is transcribed as the story with `--k` resolved at its 1.4 default into
// fixed px; the shared layout keeps the `calc(var(--k)*…)` sizes so portrait
// and square reflow, with Pack A's shared structure (grade/season line,
// competition, framed team photo, result + POTM) as the guide.

/** `foilText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function foilFlex(content: string, px: number, extraStyle = ""): string {
  return foilText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/** Small club mark the B-series story header carries above the wordmark. */
const STORY_LOGO = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

/**
 * Gold-ringed team photo. `data-drop-if-empty` collapses the frame inside the
 * flex column when no photo is bound.
 */
function teamPhotoFrame(margin: string): string {
  return (
    `<div data-drop-if-empty="teamPhoto" style="flex:1;min-height:0;width:100%;max-width:600px;margin:${margin};position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
    slot("teamPhoto", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>`
  );
}

/** Result headline + the Player-of-the-Match ribbon. */
const RESULT_BLOCK =
  `<div><div style="font-weight:800;font-size:34px;line-height:1.15;color:#fff">{{result}}</div>` +
  `<div style="font:600 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:14px">PLAYER OF THE MATCH · <span style="color:var(--gold,#F5B21A)">{{mom}}</span></div></div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

const hashtagFooterStory = `<div style="flex:none;text-align:center;font-weight:600;font-size:20px;line-height:1;letter-spacing:.14em;color:rgba(255,255,255,.4)">{{hashtags}}</div>`;

const storyHtml = storyColumnRoot(
  STORY_LOGO +
    storyHeader("PREMIERS · {{grade}} {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:14px;margin-bottom:34px">` +
    foilText("PREMIERS", 151) +
    teamPhotoFrame("22px 0") +
    RESULT_BLOCK +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(hashtagFooterStory),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("PREMIERS", "{{grade}} · {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding:calc(var(--k,1.4)*12px) 0">` +
    `<div>` +
    foilFlex("PREMIERS", 106) +
    `<div style="font-weight:700;font-size:30px;line-height:1.2;color:var(--gold,#F5B21A);margin-top:10px">{{competition}}</div>` +
    `</div>` +
    teamPhotoFrame("calc(var(--k,1.4)*14px) 0") +
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
