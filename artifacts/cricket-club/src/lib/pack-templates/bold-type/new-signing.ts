import type { PackCardTemplate } from "../types";
import {
  clubHeaderFields,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// C9 — New Signing. Welcome / recruit — name stack, photo, role & former club.
//
// Field keys are deliberately a SUBSET of Broadcast Dark's new-signing:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack. headline is unused (the bundle has no copy block).
//
// Pack A's new-signing is ["on"]-only, so despite the bundle carrying a
// sponsors-off hashtag branch AND a three-logo strip, this card matches the
// contract: no sponsors-off wrapper anywhere, no sponsor1–3 (not in the
// contract), and the single sponsors-on credit is Pack A's "recruitment by
// {{sponsorPresentedBy}}" riding the gold bar's right side — the bar itself
// always renders, so with sponsors off the credit simply disappears.
//
// The bundle ships ONE `--k`-scaled composition; transcribed as the story with
// `--k` resolved at its 1.4 default into fixed px, shared keeps the calcs.
// The bundle's split name ("SAM" white / "WHITFIELD" gold) maps cleanly onto
// Pack A's playerFirstName / playerLastName keys. The story header carries the
// card label + season as its right tag ({{clubName}} holds the left slot;
// Bold Type's storyHeader has no logo slot by design).

/** Kicker + two-line name stack (first name white, last name gold). */
function nameBlock(flex: boolean): string {
  const size = flex ? "calc(var(--k,1.4)*96px)" : "134px";
  return (
    `<div><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">WELCOME TO THE CLUB</div>` +
    `<div style="margin-top:8px"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${size};line-height:.82;text-transform:uppercase;color:#fff">{{playerFirstName}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${size};line-height:.82;text-transform:uppercase;color:var(--gold,#F5B21A)">{{playerLastName}}</div></div></div>`
  );
}

/**
 * Gold-framed hero photo, sharp 2px corners, bottom shade for legibility.
 * `data-drop-if-empty` collapses the flex block when no photo is bound.
 */
const PHOTO_BLOCK =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">${slot("photo", "photo", "rect")}` +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div></div>`;

/** ROLE / FROM hard-rule row (former club set gold). */
const INFO_ROW =
  `<div style="display:flex;gap:24px;border-top:2px solid rgba(255,255,255,.16);padding-top:24px">` +
  `<div style="flex:1"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">ROLE</div>` +
  `<div style="font-weight:800;font-size:24px;color:#fff;margin-top:8px">{{role}}</div></div>` +
  `<div style="flex:1"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">FROM</div>` +
  `<div style="font-weight:800;font-size:24px;color:var(--gold,#F5B21A);margin-top:8px">{{formerClub}}</div></div></div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

// The gold bar always renders (no off variant on this card); only the
// recruitment credit is sponsor-conditional.
const goldBarStory =
  `<div style="flex:none;background:var(--gold,#F5B21A);margin:0 -80px -70px;padding:30px 80px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
  `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>` +
  sponsorsOn(
    `<span style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.82">recruitment by {{sponsorPresentedBy}}</span>`,
  ) +
  `</div>`;

const storyHtml = storyColumnRoot(
  storyHeader("NEW SIGNING · {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:22px 0 31px;gap:20px">` +
    nameBlock(false) +
    PHOTO_BLOCK +
    INFO_ROW +
    `</div>` +
    goldBarStory,
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("NEW SIGNING", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:calc(var(--k,1.4)*16px) 0 calc(var(--k,1.4)*14px);gap:calc(var(--k,1.4)*14px)">` +
    nameBlock(true) +
    PHOTO_BLOCK +
    INFO_ROW +
    `</div>` +
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A)">{{clubHashtag}}</div>` +
    sponsorsOn(
      `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6)">recruitment by <span style="color:#fff">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>`,
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
    photoField("photo", "Player photo", "New player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Recruitment sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
