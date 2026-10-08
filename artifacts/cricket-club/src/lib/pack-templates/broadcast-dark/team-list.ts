import type { PackCardTemplate } from "../types";
import { SK_COND, SK_MONO } from "../shared";
import {
  ACC,
  LINE,
  MUTED,
  bdCard,
  bdChip,
  bdColumn,
  bdDisplay,
  bdEyebrow,
  bdFooterLogos,
  bdFormats,
  clubHeaderFields,
  logoField,
  photoField,
  repeatField,
  textField,
} from "./fragments";

// A4 — Team List. The handoff's "The XI": the side in two columns (1–6 down
// the left, 7–12 down the right) so twelve names fit every format including
// landscape; squad photo right. The role suffix "(C)"/"(WK)" renders only when
// the row has one — `cleanupEmptyRoles` drops an empty "()" span.

const row =
  `<div data-xi-row="1" style="display:flex;align-items:baseline;gap:1.8cqmin;padding:1.1cqmin 0;border-bottom:.2cqmin solid ${LINE};min-width:0">` +
  `<span style="font-family:${SK_COND};font-weight:800;font-size:3.4cqmin;width:4cqmin;flex:none;color:${ACC}">{{row.number}}</span>` +
  `<span data-xi-name="1" style="flex:1;font-weight:600;font-size:var(--xi-name-size,3.2cqmin);line-height:1.2;white-space:pre;min-width:0">{{row.surname}}</span>` +
  `<span data-xi-role="1" style="font-family:${SK_COND};font-weight:700;font-size:2.4cqmin;flex:none;white-space:nowrap;margin-left:-1.2cqmin;color:${ACC}">({{row.role}})</span>` +
  `</div>`;

const html = bdCard({
  chip: bdChip("TEAM LIST{{setMarker}}"),
  tag: "{{gradeRound}}",
  photo: "squadPhoto",
  body: bdColumn(
    bdEyebrow("{{competitionLine}}") +
      bdDisplay("{{gradeHeading}}", 14, ";line-height:.95;width:100%;height:14cqmin;overflow-wrap:anywhere").replace("<div ", '<div data-team-grade="1" ') +
      `<div style="font-family:${SK_MONO};font-weight:500;font-size:2.2cqmin;letter-spacing:.14em;color:${MUTED};margin-top:1.6cqmin">{{venueDateTime}}</div>` +
      `<div data-repeat="players" data-xi-fit="1" data-xi-min-ratio="0.5625" data-repeat-max="12" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(6,auto);grid-auto-flow:column;column-gap:5cqmin;width:100%;max-width:92cqmin;margin-top:3cqmin">${row}</div>`,
  ),
  footer: bdFooterLogos(),
});

export const teamList: PackCardTemplate = {
  kind: "teamList",
  designKey: "team-list",
  name: "Team List",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("setMarker", 'Set page marker (e.g. " · 2/3")', ""),
    textField("gradeRound", "Grade + round", "A GRADE · RD 3"),
    textField("gradeHeading", "Team grade heading", "TEAM LIST"),
    textField("competitionLine", "Competition line", "PREMIER T20 · ROUND 3 · vs MARINERS"),
    textField("venueDateTime", "Venue / date / time", "RUSHTON PARK · SAT 8 NOV · 12:30 PM"),
    photoField("squadPhoto", "Squad photo", "Squad / team photo"),
    repeatField("players", "Player rows", "Up to 12 players"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  repeats: [
    {
      key: "players",
      maxRows: 12,
      fields: [
        textField("number", "Order", "3"),
        textField("surname", "Surname", "MANUEL"),
        textField("role", "Role (C/WK)", "C"),
      ],
    },
  ],
  formats: bdFormats(() => html),
};
