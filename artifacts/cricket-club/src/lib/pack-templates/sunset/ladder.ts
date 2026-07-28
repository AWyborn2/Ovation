import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  clubHeaderFields,
  repeatField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// E7 — Ladder. Standings table (≤7 rows) with the club's own row highlighted.
//
// The `rows` repeat contract is IDENTICAL to Broadcast Dark's ladder (same
// key, row fields and "club" variant): `bindInput` emits `variant: "club"` for
// the tenant's row, which selects the data-repeat-variant="club" alternate row
// template. Sunset's highlight is a warm gold glass band — a 16% accent tint
// with a 50% accent hairline, gold name and numerals — where the base rows sit
// in the pack's frosted dark glass. A pack with a different variant name would
// silently lose the highlight.
//
// The bundle ships this design as one fluid story branch; the story below is
// transcribed from it with `calc(var(--k,1.4)*…)` resolved at the story `--k`
// (10→14, 54→76, 12→17, 16→22, 14→20). The shared (portrait/square) layout is
// authored here following Broadcast Dark's ladder shared structure (eyebrow +
// headline, column header, flex:1 rows, footer row) in Sunset's language; both
// formats share the row templates — the bundle's fixed row sizes flex via the
// rows' flex:1 heights, not via `--k`, exactly like Pack A's shared rows.
//
// The bundle's story also carries a three-logo sponsor strip, but Pack A's
// ladder declares no `sponsor1..3` (teamList is the only kind with them), so
// the strip is dropped — the sponsors-on branch is a "ladder via
// {{sponsorPresentedBy}}" line (Pack A's verb for this kind) in the fragments'
// PRESENTED_BY_STORY treatment (white sponsor name over the warm wash), and
// the sponsors-off branch keeps the bundle's gold `{{hashtags}}` line (a key
// Pack A declares for this kind).
//
// The script headline is "{{gradeLabel}} Ladder" — the bundle's cursive
// "A Grade Ladder" with the grade bound in; the tenant's grade string arrives
// as entered ("A GRADE"), Kaushan Script carries the case either way.

/** Story header: the row cards' 84px logo header (see team-list.ts). */
function storyTopHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:16px">` +
    `<div style="width:84px;height:84px;border-radius:50%;overflow:hidden">${CLUB_LOGO_SLOT}</div>` +
    `<div><div style="font-weight:800;font-size:28px;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,.7)">{{clubName}}</div>` +
    `<div style="font:500 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.72);margin-top:6px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="font:700 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#F5B21A);text-align:right;text-shadow:0 2px 10px rgba(0,0,0,.85);max-width:300px">${tag}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Table pieces, transcribed from the bundle and shared by both formats
// ---------------------------------------------------------------------------

/** Column header row; only the vertical padding differs per format. */
function colHeader(padding: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;padding:${padding};font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.45)">` +
    `<span style="width:50px">#</span><span style="flex:1">TEAM</span><span style="width:52px;text-align:center">P</span><span style="width:52px;text-align:center">W</span><span style="width:52px;text-align:center">L</span><span style="width:72px;text-align:center">PTS</span>` +
    `</div>`
  );
}

// The bundle's 7 hard-coded rows collapse into a base template plus the warm
// gold data-repeat-variant="club" alternate. Rows are flex:1 in a gap:10px
// column so a shorter ladder shares the same table area. Base rows are the
// pack's glass panel (radius 20, backdrop blur) with GOLD position numerals —
// the bundle accents every position, not just the club's; the club band drops
// the blur for the 16% accent tint at radius 16, exactly as the bundle sets it.
function ladderRow(variant: "base" | "club"): string {
  if (variant === "club") {
    return (
      `<div data-repeat-variant="club" style="flex:1;min-height:0;display:flex;align-items:center;padding:0 24px;background:color-mix(in srgb, var(--gold,#FBAC27) 16%, transparent);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent);border-radius:16px;font-weight:700;font-size:25px">` +
      `<span style="width:50px;font-family:var(--disp,'Anton'),sans-serif;font-size:32px;color:var(--gold,#F5B21A)">{{row.pos}}</span>` +
      `<span style="flex:1;color:var(--gold,#F5B21A)">{{row.team}}</span>` +
      `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.played}}</span>` +
      `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.won}}</span>` +
      `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.lost}}</span>` +
      `<span style="width:72px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:34px;color:var(--gold,#F5B21A)">{{row.points}}</span></div>`
    );
  }
  return (
    `<div style="flex:1;min-height:0;display:flex;align-items:center;padding:0 24px;background:rgba(10,12,16,.62);border:1px solid rgba(255,255,255,.14);border-radius:20px;backdrop-filter:blur(9px);font-weight:700;font-size:25px">` +
    `<span style="width:50px;font-family:var(--disp,'Anton'),sans-serif;font-size:32px;color:var(--gold,#F5B21A)">{{row.pos}}</span>` +
    `<span style="flex:1;color:#fff">{{row.team}}</span>` +
    `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.played}}</span>` +
    `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.won}}</span>` +
    `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.lost}}</span>` +
    `<span style="width:72px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:34px;color:#fff">{{row.points}}</span></div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// Footer lines carry the row cards' 20px top margin themselves — the sponsors
// wrappers are display:contents (see team-list.ts).
const storyLadderVia = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55);text-shadow:0 2px 10px rgba(0,0,0,.8);margin-top:20px">ladder via <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;

const storyHashtagFooter = `<div style="flex:none;text-align:center;font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);margin-top:20px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{hashtags}}</div>`;

// `competitionName` has no slot in the bundle's story (the script headline is
// "{{gradeLabel}} Ladder"); it renders in the shared eyebrow, as in Packs C/D.
// The bundle's nested rows wrapper flattens into the single data-repeat
// container; its calc margin resolves to 22px.
const storyHtml = storyColumnRoot(
  storyTopHeader("{{asOfLabel}}") +
    `<div style="flex:none;margin-top:14px">` +
    scriptText("{{gradeLabel}} Ladder", 76) +
    `</div>` +
    colHeader("17px 24px 8px") +
    `<div data-repeat="rows" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;margin-top:22px">${ladderRow("club")}${ladderRow("base")}</div>` +
    sponsorsOn(storyLadderVia) +
    sponsorsOff(storyHashtagFooter),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch. Structure follows Broadcast Dark's ladder shared layout,
// dressed in Sunset: warm gold club band, frosted glass base rows, script
// headline, mono footer.
// ---------------------------------------------------------------------------

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
    // later declaration wins; scriptText's fixed px is story-oriented).
    scriptText("{{gradeLabel}} Ladder", 54, ";font-size:calc(var(--k,1.4)*54px);margin-top:10px") +
    `</div>` +
    colHeader("calc(var(--k,1.4)*12px) 24px 8px") +
    `<div data-repeat="rows" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:10px">${ladderRow("club")}${ladderRow("base")}</div>` +
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
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
