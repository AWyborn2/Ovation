import type { PackCardTemplate } from "../types";
import { CLUB_LOGO_SLOT, logoField, photoField, slot, textField } from "../shared";
import {
  C,
  PUSH,
  chip,
  crestBox,
  crestStandIn,
  dtCard,
  dtFormats,
  face,
  hashtag,
  headline,
  nameBox,
  sheetFoot,
  sponsorStrip,
  u,
  type DtFormat,
} from "./parts";

// Match Result (and a results carousel slide). Headline: the one-word result
// (WIN / RESULT / DRAW, or TIE / NO RESULT / ABANDONED). The sheet: the match
// (grade and round) as a chip, both sides with crest, name and score, the
// result line, top performers when there are any, then the club, sponsor and
// hashtag at its foot.

/** Characters a result name box holds at full size, per format (tuned in the browser). */
export const DT_RESULT_NAME_FIT: Record<DtFormat, number> = {
  square: 17,
  portrait: 15,
  story: 13,
  landscape: 12,
};

const NAME_SIZE: Record<DtFormat, number> = {
  square: 4.2,
  portrait: 4.4,
  story: 4.6,
  landscape: 3.9,
};

/** Score size (scaled cqmin) per format. */
const SCORE_SIZE: Record<DtFormat, number> = { square: 6, portrait: 6, story: 6, landscape: 5.2 };

function side(f: DtFormat, prefix: "club" | "opposition"): string {
  const size = NAME_SIZE[f];
  const crest = size * 1.25;
  const logoKey = `${prefix}.logo`;
  const logo = slot(logoKey, "logo", "rect").replace(
    'data-shape="rect"',
    'data-shape="rect" data-fit="contain"',
  );
  return (
    `<div style="display:flex;align-items:center;gap:${u(f, 1.8)};min-width:0">` +
    crestBox(f, crest, logo, `data-drop-if-empty="${logoKey}"`) +
    crestStandIn(f, crest, logoKey) +
    `<div style="flex:1;min-width:0">` +
    nameBox(f, `{{${prefix}.name}}`, DT_RESULT_NAME_FIT[f], size) +
    `<div style="${face(100, 500)};font-size:${u(f, 1.9)};letter-spacing:.04em;color:${C.label};margin-top:${u(f, 0.4)}">{{${prefix}.oversLabel}}</div>` +
    `</div>` +
    `<div style="flex:none;${face(100, 900)};font-size:${u(f, SCORE_SIZE[f])};line-height:.95;color:${prefix === "club" ? C.ink : C.label}">{{${prefix}.score}}</div>` +
    `</div>`
  );
}

function performers(f: DtFormat, key: string): string {
  return `<div data-drop-if-field="${key}" style="${face(100, 500)};font-size:${u(f, 2.1)};line-height:1.35;color:${C.label};margin-top:${u(f, 0.8)}">{{${key}}}</div>`;
}

function build(f: DtFormat): string {
  const sheet =
    `<div style="min-width:0">${chip(f, "{{matchTitle}}")}</div>` +
    `<div style="display:flex;flex-direction:column;gap:${u(f, 1.6)};margin-top:${u(f, 2.2)}">` +
    side(f, "club") +
    side(f, "opposition") +
    `</div>` +
    (f === "landscape" ? PUSH : "") +
    `<div style="${face(108, 800)};font-size:${u(f, 2.8)};line-height:1.2;margin-top:${u(f, 2.2)};color:${C.ink}">{{result}}</div>` +
    performers(f, "club.performers") +
    performers(f, "opposition.performers") +
    sheetFoot(
      f,
      crestBox(f, 4.4, CLUB_LOGO_SLOT) +
        `<div data-fit="18" style="min-width:0;${face(112, 900)};font-size:calc(${u(f, 2.4)} * var(--fit,1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{clubName}}</div>` +
        sponsorStrip(f, ""),
      hashtag(f, "hashtags"),
    );
  return dtCard({
    f,
    photo: "photo",
    head: headline(f, "{{resultWord}}"),
    sheet,
    landWidth: 52,
  });
}

export const matchResult: PackCardTemplate = {
  kind: "matchSummary",
  designKey: "match-result",
  name: "Match Result",
  sponsorVariants: ["on"],
  fields: [
    textField("clubName", "Club name", "YOUR CLUB"),
    logoField("clubLogo", "Club logo", "Club logo"),
    textField("matchTitle", "Match title", "A Grade • Round 2"),
    textField("result", "Result banner", "Your Club won by 8 wickets"),
    textField("resultWord", "Result word", "WIN"),
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
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    photoField("photo", "Team or action photo", "Team photo"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  formats: dtFormats(build),
};
