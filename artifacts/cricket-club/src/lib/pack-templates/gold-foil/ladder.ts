import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  FOIL_RAMP,
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  STORY_BG,
  clubHeaderFields,
  foilText,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// B7 — Ladder. Standings table (≤7 rows) with the club's own row highlighted.
//
// The `rows` repeat contract is IDENTICAL to Broadcast Dark's ladder (same key,
// row fields and "club" variant): `bindInput` emits `variant: "club"` for the
// tenant's row, which selects the data-repeat-variant="club" alternate row
// template — the bundle styles that row with the gold gradient + foil numerals.
// A pack with a different variant name would silently lose the highlight.
//
// The bundle ships this design story-only; the story below is transcribed from
// it, the shared (portrait/square) layout is authored here following Broadcast
// Dark's ladder shared structure in Gold Foil's visual language.
//
// Broadcast Dark also declares a `hashtags` field for this kind; this design's
// hashtag footers use `clubHashtag` (story) and `hashtagsExtra` (shared), so
// `hashtags` is deliberately not declared — a subset is allowed, an unused
// declaration is not.

/** Static foil ramp for position / points numerals (see team-list.ts). */
const FOIL_SPAN =
  `font-family:var(--disp,'Anton'),sans-serif;` +
  `background:${FOIL_RAMP};` +
  `-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;` +
  `filter:drop-shadow(0 3px 12px rgba(0,0,0,.55))`;

/** Story root with the bundle's `60px 70px 54px` padding (see team-list.ts). */
function storyRoot(inner: string): string {
  return columnRoot(STORY_BG, inner, "60px 70px 54px");
}

/** Story header: logo over tracked-caps club name + gold-ruled tag line. */
function storyTopHeader(tag: string): string {
  return (
    `<div style="flex:none;text-align:center">` +
    `<div style="width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font:600 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;color:rgba(255,255,255,.6)">{{clubName}}</div>` +
    `<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-top:15px">` +
    `<span style="width:90px;height:1px;background:linear-gradient(90deg,transparent,var(--gold,#F5B21A))"></span>` +
    `<span style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#F5B21A)">${tag}</span>` +
    `<span style="width:90px;height:1px;background:linear-gradient(90deg,var(--gold,#F5B21A),transparent)"></span>` +
    `</div></div>`
  );
}

/** "ladder via <source>" line — same verb as Broadcast Dark's ladder footer. */
function ladderVia(gold: string): string {
  return `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">ladder via <span style="color:var(--gold,${gold});font-weight:700">{{sponsorPresentedBy}}</span></div>`;
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// The bundle's 7 hard-coded rows collapse into a base template plus the gold
// data-repeat-variant="club" alternate. Rows are flex:1 in a gap:9px column so
// a shorter ladder shares the same table area.
function storyRow(variant: "base" | "club"): string {
  if (variant === "club") {
    return (
      `<div data-repeat-variant="club" style="flex:1;min-height:0;display:flex;align-items:center;padding:0 26px;border-radius:12px;background:linear-gradient(90deg,color-mix(in srgb, var(--gold,#F5B21A) 18%, transparent),color-mix(in srgb, var(--gold,#F5B21A) 5%, transparent));border:1px solid color-mix(in srgb, var(--gold,#F5B21A) 40%, transparent);font-weight:700;font-size:27px">` +
      `<span style="width:52px;${FOIL_SPAN}">{{row.pos}}</span>` +
      `<span style="flex:1;color:var(--gold,#F5B21A)">{{row.team}}</span>` +
      `<span style="width:56px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.played}}</span>` +
      `<span style="width:56px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.won}}</span>` +
      `<span style="width:56px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.lost}}</span>` +
      `<span style="width:78px;text-align:center;${FOIL_SPAN};font-size:34px">{{row.points}}</span></div>`
    );
  }
  return (
    `<div style="flex:1;min-height:0;display:flex;align-items:center;padding:0 26px;border-radius:12px;background:rgba(255,255,255,.04);font-weight:700;font-size:27px">` +
    `<span style="width:52px;font-family:var(--disp,'Anton'),sans-serif;color:rgba(255,255,255,.55)">{{row.pos}}</span>` +
    `<span style="flex:1;color:#fff">{{row.team}}</span>` +
    `<span style="width:56px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.played}}</span>` +
    `<span style="width:56px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.won}}</span>` +
    `<span style="width:56px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.lost}}</span>` +
    `<span style="width:78px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:34px;color:#fff">{{row.points}}</span></div>`
  );
}

const storyHtml = storyRoot(
  storyTopHeader("{{asOfLabel}}") +
    `<div style="flex:none;text-align:center;margin-top:11px">${foilText("{{gradeLabel}} LADDER", 112)}</div>` +
    `<div style="flex:none;display:flex;align-items:center;padding:20px 26px 10px;font:600 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.45)">` +
    `<span style="width:52px">#</span><span style="flex:1">TEAM</span><span style="width:56px;text-align:center">P</span><span style="width:56px;text-align:center">W</span><span style="width:56px;text-align:center">L</span><span style="width:78px;text-align:center">PTS</span>` +
    `</div>` +
    `<div data-repeat="rows" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:9px;margin-bottom:20px">${storyRow("club")}${storyRow("base")}</div>` +
    sponsorsOn(ladderVia("#F5B21A")) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch. Structure follows Broadcast Dark's ladder shared layout
// (eyebrow + headline, column header, flex:1 rows, footer row), dressed in
// Gold Foil: foil pos/points on the club row, gold gradient highlight.
// ---------------------------------------------------------------------------

function sharedRow(variant: "base" | "club"): string {
  if (variant === "club") {
    return (
      `<div data-repeat-variant="club" style="flex:1;min-height:0;display:flex;align-items:center;padding:0 26px;border-radius:12px;background:linear-gradient(90deg,color-mix(in srgb, var(--gold,#FBAC27) 18%, transparent),color-mix(in srgb, var(--gold,#FBAC27) 5%, transparent));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent);font-weight:700;font-size:28px">` +
      `<span style="width:52px;${FOIL_SPAN}">{{row.pos}}</span>` +
      `<span style="flex:1;color:var(--gold,#FBAC27)">{{row.team}}</span>` +
      `<span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.played}}</span>` +
      `<span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.won}}</span>` +
      `<span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.lost}}</span>` +
      `<span style="width:80px;text-align:center;${FOIL_SPAN};font-size:36px">{{row.points}}</span></div>`
    );
  }
  return (
    `<div style="flex:1;min-height:0;display:flex;align-items:center;padding:0 26px;border-radius:12px;background:rgba(255,255,255,.04);font-weight:700;font-size:28px">` +
    `<span style="width:52px;font-family:var(--disp,'Anton'),sans-serif;color:rgba(255,255,255,.55)">{{row.pos}}</span>` +
    `<span style="flex:1">{{row.team}}</span>` +
    `<span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.played}}</span>` +
    `<span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.won}}</span>` +
    `<span style="width:58px;text-align:center;font-weight:500;color:rgba(255,255,255,.7)">{{row.lost}}</span>` +
    `<span style="width:80px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:36px">{{row.points}}</span></div>`
  );
}

/** Shared footer row: club hashtag left; ladder source / secondary hashtag right. */
const sharedFooter =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">ladder via <span style="color:var(--gold,#FBAC27);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("LADDER", "{{asOfLabel}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{competitionName}}</div>` +
    // extraStyle re-declares font-size so the headline flexes with --k (the
    // later declaration wins; foilText's fixed px is story-oriented).
    foilText("{{gradeLabel}} LADDER", 96, ";font-size:calc(var(--k,1.4)*96px);margin-top:10px") +
    `</div>` +
    `<div style="flex:none;display:flex;align-items:center;padding:calc(var(--k,1.4)*14px) 26px 12px;font:600 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.45)">` +
    `<span style="width:52px">#</span><span style="flex:1">TEAM</span><span style="width:58px;text-align:center">P</span><span style="width:58px;text-align:center">W</span><span style="width:58px;text-align:center">L</span><span style="width:80px;text-align:center">PTS</span>` +
    `</div>` +
    `<div data-repeat="rows" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:9px">${sharedRow("club")}${sharedRow("base")}</div>` +
    sharedFooter,
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
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
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
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
