import type { PackCardTemplate } from "../types";
import {
  clubHeaderFields,
  glassPanel,
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

// D3 — Player Spotlight. Cyan-ring cutout, neon name, glass stat chips,
// one-line story.
//
// Field keys are IDENTICAL to Broadcast Dark's player-spotlight: `bindInput`
// maps a ShareCardInput onto keys per card KIND, not per pack.
//
// Sponsors: like Pack A's A3 this card is ["on"]-only. The bundle carries a
// three-logo strip (needing `sponsor1..3` keys the reference design for
// "player" does not declare) and a sponsors-off hashtag line (needing
// `hashtags`, also undeclared) — both replaced with Pack A's footer contract:
// {{clubHashtag}} always visible, presented-by line only when sponsors are on.
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in on the pack's storyColumnRoot/storyHeader. The shared layout is
// authored from Pack A's shared structure (content column left, photo right)
// in Neon Night's language.

/** Bundle photo frame: cyan glow ring + bottom scrim. Drops when no photo is
 * bound — an empty glowing box otherwise dominates the card. */
const STORY_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:600px">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:22px;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(4,7,13,.9)"></div></div></div>`;

const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:22px;overflow:hidden;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(4,7,13,.9)"></div></div>`;

/** {{clubHashtag}} always visible; sponsor line only when sponsors are on. */
const FOOTER_ROW =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:22px;line-height:1;letter-spacing:.1em;color:var(--gold,#F5B21A)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

/** Chip label under the neon value. */
function chipLabel(labelKey: string): string {
  return `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.6);margin-top:10px">{{${labelKey}}}</div>`;
}

/** Story stat chip: the hero chip is accent-tinted glass with an accent-glow
 * value; the others are the pack's plain glass with white/cyan-glow values. */
function statChipStory(valueKey: string, labelKey: string, hero: boolean): string {
  const value = neonText(`{{${valueKey}}}`, 70, hero ? "gold" : "cyan", ";line-height:.9");
  if (hero) {
    return (
      `<div style="flex:1;background:color-mix(in srgb, var(--gold,#FBAC27) 10%, transparent);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent);border-radius:24px;backdrop-filter:blur(6px);box-shadow:0 0 50px -12px color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent);padding:22px 14px;text-align:center">` +
      value +
      chipLabel(labelKey) +
      `</div>`
    );
  }
  return glassPanel(value + chipLabel(labelKey), ";flex:1;padding:22px 14px;text-align:center");
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — cyan-ring photo, neon name, glass chips, headline
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("PLAYER SPOTLIGHT") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:25px;margin:17px 0 22px">` +
    STORY_PHOTO +
    neonText("{{playerName}}", 101, "gold", ";line-height:.9") +
    `<div style="display:flex;gap:16px;width:100%;max-width:620px">` +
    statChipStory("stat1Value", "stat1Label", true) +
    statChipStory("stat2Value", "stat2Label", false) +
    statChipStory("stat3Value", "stat3Label", false) +
    `</div>` +
    `<div style="flex:none;font-weight:500;font-size:23px;line-height:1.45;color:rgba(255,255,255,.78);max-width:640px">{{headline}}</div>` +
    `</div>` +
    FOOTER_ROW,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: content column left, photo right
// ---------------------------------------------------------------------------

/** Shared chip: same glass shells, plain values (glow stays story-side). */
function statChipShared(valueKey: string, labelKey: string, hero: boolean): string {
  const colour = hero ? "color:var(--gold,#FBAC27)" : "color:#fff";
  const value = `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*44px);line-height:.9;${colour}">{{${valueKey}}}</div>`;
  const shell = hero
    ? `background:color-mix(in srgb, var(--gold,#FBAC27) 10%, transparent);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent)`
    : `background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16)`;
  return (
    `<div style="flex:1;${shell};border-radius:16px;backdrop-filter:blur(6px);padding:18px 14px;text-align:center">` +
    value +
    chipLabel(labelKey) +
    `</div>`
  );
}

const sharedHtml = sharedColumnRoot(
  sharedHeader("SPOTLIGHT", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*20px)">` +
    `<div><div style="font:700 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7)">PLAYER SPOTLIGHT</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*88px);line-height:.92;margin-top:14px;text-transform:uppercase">{{playerName}}</div></div>` +
    `<div style="display:flex;gap:16px">` +
    statChipShared("stat1Value", "stat1Label", true) +
    statChipShared("stat2Value", "stat2Label", false) +
    statChipShared("stat3Value", "stat3Label", false) +
    `</div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.45;color:rgba(255,255,255,.8);max-width:560px">{{headline}}</div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    FOOTER_ROW,
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
