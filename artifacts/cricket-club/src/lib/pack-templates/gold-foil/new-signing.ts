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

// B9 — New Signing. Welcome / recruit — script flourish, name, role & former
// club over a gold-ringed photo.
//
// Field keys match Broadcast Dark's new-signing (a subset) — `bindInput` maps
// a ShareCardInput onto keys per card KIND, not per pack. Two contract points:
//  - the name binds as {{playerFirstName}} {{playerLastName}} on one line (the
//    kind has no single playerName key);
//  - sponsorVariants is ["on"] only, per Pack A. The bundle drew a sponsors-off
//    hashtag branch anyway, but the kind declares no off variant, so the footer
//    follows Pack A's shape instead: an always-on {{clubHashtag}} with the
//    recruitment sponsor line appearing only when sponsors are on.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches).
// It is transcribed as the story with `--k` resolved at its 1.4 default into
// fixed px; the shared layout keeps the `calc(var(--k)*…)` sizes so portrait
// and square reflow, with Pack A's shared structure (text left, photo right,
// {{headline}} paragraph) as the guide.

/** `foilText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function foilFlex(content: string, px: number, extraStyle = ""): string {
  return foilText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/** Small club mark the B-series story header carries above the wordmark. */
const STORY_LOGO = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

/** Gold ring + drop shadow for the photo frame (both formats). */
const PHOTO_FRAME_SHADOW =
  "box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)";

/** Inner bottom scrim so type near the frame stays legible over the photo. */
const PHOTO_SCRIM = `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div>`;

/** Footer row: club hashtag always, recruitment sponsor only when sponsors on. */
const FOOTER_ROW =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.5)">recruitment by <span style="color:var(--gold,#F5B21A);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — framed photo, script flourish, foil name
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  STORY_LOGO +
    storyHeader("NEW SIGNING") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:17px;margin-bottom:34px">` +
    // Gold-ringed hero. `data-drop-if-empty` collapses the block inside this
    // flex column when no photo is bound, as match-result's story does.
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:560px;margin:22px 0;position:relative;border-radius:16px;overflow:hidden;${PHOTO_FRAME_SHADOW}">` +
    slot("photo", "photo", "rect") +
    PHOTO_SCRIM +
    `</div>` +
    `<div><div style="font-family:'Kaushan Script',cursive;font-size:64px;line-height:1;color:var(--gold,#F5B21A)">Welcome to the Club</div>` +
    foilText("{{playerFirstName}} {{playerLastName}}", 101, ";margin-top:12px") +
    `</div>` +
    `<div style="display:flex;flex-direction:column;gap:12px;align-items:center">` +
    `<div style="font-weight:700;font-size:24px;color:#fff">{{role}}</div>` +
    `<div style="font-weight:700;font-size:24px;color:#fff">from <span style="color:var(--gold,#F5B21A)">{{formerClub}}</span></div>` +
    `</div>` +
    `</div>` +
    FOOTER_ROW,
);

// ---------------------------------------------------------------------------
// Shared (portrait / square) — text column left, framed photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("NEW SIGNING", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:32px;padding:calc(var(--k,1.4)*16px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*18px)">` +
    `<div><div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*46px);line-height:1;color:var(--gold,#F5B21A)">Welcome to the Club</div>` +
    foilFlex("{{playerFirstName}}<br>{{playerLastName}}", 72, ";margin-top:14px;line-height:.92") +
    `</div>` +
    `<div style="display:flex;flex-direction:column;gap:12px">` +
    `<div style="font-weight:700;font-size:26px;color:#fff">{{role}}</div>` +
    `<div style="font-weight:700;font-size:26px;color:#fff">from <span style="color:var(--gold,#F5B21A)">{{formerClub}}</span></div>` +
    `</div>` +
    `<div style="font-weight:500;font-size:26px;line-height:1.45;color:rgba(255,255,255,.82);max-width:540px">{{headline}}</div>` +
    `</div>` +
    // Photo column: its own flex column so an unbound photo collapses the
    // whole right half and the text column takes the width.
    `<div data-drop-if-empty="photo" style="flex:1;min-width:0;display:flex;flex-direction:column">` +
    `<div style="flex:1;min-height:0;position:relative;border-radius:16px;overflow:hidden;${PHOTO_FRAME_SHADOW}">` +
    slot("photo", "photo", "rect") +
    PHOTO_SCRIM +
    `</div></div>` +
    `</div>` +
    FOOTER_ROW,
);

export const newSigning: PackCardTemplate = {
  kind: "newSigning",
  designKey: "new-signing",
  name: "New Signing",
  sponsorVariants: ["on"],
  fields: [
    ...clubHeaderFields(),
    textField("season", "Season", "2025/26"),
    textField("playerFirstName", "Player first name", "SAM"),
    textField("playerLastName", "Player last name", "WHITFIELD"),
    textField("role", "Role", "Top-order bat · right-arm medium"),
    textField("formerClub", "Former club", "Rockingham-Mandurah Mariners"),
    textField(
      "headline",
      "Headline",
      "The club gets a serious top-order boost for 2025/26. Let's go, Sam!",
    ),
    photoField("photo", "Player photo", "New player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Recruitment sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
