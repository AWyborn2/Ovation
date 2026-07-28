import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
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

// C15 — New Cap. Cap presentation — photo, number, name & grade.
//
// Field keys are deliberately IDENTICAL to Broadcast Dark's new-cap (a full
// match, no subset needed): `bindInput` in pack-render.ts maps a
// ShareCardInput onto keys per card KIND, not per pack. As in Pack A, "CAP "
// stays literal and {{capNumber}} binds the number only.
//
// The bundle ships ONE `--k`-scaled composition; transcribed as the story with
// `--k` resolved at its 1.4 default into fixed px, shared keeps the calcs.
//
// Bundle departures, all contract-driven:
//  - the three-logo sponsor strip is dropped: sponsor1–3 are not in Pack A's
//    new-cap contract. The gold bar carries the sponsor story instead —
//    sponsors-on is fragments' PRESENTED_BY_STORY ("presented by
//    {{sponsorPresentedBy}}"), sponsors-off is HASHTAG_FOOTER_STORY
//    ({{clubHashtag}});
//  - the story header follows the pack's storyHeader (club wordmark left, no
//    logo slot); the bundle's card label + season tags merge into its right
//    tag ("NEW CAP · {{season}}").

/**
 * Gold-framed player photo, sharp 2px corners, bottom shade.
 * `data-drop-if-empty` collapses the flex block when no photo is bound.
 */
const PHOTO_BLOCK =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">${slot("photo", "photo", "rect")}` +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div></div>`;

/** Gold player name + mono grade line, then the oversized cap number. */
function capBlock(flex: boolean): string {
  const nameSize = flex ? "calc(var(--k,1.4)*58px)" : "81px";
  const capSize = flex ? "calc(var(--k,1.4)*112px)" : "157px";
  return (
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${nameSize};color:var(--gold,#F5B21A);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="margin-top:8px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">{{grade}}</div></div></div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${capSize};line-height:.82;color:#fff;text-transform:uppercase">CAP {{capNumber}}</div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("NEW CAP · {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:22px 0 31px;gap:20px">` +
    PHOTO_BLOCK +
    capBlock(false) +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("NEW CAP", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:calc(var(--k,1.4)*16px) 0 calc(var(--k,1.4)*14px);gap:calc(var(--k,1.4)*14px)">` +
    PHOTO_BLOCK +
    capBlock(true) +
    `</div>` +
    sponsorsOn(
      `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;color:rgba(255,255,255,.6)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

export const newCap: PackCardTemplate = {
  kind: "newCap",
  designKey: "new-cap",
  name: "New Cap",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("playerName", "Player name", "Dylan Hulse"),
    textField("grade", "Grade", "A Grade · Men's XI"),
    textField("capNumber", "Cap number", "247"),
    textField("season", "Season", "2025/26"),
    photoField("photo", "Player photo", "Player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
