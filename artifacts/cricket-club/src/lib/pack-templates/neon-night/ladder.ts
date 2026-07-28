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

// D7 — Ladder. Standings table (≤7 rows) with the club's own row highlighted.
//
// The `rows` repeat contract is IDENTICAL to Broadcast Dark's ladder (same
// key, row fields and "club" variant): `bindInput` emits `variant: "club"` for
// the tenant's row, which selects the data-repeat-variant="club" alternate row
// template. Neon Night's highlight is the pack's glow treatment: a glass panel
// tinted with the tenant accent, an accent hairline ring and a soft accent
// bloom (`box-shadow:0 0 50px -12px`) — where the base rows sit flat with cyan
// position numerals. A pack with a different variant name would silently lose
// the highlight.
//
// The bundle ships this design as one fluid story branch; the story below is
// transcribed from it with `calc(var(--k,1.4)*…)` resolved at the story `--k`
// (78→109, 14→20, 8→11, 16→22). The shared (portrait/square) layout is
// authored here following Broadcast Dark's ladder shared structure (eyebrow +
// headline, column header, flex:1 rows, footer row) in Neon Night's language;
// both formats share the row templates — the bundle's fixed row sizes flex via
// the rows' flex:1 heights, not via `--k`, exactly like Pack A's shared rows.
//
// The bundle's story also carries a three-logo sponsor strip, but Pack A's
// ladder declares no `sponsor1..3` (teamList is the only kind with them), so
// the strip is dropped — the sponsors-on branch is a "ladder via
// {{sponsorPresentedBy}}" line (Pack A's verb for this kind) in the fragments'
// PRESENTED_BY_STORY treatment, and the sponsors-off branch keeps the bundle's
// glowing cyan `{{hashtags}}` line (a key Pack A declares for this kind).

/** Story background: the row-cards' static-orb night field (see team-list.ts). */
const ROW_STORY_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 28%, var(--surface-top,#0d2138) 0%, var(--ink,#081426) 45%, var(--surface-deep,#04070d) 100%)"></div>` +
  `<div style="position:absolute;top:-120px;left:-120px;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(55,207,230,.30),transparent 62%);filter:blur(42px)"></div>` +
  `<div style="position:absolute;bottom:-160px;right:-140px;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb, var(--gold,#FBAC27) 24%, transparent),transparent 62%);filter:blur(48px)"></div>`;

/** Story root with the bundle row-cards' `60px 70px 54px` padding (see team-list.ts). */
function storyRoot(inner: string): string {
  return columnRoot(ROW_STORY_BG, inner, "60px 70px 54px");
}

/** Story header: glow-ring logo + name/tagline left, cyan eyebrow right (see team-list.ts). */
function storyTopHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:86px;height:86px;border-radius:50%;overflow:hidden;box-shadow:0 0 24px rgba(55,207,230,.5),0 0 0 2px rgba(55,207,230,.5)">${CLUB_LOGO_SLOT}</div>` +
    `<div><div style="font-weight:800;font-size:29px;line-height:1.05">{{clubName}}</div>` +
    `<div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.5);margin-top:6px">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="font:700 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.9);text-align:right;max-width:300px">◍ ${tag}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Table pieces, transcribed from the bundle and shared by both formats
// ---------------------------------------------------------------------------

/** Column header row; only the vertical padding differs per format. */
function colHeader(padding: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;padding:${padding};font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.4)">` +
    `<span style="width:50px">#</span><span style="flex:1">TEAM</span><span style="width:52px;text-align:center">P</span><span style="width:52px;text-align:center">W</span><span style="width:52px;text-align:center">L</span><span style="width:72px;text-align:center">PTS</span>` +
    `</div>`
  );
}

// The bundle's 7 hard-coded rows collapse into a base template plus the
// accent-glow data-repeat-variant="club" alternate. Rows are flex:1 in a
// gap:10px column so a shorter ladder shares the same table area. Base rows
// keep the bundle's cyan position numeral — the pack's floodlight literal —
// while the club row reads the tenant accent throughout.
function ladderRow(variant: "base" | "club"): string {
  if (variant === "club") {
    return (
      `<div data-repeat-variant="club" style="flex:1;min-height:0;display:flex;align-items:center;padding:0 24px;background:color-mix(in srgb, var(--gold,#FBAC27) 10%, transparent);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent);border-radius:24px;backdrop-filter:blur(6px);box-shadow:0 0 50px -12px color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent);font-weight:700;font-size:25px">` +
      `<span style="width:50px;font-family:var(--disp,'Anton'),sans-serif;font-size:32px;color:var(--gold,#F5B21A)">{{row.pos}}</span>` +
      `<span style="flex:1;color:var(--gold,#F5B21A)">{{row.team}}</span>` +
      `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.played}}</span>` +
      `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.won}}</span>` +
      `<span style="width:52px;text-align:center;font:500 18px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.65)">{{row.lost}}</span>` +
      `<span style="width:72px;text-align:center;font-family:var(--disp,'Anton'),sans-serif;font-size:34px;color:var(--gold,#F5B21A)">{{row.points}}</span></div>`
    );
  }
  return (
    `<div style="flex:1;min-height:0;display:flex;align-items:center;padding:0 24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;font-weight:700;font-size:25px">` +
    `<span style="width:50px;font-family:var(--disp,'Anton'),sans-serif;font-size:32px;color:#37CFE6">{{row.pos}}</span>` +
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

// Footer lines carry the row-cards' 22px top margin themselves — the
// sponsors wrappers are display:contents (see team-list.ts).
const storyLadderVia = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5);margin-top:22px">ladder via <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;

const storyHashtagFooter = `<div style="flex:none;text-align:center;font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.8);margin-top:22px">{{hashtags}}</div>`;

// `competitionName` has no slot in the bundle's story (the neon headline is
// "{{gradeLabel}} LADDER", as in Pack A); it renders in the shared eyebrow.
const storyHtml = storyRoot(
  storyTopHeader("{{asOfLabel}}") +
    `<div style="flex:none;text-align:center;padding-top:11px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:109px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 0 30px rgba(55,207,230,.7),0 0 62px rgba(55,207,230,.42)">{{gradeLabel}} LADDER</div>` +
    `</div>` +
    colHeader("20px 24px 10px") +
    `<div data-repeat="rows" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:10px">${ladderRow("club")}${ladderRow("base")}</div>` +
    sponsorsOn(storyLadderVia) +
    sponsorsOff(storyHashtagFooter),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch. Structure follows Broadcast Dark's ladder shared layout,
// dressed in Neon Night: accent-glow club row, glass base rows, mono footer.
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
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*78px);line-height:.9;text-transform:uppercase;margin-top:12px">{{gradeLabel}} <span style="color:var(--gold,#FBAC27)">LADDER</span></div>` +
    `</div>` +
    colHeader("calc(var(--k,1.4)*14px) 24px 10px") +
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
