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

// D9 — New Signing. Welcome / recruit — script flourish, gold-glow name, role
// & former club under a cyan-ringed photo.
//
// Field keys match Broadcast Dark's new-signing (a subset) — `bindInput` maps
// a ShareCardInput onto keys per card KIND, not per pack. Contract points:
//  - the name binds as {{playerFirstName}} {{playerLastName}} on one line (the
//    kind has no single playerName key);
//  - sponsorVariants is ["on"] only, per Pack A. The bundle drew a sponsors-off
//    hashtag branch AND a three-logo strip anyway, but the kind declares no off
//    variant and no sponsor1–3 keys, so the footer follows Pack A's shape: an
//    always-on {{clubHashtag}} (in the pack's glowing cyan mono) with the
//    recruitment sponsor line appearing only when sponsors are on.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches —
// verified in the markup). It is transcribed as the story with `--k` resolved
// at its 1.4 default into fixed px; the shared layout keeps the
// `calc(var(--k)*…)` sizes so portrait and square reflow, with Pack A's shared
// structure (text left, photo right, {{headline}} paragraph) as the guide.

/** `neonText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function neonFlex(
  content: string,
  px: number,
  glow: "cyan" | "gold" = "cyan",
  extraStyle = "",
): string {
  return neonText(content, px, glow, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/** Cyan floodlight ring + halo for the photo frame (both formats). */
const PHOTO_FRAME_SHADOW =
  "box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)";

/** Inner bottom scrim so type near the frame stays legible over the photo. */
const PHOTO_SCRIM = `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(4,7,13,.9)"></div>`;

/** The bundle's script flourish, glowing floodlight cyan. */
function flourish(fontSize: string): string {
  return `<div style="font-family:'Kaushan Script',cursive;font-size:${fontSize};line-height:1;color:#37CFE6;text-shadow:0 0 20px rgba(55,207,230,.7)">Welcome to the Club</div>`;
}

/** Footer row: club hashtag always, recruitment sponsor only when sponsors on. */
const FOOTER_ROW =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.8)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.5)">recruitment by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — cyan-framed photo, script flourish, gold-glow name
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("NEW SIGNING") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:17px;margin-bottom:22px">` +
    // Cyan-ringed hero. `data-drop-if-empty` collapses the block inside this
    // flex column when no photo is bound, as match-result's story does.
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:560px;margin-bottom:20px;position:relative;border-radius:22px;overflow:hidden;${PHOTO_FRAME_SHADOW}">` +
    slot("photo", "photo", "rect") +
    PHOTO_SCRIM +
    `</div>` +
    `<div>` +
    flourish("64px") +
    neonText(
      "{{playerFirstName}} {{playerLastName}}",
      90,
      "gold",
      ";margin-top:12px;line-height:.9",
    ) +
    `</div>` +
    `<div style="display:flex;flex-direction:column;gap:10px;align-items:center">` +
    `<div style="font-weight:700;font-size:23px;color:#fff">{{role}}</div>` +
    `<div style="font-weight:700;font-size:23px;color:#fff">from <span style="color:var(--gold,#F5B21A)">{{formerClub}}</span></div>` +
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
    `<div>` +
    flourish("calc(var(--k,1.4)*46px)") +
    neonFlex(
      "{{playerFirstName}}<br>{{playerLastName}}",
      64,
      "gold",
      ";margin-top:14px;line-height:.92",
    ) +
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
    `<div style="flex:1;min-height:0;position:relative;border-radius:22px;overflow:hidden;${PHOTO_FRAME_SHADOW}">` +
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
