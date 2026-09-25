import type { PackCardTemplate } from "../types";
import {
  ACC,
  DISP,
  LINE,
  MUTED,
  bdAccentPill,
  bdPresentedByBody,
  bdCard,
  bdChip,
  bdColumn,
  bdEyebrow,
  bdFooterLogos,
  bdFormats,
  clubHeaderFields,
  logoField,
  photoField,
  slot,
  textField,
  type BdFormat,
} from "./fragments";
import { SK_COND, SK_MONO } from "../shared";

// A1 — Match Result. Handoff layout: mono match line, the two sides stacked
// as condensed name + big display score (opposition dimmed, club full), the
// result in an accent pill, the optional weekly photo on the right.
//
// The Player-of-the-Match panel stays gone: `potm.*` is not on ShareCardInput
// and nothing ever set it, so it published a fabricated player. The weekly
// team/action photo (`photo`) is optional — with none bound, the photo and its
// fades are dropped and the card sits on the plain stage.

function side(prefix: "club" | "opposition", dim: boolean): string {
  return (
    `<div style="display:flex;align-items:flex-end;gap:3cqmin;width:100%;min-width:0${dim ? ";opacity:.74" : ""}">` +
    `<div style="width:8cqmin;height:8cqmin;flex:none;border-radius:1cqmin;overflow:hidden;background:rgba(255,255,255,.08);margin-bottom:1.2cqmin">${slot(`${prefix}.logo`, "logo", "rounded", 8)}</div>` +
    `<div style="flex:1;min-width:0;padding-bottom:1.2cqmin">` +
    `<div data-fit="10" style="font-family:${SK_COND};font-weight:800;font-size:calc(6cqmin * var(--fit,1));line-height:1;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{${prefix}.name}}</div>` +
    `<div style="font-family:${SK_MONO};font-weight:500;font-size:2cqmin;letter-spacing:.14em;color:${MUTED};margin-top:.8cqmin">{{${prefix}.oversLabel}}</div>` +
    `</div>` +
    `<div style="flex:none;font-family:${DISP};font-size:17cqmin;line-height:.9">{{${prefix}.score}}</div>` +
    `</div>` +
    `<div style="font-size:2.5cqmin;line-height:1.4;font-weight:500;color:${MUTED};margin-top:.6cqmin;max-width:96cqmin">{{${prefix}.performers}}</div>`
  );
}

function build(fmt: BdFormat): string {
  // Landscape runs the abbreviated verb so the divider stays one short tag.
  const verb = fmt === "landscape" ? "{{resultVerbShort}}" : "{{resultVerb}}";
  const body = bdColumn(
    bdEyebrow("{{matchTitle}}") +
      `<div style="width:100%;margin-top:3cqmin">${side("opposition", true)}</div>` +
      `<div style="display:flex;align-items:center;gap:2cqmin;width:100%;margin:2.4cqmin 0">` +
      `<span style="font-family:${SK_MONO};font-weight:700;font-size:2.2cqmin;letter-spacing:.22em;color:${ACC};white-space:nowrap">${verb}</span>` +
      `<span style="flex:1;height:.2cqmin;background:${LINE}"></span>` +
      `</div>` +
      `<div style="width:100%">${side("club", false)}</div>` +
      bdAccentPill("{{result}}", 4.6, ";margin-top:3cqmin;max-width:100%") +
      bdPresentedByBody("presented by", ";margin-top:2.4cqmin"),
  );
  return bdCard({
    chip: bdChip("RESULT"),
    photo: "photo",
    body,
    footer: bdFooterLogos(),
  });
}

export const matchResult: PackCardTemplate = {
  kind: "matchSummary",
  designKey: "match-result",
  name: "Match Result",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("matchTitle", "Match title", "GAME 2 · ROUND 2"),
    textField("result", "Result banner", "YOUR CLUB WON BY 8 WICKETS"),
    textField("resultVerb", "Result verb (divider)", "DEFEATED BY"),
    textField("resultVerbShort", "Result verb (landscape, abbreviated)", "DEF"),
    textField("club.name", "Club side name", "Your Club"),
    textField("club.score", "Club score", "2/102"),
    textField("club.oversLabel", "Club overs label", "15 OVERS"),
    textField("club.performers", "Club top performers", "J. Manuel 39* (38) · T. Miles 35* (35)"),
    logoField("club.logo", "Club side logo", "Logo"),
    textField("opposition.name", "Opposition name", "Rockingham Hornets"),
    textField("opposition.score", "Opposition score", "9/97"),
    textField("opposition.oversLabel", "Opposition overs label", "20 OVERS"),
    textField(
      "opposition.performers",
      "Opposition top performers",
      "E. Smith 33 (28) · A. Beattie 2/9 (4)",
    ),
    logoField("opposition.logo", "Opposition logo", "Logo"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    // Optional weekly team / action shot — the right-hand photo. Dropped with
    // its fades when unset (`data-drop-if-empty`).
    photoField("photo", "Team or action photo", "Team photo"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  formats: bdFormats(build),
};
