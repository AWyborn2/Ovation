import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  clubHeaderFields,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// C7 — Ladder. Standings table (≤7 rows) with the club's own row highlighted.
//
// The `rows` repeat contract is IDENTICAL to Broadcast Dark's ladder (same
// key, row fields and "club" variant): `bindInput` emits `variant: "club"` for
// the tenant's row, which selects the data-repeat-variant="club" alternate row
// template. Bold Type's highlight is the pack's boldest: a SOLID gold band —
// full-bleed `var(--gold)` fill, accent-ink type, bleeding 16px past the table
// edge — not the translucent gold-gradient shell of Packs A/B. A pack with a
// different variant name would silently lose the highlight.
//
// The bundle ships this design as one fluid story branch; the story below is
// transcribed from it with `calc(var(--k,1.4)*…)` resolved at the story `--k`
// (94→132, 16→22, 14→20, 22→31). The shared (portrait/square) layout is
// authored here following Broadcast Dark's ladder shared structure (eyebrow +
// headline, column header, flex:1 rows, footer row) in Bold Type's language;
// both formats share one row template — the bundle's fixed row sizes flex via
// the rows' flex:1 heights, not via `--k`, exactly like Pack A's shared rows.
//
// The bundle's story also carries a three-logo sponsor strip, but Pack A's
// ladder declares no `sponsor1..3` (teamList is the only kind with them), so
// the strip is dropped — the sponsors-on branch is the gold bar's
// "ladder via {{sponsorPresentedBy}}" credit (Pack A's verb for this kind),
// swapping to `{{clubHashtag}}` when sponsors are off.
//
// Broadcast Dark also declares a `hashtags` field for this kind; this design's
// hashtag footers use `clubHashtag` (story) and `hashtagsExtra` (shared), so
// `hashtags` is deliberately not declared — a subset is allowed, an unused
// declaration is not.

/** Story background: the bundle row-cards' sheened flat block (see team-list.ts). */
const SHEEN_BG = `<div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,.05), transparent 24%), var(--block,#0E1C31)"></div>`;

/** Story root with the bundle row-cards' `60px 70px 54px` padding (see team-list.ts). */
function storyRoot(inner: string): string {
  return columnRoot(SHEEN_BG, inner, "60px 70px 54px");
}

/** Story header: small logo + gold mono left, dim mono right (see team-list.ts). */
function storyTopHeader(left: string, right: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:60px;height:60px;flex:none">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A)">${left}</div></div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);text-align:right">${right}</div>` +
    `</div>`
  );
}

/** Local gold footer bar pairing with this root's 70/54 padding (see team-list.ts). */
function goldBar(right: string): string {
  return (
    `<div style="background:var(--gold,#F5B21A);margin:0 -70px -54px;padding:30px 70px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
    `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>${right}</div>`
  );
}

// ---------------------------------------------------------------------------
// Table pieces, transcribed from the bundle and shared by both formats
// ---------------------------------------------------------------------------

/** Column header row; only the vertical padding differs per format. */
function colHeader(padding: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;padding:${padding};font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.4)">` +
    `<span style="width:54px">#</span><span style="flex:1">TEAM</span><span style="width:54px;text-align:center">P</span><span style="width:54px;text-align:center">W</span><span style="width:54px;text-align:center">L</span><span style="width:76px;text-align:center">PTS</span>` +
    `</div>`
  );
}

// The bundle's 7 hard-coded rows collapse into a base template plus the solid
// gold data-repeat-variant="club" alternate. Rows are flex:1 in a
// justify-content:space-between column so a shorter ladder shares the same
// table area. The club band's mono/display cells inherit the accent's ink; the
// base rows stay white with 2px hairlines and gold display positions.
function ladderRow(variant: "base" | "club"): string {
  if (variant === "club") {
    return (
      `<div data-repeat-variant="club" style="flex:1;min-height:0;display:flex;align-items:center;background:var(--gold,#F5B21A);color:var(--accent-ink,#1c1405);margin:0 -16px;padding:0 16px;border-radius:2px;font-weight:800;font-size:26px">` +
      `<span style="width:54px;font-family:var(--disp,'Anton'),sans-serif;font-size:34px">{{row.pos}}</span>` +
      `<span style="flex:1">{{row.team}}</span>` +
      `<span style="width:54px;text-align:center;font:500 20px/1 ui-monospace,Menlo,monospace">{{row.played}}</span>` +
      `<span style="width:54px;text-align:center;font:500 20px/1 ui-monospace,Menlo,monospace">{{row.won}}</span>` +
      `<span style="width:54px;text-align:center;font:500 20px/1 ui-monospace,Menlo,monospace">{{row.lost}}</span>` +
      `<span style="width:76px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:36px">{{row.points}}</span></div>`
    );
  }
  return (
    `<div style="flex:1;min-height:0;display:flex;align-items:center;color:#fff;border-bottom:2px solid rgba(255,255,255,.1);font-weight:800;font-size:26px">` +
    `<span style="width:54px;font-family:var(--disp,'Anton'),sans-serif;font-size:34px;color:var(--gold,#F5B21A)">{{row.pos}}</span>` +
    `<span style="flex:1">{{row.team}}</span>` +
    `<span style="width:54px;text-align:center;font:500 20px/1 ui-monospace,Menlo,monospace">{{row.played}}</span>` +
    `<span style="width:54px;text-align:center;font:500 20px/1 ui-monospace,Menlo,monospace">{{row.won}}</span>` +
    `<span style="width:54px;text-align:center;font:500 20px/1 ui-monospace,Menlo,monospace">{{row.lost}}</span>` +
    `<span style="width:76px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:36px">{{row.points}}</span></div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// The bundle keeps the grade in the header ("{{gradeLabel}} LADDER" as the
// tracked mono line) and sets the headline as the bare word — unlike Pack A,
// whose story headline is "{{gradeLabel}} LADDER". `competitionName` has no
// slot in the bundle's story; it renders in the shared layout's eyebrow.
const storyHtml = storyRoot(
  storyTopHeader("{{gradeLabel}} LADDER", "{{asOfLabel}}") +
    `<div style="flex:none;padding-top:20px"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:132px;line-height:.82;text-transform:uppercase;color:#fff">LADDER</div></div>` +
    colHeader("22px 0 10px") +
    `<div data-repeat="rows" style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between">${ladderRow("club")}${ladderRow("base")}</div>` +
    `<div style="flex:none;margin-top:31px">` +
    goldBar(
      sponsorsOn(
        `<span style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.82">ladder via {{sponsorPresentedBy}}</span>`,
      ) +
        sponsorsOff(
          `<span style="font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em">{{clubHashtag}}</span>`,
        ),
    ) +
    `</div>`,
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch. Structure follows Broadcast Dark's ladder shared layout,
// dressed in Bold Type: solid gold club band, 2px hairlines, mono footer.
// ---------------------------------------------------------------------------

/** Shared footer row: club hashtag left; ladder source / secondary hashtag right. */
const sharedFooter =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font:700 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font:500 20px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.5)">ladder via <span style="color:var(--gold,#FBAC27);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("LADDER", "{{asOfLabel}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{competitionName}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*94px);line-height:.82;text-transform:uppercase;margin-top:12px">{{gradeLabel}} <span style="color:var(--gold,#FBAC27)">LADDER</span></div>` +
    `</div>` +
    colHeader("calc(var(--k,1.4)*14px) 0 12px") +
    `<div data-repeat="rows" style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between">${ladderRow("club")}${ladderRow("base")}</div>` +
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
