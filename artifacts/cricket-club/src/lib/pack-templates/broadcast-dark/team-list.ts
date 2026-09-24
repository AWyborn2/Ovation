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
  `<div style="display:flex;align-items:baseline;gap:1.8cqmin;padding:1.1cqmin 0;border-bottom:.2cqmin solid ${LINE};min-width:0">` +
  `<span style="font-family:${SK_COND};font-weight:800;font-size:3.4cqmin;width:4cqmin;flex:none;color:${ACC}">{{row.number}}</span>` +
  `<span style="font-weight:600;font-size:3.2cqmin;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">{{row.surname}}</span>` +
  `<span style="font-family:${SK_COND};font-weight:700;font-size:2.4cqmin;flex:none;color:${ACC}">({{row.role}})</span>` +
  `</div>`;

const html = bdCard({
  chip: bdChip("TEAM LIST"),
  tag: "{{gradeRound}}",
  photo: "squadPhoto",
  body: bdColumn(
    bdEyebrow("{{competitionLine}}") +
      bdDisplay("THE XI", 14) +
      `<div style="font-family:${SK_MONO};font-weight:500;font-size:2.2cqmin;letter-spacing:.14em;color:${MUTED};margin-top:1.6cqmin">{{venueDateTime}}</div>` +
      `<div data-repeat="players" data-repeat-max="12" style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(6,auto);grid-auto-flow:column;column-gap:5cqmin;width:100%;max-width:92cqmin;margin-top:3cqmin">${row}</div>`,
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
    textField("gradeRound", "Grade + round", "A GRADE · RD 3"),
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
