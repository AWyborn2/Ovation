import type { PackCardTemplate } from "../types";
import { CLUB_LOGO_SLOT, logoField, photoField, slot, textField } from "../shared";
import {
  C,
  PUSH,
  crestBox,
  crestStandIn,
  chip,
  dataLine,
  divider,
  dtCard,
  dtFormats,
  face,
  headline,
  homeAwayChip,
  nameBox,
  sponsorStrip,
  u,
  type DtFormat,
} from "./parts";

// Match Day (one fixture per slide). Headline: the round ("ROUND 6"; a final
// shows its label; no round → "MATCH DAY"). The sheet: grade and Home/Away
// chips, our club (crest + name), "v" + the opposition (crest + name), then
// the date, start and ground — one line on square and portrait, two on
// landscape, a labelled list on story. Optional data (ADR-010 P5) drops out
// when empty: each side's ladder place, then a line each for the last meeting
// and milestone watch; then the admin's note and the team sponsor.

/**
 * Characters a fixture name box holds at full size, per format: the
 * opposition's box (the narrower, after "v", with a ladder place showing)
 * measured in the browser, at 0.7em a character. The brief's starting
 * targets were 20 / 17 / 15 / 13.
 */
export const DT_FIXTURE_NAME_FIT: Record<DtFormat, number> = {
  square: 18,
  portrait: 15,
  story: 12,
  landscape: 13,
};

/** Name size (scaled cqmin) per format. */
const NAME_SIZE: Record<DtFormat, number> = {
  square: 4.9,
  portrait: 5.4,
  story: 5.8,
  landscape: 4.4,
};

function ladderPlace(f: DtFormat, key: string): string {
  return `<div data-drop-if-field="${key}" data-ladder-place="1" style="flex:none;align-self:center;${face(100, 700)};font-size:${u(f, 2.2)};color:${C.label}">{{${key}}}</div>`;
}

function teams(f: DtFormat): string {
  const size = NAME_SIZE[f];
  const crest = size * 1.12;
  const fit = DT_FIXTURE_NAME_FIT[f];
  // Crests sit top-aligned with the first line of a wrapped name.
  const row = (inner: string) =>
    `<div style="display:flex;align-items:flex-start;gap:${u(f, 1.8)};min-width:0">${inner}</div>`;
  return (
    `<div style="display:flex;flex-direction:column;gap:${u(f, 1)};margin-top:${u(f, 2.2)}">` +
    row(
      crestBox(f, crest, CLUB_LOGO_SLOT) +
        nameBox(f, "{{clubName}}", fit, size) +
        ladderPlace(f, "ladder.club"),
    ) +
    row(
      crestBox(
        f,
        crest,
        slot("opposition.logo", "logo", "rect").replace(
          'data-shape="rect"',
          'data-shape="rect" data-fit="contain"',
        ),
        'data-drop-if-empty="opposition.logo"',
      ) +
        crestStandIn(f, crest, "opposition.logo") +
        `<div style="flex:none;${face(112, 900)};font-size:${u(f, size)};line-height:1.06;color:${C.pLight}">v</div>` +
        nameBox(f, "{{opposition.name}}", fit, size) +
        ladderPlace(f, "ladder.opposition"),
    ) +
    `</div>`
  );
}

/** Date, start and ground: one line, two on landscape, a labelled list on story. */
function details(f: DtFormat): string {
  const text = `${face(100, 600)};font-size:${u(f, 2.5)};line-height:1.35;color:${C.label}`;
  if (f === "story") {
    const label = (t: string) => `<div style="${face(100, 500)};color:${C.label}">${t}</div>`;
    const value = (t: string) => `<div style="${face(100, 700)};color:${C.ink}">${t}</div>`;
    return (
      divider(f) +
      `<div style="display:grid;grid-template-columns:auto 1fr;column-gap:${u(f, 3)};row-gap:${u(f, 0.6)};font-size:${u(f, 2.5)};line-height:1.3">` +
      label("Date") +
      value("{{date}}") +
      label("Start") +
      value("{{startTime}}") +
      label("Ground") +
      value("{{venue}}") +
      `</div>`
    );
  }
  if (f === "landscape")
    return (
      `<div style="${text};margin-top:${u(f, 2)}">{{date}} · {{startTime}}</div>` +
      `<div style="${text}">{{venue}}</div>`
    );
  return `<div style="${text};margin-top:${u(f, 2)}">{{date}} · {{startTime}} · {{venue}}</div>`;
}

function note(f: DtFormat): string {
  return (
    `<div data-drop-if-field="note.title note.body" style="margin-top:${u(f, 1.8)};padding:${u(f, 1.4)} ${u(f, 2)};background:${C.tint};border-radius:${u(f, 2)}">` +
    `<div data-drop-if-field="note.title" style="${face(100, 800)};font-size:${u(f, 2)};letter-spacing:.06em;text-transform:uppercase;color:${C.pLight}">{{note.title}}</div>` +
    `<div style="${face(100, 500)};font-size:${u(f, 2.3)};line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{{note.body}}</div>` +
    `</div>`
  );
}

function build(f: DtFormat): string {
  const sheet =
    `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:${u(f, 2)};min-width:0">` +
    `<div style="min-width:0">${chip(f, "{{grade}}")}</div>` +
    homeAwayChip(f, "homeAway") +
    `</div>` +
    teams(f) +
    (f === "landscape" ? PUSH : "") +
    details(f) +
    dataLine(f, "lastMeeting", "Last met") +
    dataLine(f, "milestoneWatch", "", true) +
    note(f) +
    sponsorStrip(f, "Supported by", `;margin-top:${u(f, 2)}`);
  return dtCard({
    f,
    photo: "photo",
    head: headline(f, "{{roundLabel}}", { dropIfEmpty: "roundLabel", fallback: "MATCH DAY" }),
    sheet,
    landWidth: 48,
  });
}

export const matchDay: PackCardTemplate = {
  kind: "matchDay",
  designKey: "match-day",
  name: "Match Day",
  sponsorVariants: ["on"],
  fields: [
    textField("clubName", "Club name", "YOUR CLUB"),
    logoField("clubLogo", "Club logo", "Club logo"),
    textField("grade", "Grade / team", "A Grade"),
    textField("roundLabel", "Round label", "ROUND 3"),
    textField("opposition.name", "Opposition name", "MARINERS"),
    logoField("opposition.logo", "Opposition logo", "Opponent logo"),
    textField("homeAway", "Club home/away label", "HOME"),
    textField("venue", "Ground", "Rushton Park"),
    textField("date", "Date", "Sat 8 Nov"),
    textField("startTime", "Start time", "12:30 PM"),
    textField("note.title", "Note title", "BAR & KITCHEN OPEN"),
    textField("note.body", "Note body", "Get down early and get behind the team."),
    // Optional data (P5): bound from content, empty (so dropped) everywhere else.
    textField("ladder.club", "Club ladder position", ""),
    textField("ladder.opposition", "Opposition ladder position", ""),
    textField("lastMeeting", "Last meeting", ""),
    textField("milestoneWatch", "Milestone watch", ""),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    photoField("photo", "Player photo", "Player photo"),
  ],
  formats: dtFormats(build),
};
