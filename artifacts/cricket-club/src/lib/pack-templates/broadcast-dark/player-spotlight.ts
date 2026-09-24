import type { PackCardTemplate } from "../types";
import { SK_MONO } from "../shared";
import {
  ACC,
  DISP,
  MUTED,
  bdCard,
  bdChip,
  bdColumn,
  bdDisplay,
  bdEyebrow,
  bdFooterOn,
  bdFormats,
  bdSub,
  clubHeaderFields,
  photoField,
  textField,
} from "./fragments";

// A3 — Player Spotlight. Name in display type, three stat boxes (the first on
// the accent), one-line story; photo right. No sponsors-off branch in the
// bundle — honoured as designed.

function statBox(n: 1 | 2 | 3): string {
  const lead = n === 1;
  const box = lead
    ? `background:color-mix(in srgb, ${ACC} 16%, transparent);border:.25cqmin solid color-mix(in srgb, ${ACC} 50%, transparent)`
    : `background:rgba(255,255,255,.06);border:.25cqmin solid rgba(255,255,255,.16)`;
  return (
    `<div style="${box};border-radius:1.4cqmin;padding:2cqmin 3cqmin;text-align:center;min-width:14cqmin">` +
    `<div style="font-family:${DISP};font-size:9cqmin;line-height:.9${lead ? `;color:${ACC}` : ""}">{{stat${n}Value}}</div>` +
    `<div style="font-family:${SK_MONO};font-weight:500;font-size:1.9cqmin;letter-spacing:.1em;color:${MUTED};margin-top:1cqmin;text-transform:uppercase">{{stat${n}Label}}</div>` +
    `</div>`
  );
}

const html = bdCard({
  chip: bdChip("SPOTLIGHT"),
  tag: "{{season}}",
  photo: "photo",
  body: bdColumn(
    bdEyebrow("PLAYER SPOTLIGHT") +
      bdDisplay("{{playerName}}", 13, ";max-width:78cqmin") +
      `<div style="display:flex;gap:2cqmin;margin-top:4cqmin">${statBox(1)}${statBox(2)}${statBox(3)}</div>` +
      bdSub("{{headline}}", ";margin-top:4cqmin;max-width:72cqmin"),
  ),
  footer: bdFooterOn("presented by"),
});

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
  formats: bdFormats(() => html),
};
