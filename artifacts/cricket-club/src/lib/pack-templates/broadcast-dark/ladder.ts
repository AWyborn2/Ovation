import type { PackCardTemplate } from "../types";
import { SK_MONO } from "../shared";
import {
  ACC,
  DISP,
  LINE,
  MUTED,
  bdCard,
  bdChip,
  bdDisplay,
  bdEyebrow,
  bdFooterPresented,
  bdFormats,
  bdSplit,
  clubHeaderFields,
  repeatField,
  textField,
  type BdFormat,
} from "./fragments";

// A7 — Ladder. Standings table with the club's row on the accent (the
// `data-repeat-variant="club"` alternate row). Up to ten teams on the tall
// formats; landscape summarises to the top five beside the title.

const CELL = "width:7cqmin;flex:none;text-align:center;font-weight:500;color:rgba(242,245,248,.72)";
/** Points cell — also the marker the ladder row-count test keys on. */
const PTS = `width:10cqmin;flex:none;text-align:right;font-family:${DISP}`;

function row(variant: "base" | "club"): string {
  const club = variant === "club";
  const box = club
    ? `background:color-mix(in srgb, ${ACC} 18%, transparent);border:.2cqmin solid color-mix(in srgb, ${ACC} 50%, transparent)`
    : `background:rgba(255,255,255,.05);border:.2cqmin solid rgba(255,255,255,.08)`;
  return (
    `<div${club ? ' data-repeat-variant="club"' : ""} style="display:flex;align-items:center;padding:1.1cqmin 2.2cqmin;margin-top:.8cqmin;border-radius:1cqmin;${box};font-weight:700;font-size:2.9cqmin;line-height:1.2">` +
    `<span style="width:6cqmin;flex:none;font-family:${DISP};color:${club ? ACC : MUTED}">{{row.pos}}</span>` +
    `<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis${club ? `;color:${ACC}` : ""}">{{row.team}}</span>` +
    `<span style="${CELL}">{{row.played}}</span><span style="${CELL}">{{row.won}}</span><span style="${CELL}">{{row.lost}}</span>` +
    `<span style="${PTS};font-size:3.6cqmin${club ? `;color:${ACC}` : ""}">{{row.points}}</span>` +
    `</div>`
  );
}

function build(fmt: BdFormat): string {
  const head =
    bdEyebrow("{{competitionName}}") + bdDisplay("{{gradeLabel}} LADDER", 10, ";line-height:.92");
  const table =
    `<div style="display:flex;align-items:center;padding:0 2.2cqmin .6cqmin;font-family:${SK_MONO};font-weight:600;font-size:1.9cqmin;letter-spacing:.12em;color:${MUTED};border-bottom:.2cqmin solid ${LINE}">` +
    `<span style="width:6cqmin;flex:none">#</span><span style="flex:1">TEAM</span><span style="width:7cqmin;flex:none;text-align:center">P</span><span style="width:7cqmin;flex:none;text-align:center">W</span><span style="width:7cqmin;flex:none;text-align:center">L</span><span style="width:10cqmin;flex:none;text-align:right">PTS</span>` +
    `</div>` +
    `<div data-repeat="rows" data-repeat-max="${fmt === "landscape" ? 5 : 10}">${row("club")}${row("base")}</div>`;
  return bdCard({
    chip: bdChip("LADDER"),
    tag: "{{asOfLabel}}",
    body: bdSplit(fmt, head, table),
    footer: bdFooterPresented("ladder via", { offLeft: "hashtagsExtra" }),
  });
}

export const ladder: PackCardTemplate = {
  kind: "ladder",
  designKey: "ladder",
  name: "Ladder",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("competitionName", "Competition name", "retraVision PREMIER T20"),
    textField("gradeLabel", "Grade label", "A GRADE"),
    textField("asOfLabel", "As-of label", "AFTER RD 3"),
    repeatField("rows", "Ladder rows", "Up to 7 teams"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("hashtagsExtra", "Secondary hashtag", "#YOURLEAGUE"),
    textField("sponsorPresentedBy", "Ladder source", "Your Sponsor"),
  ],
  repeats: [
    {
      key: "rows",
      maxRows: 7,
      variants: ["club"],
      fields: [
        textField("pos", "Position", "1"),
        textField("team", "Team", "Your Club"),
        textField("played", "Played", "3"),
        textField("won", "Won", "3"),
        textField("lost", "Lost", "0"),
        textField("points", "Points", "12"),
      ],
    },
  ],
  formats: bdFormats(build),
};
