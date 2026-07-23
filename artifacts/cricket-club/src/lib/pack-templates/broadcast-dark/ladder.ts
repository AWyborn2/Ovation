import type { PackCardTemplate } from "../types";
import {
  bgLayers,
  clubHeaderFields,
  footerRowShared,
  footerRowStory,
  formatRoot,
  goldChip,
  hashtagFooterStory,
  headerTag,
  presentedBy,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A7 — Ladder. Standings table (≤7 rows) with the club's row highlighted.
// The highlighted row ships as a data-repeat-variant="club" alternate row
// template (the bundle styles the Halls Head row with the gold gradient).

function storyRow(variant: "base" | "club"): string {
  if (variant === "club") {
    return (
      `<div data-repeat-variant="club" style="display:flex;align-items:center;padding:19px 26px;border-radius:12px;background:linear-gradient(90deg,color-mix(in srgb, var(--gold,#FBAC27) 18%, transparent),color-mix(in srgb, var(--gold,#FBAC27) 5%, transparent));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent);margin-bottom:10px;font-weight:700;font-size:30px">` +
      `<span style="width:56px;font-family:var(--disp,'Anton',sans-serif);color:var(--gold,#F5B21A)">{{row.pos}}</span><span style="flex:1;color:var(--gold,#F5B21A)">{{row.team}}</span><span style="width:66px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.played}}</span><span style="width:66px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.won}}</span><span style="width:66px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.lost}}</span><span style="width:92px;text-align:center;font-family:var(--disp,'Anton',sans-serif);font-size:38px;color:var(--gold,#F5B21A)">{{row.points}}</span></div>`
    );
  }
  return (
    `<div style="display:flex;align-items:center;padding:19px 26px;border-radius:12px;background:rgba(255,255,255,.04);margin-bottom:10px;font-weight:700;font-size:30px">` +
    `<span style="width:56px;font-family:var(--disp,'Anton',sans-serif);color:rgba(255,255,255,.55)">{{row.pos}}</span><span style="flex:1">{{row.team}}</span><span style="width:66px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.played}}</span><span style="width:66px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.won}}</span><span style="width:66px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.lost}}</span><span style="width:92px;text-align:center;font-family:var(--disp,'Anton',sans-serif);font-size:38px">{{row.points}}</span></div>`
  );
}

function sharedRow(variant: "base" | "club"): string {
  if (variant === "club") {
    return (
      `<div data-repeat-variant="club" style="flex:1;display:flex;align-items:center;padding:0 26px;border-radius:12px;background:linear-gradient(90deg,color-mix(in srgb, var(--gold,#FBAC27) 18%, transparent),color-mix(in srgb, var(--gold,#FBAC27) 5%, transparent));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent);font-weight:700;font-size:28px">` +
      `<span style="width:52px;font-family:var(--disp,'Anton'),sans-serif;color:var(--gold,#FBAC27)">{{row.pos}}</span><span style="flex:1;color:var(--gold,#FBAC27)">{{row.team}}</span><span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.played}}</span><span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.won}}</span><span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.lost}}</span><span style="width:80px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:36px;color:var(--gold,#FBAC27)">{{row.points}}</span></div>`
    );
  }
  return (
    `<div style="flex:1;display:flex;align-items:center;padding:0 26px;border-radius:12px;background:rgba(255,255,255,.04);font-weight:700;font-size:28px">` +
    `<span style="width:52px;font-family:var(--disp,'Anton'),sans-serif;color:rgba(255,255,255,.55)">{{row.pos}}</span><span style="flex:1">{{row.team}}</span><span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.played}}</span><span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.won}}</span><span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.lost}}</span><span style="width:80px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:36px">{{row.points}}</span></div>`
  );
}

const storyHtml = formatRoot(
  bgLayers() +
    storyHeader(goldChip("LADDER", "story") + headerTag("{{asOfLabel}}")) +
    `<div style="position:absolute;top:236px;left:70px;right:70px">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#F5B21A)">{{competitionName}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:150px;line-height:.94;text-transform:uppercase;margin-top:12px">{{gradeLabel}} LADDER</div>` +
    `</div>` +
    `<div style="position:absolute;top:640px;left:70px;right:70px">` +
    `<div style="display:flex;align-items:center;padding:0 26px 14px;font:600 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.45)">` +
    `<span style="width:56px">#</span><span style="flex:1">TEAM</span><span style="width:66px;text-align:center">P</span><span style="width:66px;text-align:center">W</span><span style="width:66px;text-align:center">L</span><span style="width:92px;text-align:center">PTS</span>` +
    `</div>` +
    `<div data-repeat="rows">${storyRow("club")}${storyRow("base")}</div>` +
    `</div>` +
    sponsorsOn(footerRowStory(56, presentedBy("ladder via"))) +
    hashtagFooterStory(60),
);

const sharedHtml = sharedColumnRoot(
  bgLayers(),
  sharedHeader(goldChip("LADDER", "shared") + headerTag("{{asOfLabel}}")) +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)"><div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{competitionName}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*96px);line-height:.94;text-transform:uppercase;margin-top:10px">{{gradeLabel}} LADDER</div></div>` +
    `<div style="flex:none;display:flex;align-items:center;padding:calc(var(--k,1.4)*14px) 26px 12px;font:600 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.45)"><span style="width:52px">#</span><span style="flex:1">TEAM</span><span style="width:58px;text-align:center">P</span><span style="width:58px;text-align:center">W</span><span style="width:58px;text-align:center">L</span><span style="width:80px;text-align:center">PTS</span></div>` +
    `<div data-repeat="rows" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:9px">${sharedRow("club")}${sharedRow("base")}</div>` +
    footerRowShared(
      sponsorsOn(presentedBy("ladder via")) +
        sponsorsOff(
          `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
        ),
      ";margin-top:calc(var(--k,1.4)*16px)",
    ),
);

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
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("hashtags", "Hashtag footer", "#HALLSHEAD · #PEELPREMIERLEAGUE"),
    textField("hashtagsExtra", "Secondary hashtag", "#PEELPREMIERLEAGUE"),
    textField("sponsorPresentedBy", "Ladder source", "PlayHQ"),
  ],
  repeats: [
    {
      key: "rows",
      maxRows: 7,
      variants: ["club"],
      fields: [
        textField("pos", "Position", "1"),
        textField("team", "Team", "Halls Head"),
        textField("played", "Played", "3"),
        textField("won", "Won", "3"),
        textField("lost", "Lost", "0"),
        textField("points", "Points", "12"),
      ],
    },
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
