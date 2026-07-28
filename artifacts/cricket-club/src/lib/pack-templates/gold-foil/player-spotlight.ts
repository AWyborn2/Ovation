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

// B3 — Player Spotlight. Big photo, foil name, stat chips, one-line story.
//
// Field keys are IDENTICAL to Broadcast Dark's player-spotlight: `bindInput`
// maps a ShareCardInput onto keys per card KIND, not per pack.
//
// Sponsors: like Pack A's A3 this card is ["on"] only. The bundle's
// sponsors-off branch was a hashtag line needing keys outside the reference
// contract, and its sponsors-on block was a three-logo strip whose
// `sponsor1..3` keys the reference design for "player" does not declare — both
// replaced with Pack A's footer structure ({{clubHashtag}} always visible,
// presented-by line only when sponsors are on).
//
// The bundle is story-only; the shared (portrait/square) layout is authored
// here from the story's visual language plus Pack A's shared structure
// (left content column, right photo), per the pack's convention that the
// non-story branch sits closer to Broadcast Dark's shared layout.

/** Bundle story header carries the club logo above the wordmark. */
const storyLogo = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

/** {{clubHashtag}} always visible; sponsor line only when sponsors are on. */
const footerRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:22px;line-height:1;letter-spacing:.1em;color:var(--gold,#F5B21A)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:var(--gold,#F5B21A);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

/** Stat chip; the first is gold-tinted (with a foil number in the story). */
function statChip(valueHtml: string, labelKey: string, hero: boolean): string {
  const shell = hero
    ? `background:color-mix(in srgb, var(--gold,#F5B21A) 14%, transparent);border:1px solid color-mix(in srgb, var(--gold,#F5B21A) 40%, transparent)`
    : `background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14)`;
  return (
    `<div style="flex:1;${shell};border-radius:14px;padding:20px 10px">` +
    valueHtml +
    `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.6);margin-top:8px">{{${labelKey}}}</div></div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — centred column, gold-ring hero, foil name, chips
// ---------------------------------------------------------------------------

const whiteChipValueStory = (key: string) =>
  `<div style="font-family:var(--disp,'Anton'),sans-serif;color:#fff;font-size:72px;line-height:.9">{{${key}}}</div>`;

const storyHtml = storyColumnRoot(
  storyLogo +
    storyHeader("PLAYER SPOTLIGHT") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:28px;margin:30px 0 32px">` +
    // Hero photo: gold ring + bottom scrim. Dropped entirely when no photo is
    // bound — a large empty framed box otherwise dominates the card.
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:640px;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -90px 90px -50px rgba(6,7,9,.9)"></div></div>` +
    foilText("{{playerName}}", 112, ";flex:none;line-height:.86") +
    `<div style="flex:none;display:flex;gap:16px;width:100%;max-width:620px">` +
    statChip(foilText("{{stat1Value}}", 72, ";line-height:.9"), "stat1Label", true) +
    statChip(whiteChipValueStory("stat2Value"), "stat2Label", false) +
    statChip(whiteChipValueStory("stat3Value"), "stat3Label", false) +
    `</div>` +
    `<div style="flex:none;font-weight:500;font-size:24px;line-height:1.45;color:rgba(255,255,255,.8);max-width:640px">{{headline}}</div>` +
    `</div>` +
    footerRow,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: content column left, photo right
// ---------------------------------------------------------------------------

const heroChipValueShared = `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*48px);line-height:.9;color:var(--gold,#F5B21A)">{{stat1Value}}</div>`;
const whiteChipValueShared = (key: string) =>
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*48px);line-height:.9;color:#fff">{{${key}}}</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("SPOTLIGHT", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*20px)">` +
    `<div><div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:var(--gold,#F5B21A)">PLAYER SPOTLIGHT</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*88px);line-height:.92;margin-top:14px;text-transform:uppercase">{{playerName}}</div></div>` +
    `<div style="display:flex;gap:16px;text-align:center">` +
    statChip(heroChipValueShared, "stat1Label", true) +
    statChip(whiteChipValueShared("stat2Value"), "stat2Label", false) +
    statChip(whiteChipValueShared("stat3Value"), "stat3Label", false) +
    `</div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.45;color:rgba(255,255,255,.8);max-width:560px">{{headline}}</div>` +
    `</div>` +
    `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 24px 60px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>` +
    `</div>` +
    footerRow,
);

export const playerSpotlight: PackCardTemplate = {
  kind: "player",
  designKey: "player-spotlight",
  name: "Player Spotlight",
  sponsorVariants: ["on"],
  fields: [
    ...clubHeaderFields(),
    textField("season", "Season", "2025/26"),
    textField("playerName", "Player name", "JACK MANUEL"),
    textField("stat1Value", "Stat 1 value", "428"),
    textField("stat1Label", "Stat 1 label", "RUNS"),
    textField("stat2Value", "Stat 2 value", "12"),
    textField("stat2Label", "Stat 2 label", "WICKETS"),
    textField("stat3Value", "Stat 3 value", "89"),
    textField("stat3Label", "Stat 3 label", "GAMES"),
    textField(
      "headline",
      "Headline",
      "A mainstay of the top order — 428 runs across the 2025/26 season so far.",
    ),
    photoField("photo", "Player photo", "Player photo / cutout"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
