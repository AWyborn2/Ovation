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

// The Broadcast Dark list is an ordered, single-column lineup. Shirt/order
// numbering and captain / keeper markers remain independent bound fields.

const fullRow =
  `<div data-xi-row="1" style="display:flex;align-items:baseline;gap:1.2cqmin;padding:.55cqmin 0;border-bottom:.2cqmin solid ${LINE};min-width:0">` +
  `<span style="font-family:${SK_COND};font-weight:800;font-size:var(--xi-number-size,2.9cqmin);width:4.2cqmin;flex:none;color:${ACC}">{{row.number}}</span>` +
  `<span data-xi-name="1" style="flex:1 1 auto;font-weight:600;font-size:var(--xi-name-size,2.8cqmin);line-height:1.15;white-space:normal;overflow-wrap:anywhere;min-width:0">{{row.broadcastName}}</span>` +
  `<span data-xi-role="1" style="font-family:${SK_COND};font-weight:700;font-size:var(--xi-role-size,2.2cqmin);flex:none;white-space:nowrap;margin-left:.3cqmin;color:${ACC}">({{row.role}})</span>` +
  `</div>`;

const landscapeRow =
  `<div data-xi-row="1" style="display:flex;align-items:baseline;gap:.9cqmin;padding:.34cqmin 0;border-bottom:.18cqmin solid ${LINE};min-width:0">` +
  `<span style="font-family:${SK_COND};font-weight:800;font-size:var(--xi-number-size,2.35cqmin);width:4cqmin;flex:none;color:${ACC}">{{row.number}}</span>` +
  `<span data-xi-name="1" style="flex:1 1 auto;font-weight:600;font-size:var(--xi-name-size,2.25cqmin);line-height:1.1;white-space:normal;overflow-wrap:anywhere;min-width:0">{{row.broadcastName}}</span>` +
  `<span data-xi-role="1" style="font-family:${SK_COND};font-weight:700;font-size:var(--xi-role-size,1.8cqmin);flex:none;white-space:nowrap;margin-left:.2cqmin;color:${ACC}">({{row.role}})</span>` +
  `</div>`;

function card(fmt: "full" | "landscape"): string {
  const landscape = fmt === "landscape";
  const row = landscape ? landscapeRow : fullRow;
  const headingSize = landscape ? 9.2 : 12.5;
  const headingHeight = landscape ? 9.5 : 13;
  const maxColumn = landscape ? 68 : 66;
  const listTop = landscape ? 1.3 : 2.1;

  return bdCard({
    chip: bdChip("TEAM LIST{{setMarker}}"),
    tag: "{{gradeRound}}",
    photo: "squadPhoto",
    topAligned: true,
    body: bdColumn(
      bdEyebrow("{{broadcastRoundLabel}}", ACC, ";margin-bottom:.6cqmin") +
        bdDisplay(
          "{{gradeHeading}}",
          headingSize,
          `;line-height:.92;width:100%;height:${headingHeight}cqmin;overflow-wrap:anywhere;margin-top:0`,
        ).replace("<div ", '<div data-team-grade="1" ') +
        `<div style="font-family:${SK_MONO};font-weight:500;font-size:${landscape ? "1.8" : "2.2"}cqmin;line-height:1.3;letter-spacing:.1em;color:${MUTED};margin-top:${landscape ? "1" : "1.4"}cqmin">{{venueDateTime}}</div>` +
        `<div data-repeat="players" data-xi-fit="1" data-xi-layout="single-column" data-xi-min-ratio="0.5625" data-repeat-max="12" style="display:flex;flex-direction:column;gap:${landscape ? ".5" : ".8"}cqmin;width:100%;max-width:${maxColumn}cqmin;margin-top:${listTop}cqmin;min-width:0">${row}</div>`,
    ),
    footer: bdFooterLogos(),
  });
}

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
    textField("broadcastRoundLabel", "Round label", "ROUND 3"),
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
        textField("broadcastName", "Player name", "J. MANUEL"),
        textField("role", "Role (C/WK)", "C"),
      ],
    },
  ],
  formats: bdFormats(card),
};
