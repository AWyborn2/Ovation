import type { PackCardTemplate } from "../types";
import { logoField, photoField, repeatField, textField } from "../shared";
import {
  C,
  baseEyebrow,
  dtCard,
  dtFormats,
  face,
  sheetMeta,
  sponsorStrip,
  u,
  wrapHeadline,
  type DtFormat,
} from "./parts";

// Team List: the grade as the headline (it may take two lines, never cut
// off), the round above it, the duotone squad photo behind; the sheet carries
// the match line and the side in batting order. Two columns on square and
// landscape, one on portrait and story. Designed for 12; a side of 13 or 14
// (ADR-009) compresses: row height and type scale by `--xi-scale` (12 / n).

/** A row length scaled by the list's compression (unset, so 1, at 12 or fewer). */
const xs = (f: DtFormat, n: number) => `calc(${u(f, n)} * var(--xi-scale,1))`;

const twoColumns = (f: DtFormat) => f === "square" || f === "landscape";

function row(f: DtFormat): string {
  const size = twoColumns(f) ? 2.6 : 2.9;
  return (
    `<div data-xi-row="1" style="display:flex;align-items:baseline;gap:${u(f, 1.2)};min-width:0;padding:${xs(f, 0.55)} 0;border-bottom:${u(f, 0.15)} solid ${C.line}">` +
    `<span style="flex:none;width:${u(f, 4.4)};${face(112, 900)};font-size:${xs(f, size)};color:${C.pLight}">{{row.number}}</span>` +
    `<span data-xi-name="1" style="flex:1 1 auto;min-width:0;${face(100, 700)};font-size:${xs(f, size)};line-height:1.15;overflow-wrap:anywhere">{{row.broadcastName}}</span>` +
    `<span data-xi-role="1" style="flex:none;white-space:nowrap;${face(100, 800)};font-size:${xs(f, size * 0.78)};color:${C.pLight}">({{row.role}})</span>` +
    `<span data-badge="1" data-xi-os="1" style="flex:none;white-space:nowrap;${face(100, 800)};font-size:${xs(f, size * 0.78)};letter-spacing:.06em;color:${C.label}">{{row.os}}</span>` +
    `</div>`
  );
}

function build(f: DtFormat): string {
  const two = twoColumns(f);
  const list =
    `<div data-repeat="players" data-repeat-max="14" data-repeat-compress="12" style="display:grid;${two ? "grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(var(--xi-rows,6),auto);grid-auto-flow:column;column-gap:" + u(f, 3.2) : "grid-template-columns:minmax(0,1fr)"};width:100%;min-width:0;margin-top:${u(f, 1.6)}">` +
    row(f) +
    `</div>`;
  const sheet =
    sheetMeta(f, "{{gradeRound}}", `;${face(100, 700)};color:${C.ink}`) +
    sheetMeta(f, "{{venueDateTime}}", `;margin-top:${u(f, 0.4)}`) +
    list +
    `<div style="flex:1 1 0;min-height:0"></div>` +
    sponsorStrip(f, "Supported by", `;margin-top:${u(f, 1.6)}`);
  const head =
    baseEyebrow(f, "{{broadcastRoundLabel}}", ";margin-bottom:1cqmin") +
    wrapHeadline(
      f,
      "{{gradeHeading}}",
      f === "story" ? 11 : f === "landscape" ? 10 : 8.4,
      'data-team-grade="1"',
    );
  return dtCard({
    f,
    photo: "squadPhoto",
    head,
    sheet,
    fill: f !== "story",
    landWidth: 58,
  });
}

export const teamList: PackCardTemplate = {
  kind: "teamList",
  designKey: "team-list",
  name: "Team List",
  sponsorVariants: ["on"],
  fields: [
    textField("gradeRound", "Grade + round", "A GRADE · RD 3"),
    textField("gradeHeading", "Team grade heading", "TEAM LIST"),
    textField("broadcastRoundLabel", "Round label (explicit round only)", "ROUND 3"),
    textField("venueDateTime", "Venue / date / time", "RUSHTON PARK · SAT 8 NOV · 12:30 PM"),
    photoField("squadPhoto", "Squad photo", "Squad / team photo"),
    repeatField("players", "Player rows", "Up to 14 players"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
  ],
  repeats: [
    {
      key: "players",
      maxRows: 14,
      fields: [
        textField("number", "Order", "3"),
        textField("broadcastName", "Initial + surname", "R. MANUEL"),
        textField("role", "Role (C/WK)", "C"),
        textField("os", "Overseas (OS)", ""),
      ],
    },
  ],
  formats: dtFormats(build),
};
