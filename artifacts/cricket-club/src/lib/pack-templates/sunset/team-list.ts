import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  SPONSOR_STRIP_SHARED,
  clubHeaderFields,
  logoField,
  photoField,
  repeatField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// E4 — Team List. Starting XI (≤12 names) with captain & keeper marked.
//
// Field keys and the `players` repeat contract are IDENTICAL to Broadcast
// Dark's team-list: `bindInput` in pack-render.ts produces row values per card
// KIND (`number` / `surname` / `role`), not per pack — a renamed row key would
// silently render the sample defaults instead of the real XI.
//
// The bundle ships this design as one fluid story branch (a flex column sized
// by `--k` / `--ch`); the story below is transcribed from it with the
// `calc(var(--k,1.4)*…)` sizes resolved at the story `--k` (10→14, 54→76,
// 30→42, 18→25, 46→64, 24→34, 27→38, 15→21, 14→20). The shared
// (portrait/square) layout is authored here following Broadcast Dark's
// team-list shared structure (list left, squad photo right with the venue/date
// caption) in Sunset's language: gold disc numerals, warm hairline rows, the
// 45% gold ring on the photo, script headline.
//
// Role parenthetical: the bundle sets `MANUEL<span> (C)</span>` — the space
// INSIDE the span. The renderer's `cleanupEmptyRoles` only drops spans whose
// content is exactly "()", so the row template mirrors Pack A's shape
// (`{{row.surname}} <span>({{row.role}})</span>`) instead; an empty role
// collapses cleanly, the bundle's shape would leave " ()" behind.

/**
 * Story header, transcribed from the bundle's row cards: circular club logo +
 * name/tagline left, gold mono tag right — the fragments' `storyHeader` shape
 * a size down (84px logo vs 92, gap 16 vs 18, 13px tagline vs 14). The row
 * cards' bundle branch is tighter throughout, so this stays local.
 */
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
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// One row template replaces the bundle's 12 hard-coded rows: a solid gold disc
// numeral (accent fill, warm-brown ink), heavy uppercase surname, gold role
// parenthetical, warm hairline underneath. The bundle drops the hairline on
// its 12th row; a single repeat template keeps it on every row — it reads as
// part of the list's rhythm over the sunset wash.
const storyRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:18px;border-bottom:1px solid rgba(255,255,255,.12)">` +
  `<div style="width:64px;height:64px;flex:none;border-radius:50%;background:var(--gold,#F5B21A);color:#231400;display:flex;align-items:center;justify-content:center;font-family:var(--disp,'Anton'),sans-serif;font-size:34px">{{row.number}}</div>` +
  `<span style="font-weight:700;font-size:38px;color:#fff;flex:1;text-transform:uppercase">{{row.surname}} <span style="font-size:21px;color:var(--gold,#F5B21A)">({{row.role}})</span></span>` +
  `</div>`;

/**
 * Story sponsor strip, transcribed from the bundle: three 82px slots at radius
 * 12 with NO "proudly supported by" label (the fragments' shared strip keeps
 * the labelled 88px/11px non-story treatment, so this stays local). The
 * sponsors wrappers are display:contents, so the strip carries its own top
 * margin.
 */
const storySponsorStrip =
  `<div style="flex:none;margin-top:20px;display:flex;gap:14px">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:82px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.92)">${slot(`sponsor${n}`, "sponsor", "rounded", 12)}</div>`,
    )
    .join("") +
  `</div>`;

// The bundle's sponsors-off line is the fragments' HASHTAG_FOOTER_STORY plus
// the row cards' top margin, holding the two-hashtag literal — Pack A's
// teamList hashtag key is `hashtags` (not `clubHashtag`), so the line is
// authored locally against that key.
const storyHashtagFooter = `<div style="flex:none;text-align:center;font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);margin-top:20px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{hashtags}}</div>`;

// The bundle story has no venueDateTime slot (as in Packs B/C/D) — the field
// renders in the shared layout's photo caption only. The bundle's photo scrim
// carries preview-runtime pins (fixed width/height/left/top) and sits UNDER
// the image slot; both are artifacts — the scrim here is the clean inset
// version layered over the photo, as in every other pack.
const storyHtml = storyColumnRoot(
  storyTopHeader("{{gradeRound}}") +
    `<div style="flex:none;margin-top:14px">` +
    scriptText("Team Line-Up", 76) +
    `<div style="margin-top:6px"><div style="font:600 15px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">{{competitionLine}}</div></div>` +
    `</div>` +
    `<div style="flex:1;min-height:0;display:flex;gap:42px;margin-top:25px">` +
    // The bundle pairs justify-content:space-between with flex:1 rows, so a
    // short XI spreads over the list area instead of bunching at the top.
    `<div data-repeat="players" style="flex:1.02;min-width:0;display:flex;flex-direction:column;justify-content:space-between">${storyRow}</div>` +
    `<div style="flex:.98;min-width:0;position:relative;border-radius:18px;overflow:hidden;box-shadow:0 0 0 2px color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent)">${slot("squadPhoto", "photo")}` +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.85)"></div>` +
    `</div>` +
    `</div>` +
    sponsorsOn(storySponsorStrip) +
    sponsorsOff(storyHashtagFooter),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch for this card. Structure follows Broadcast Dark's team-list
// shared layout (rows flexed by --k, photo column at flex:1.12), dressed in
// Sunset: gold disc numerals, warm hairlines, script headline, 45% gold ring.
// ---------------------------------------------------------------------------

const sharedRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:14px;border-bottom:1px solid rgba(255,255,255,.12)">` +
  `<div style="width:calc(var(--k,1)*42px);height:calc(var(--k,1)*42px);flex:none;border-radius:50%;background:var(--gold,#FBAC27);color:#231400;display:flex;align-items:center;justify-content:center;font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1)*22px)">{{row.number}}</div>` +
  `<span style="font-weight:700;font-size:calc(var(--k,1)*24px);line-height:1;flex:1;text-transform:uppercase">{{row.surname}} <span style="font-size:calc(var(--k,1)*16px);color:var(--gold,#FBAC27)">({{row.role}})</span></span>` +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("TEAM LIST", "{{gradeRound}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{competitionLine}}</div>` +
    // `scriptText` takes a fixed px size (story-oriented); the shared layout
    // must flex with --k, so the extraStyle re-declares font-size — the later
    // declaration wins and the nominal 54 is never rendered.
    scriptText("Team Line-Up", 54, ";font-size:calc(var(--k,1.4)*54px);margin-top:10px") +
    `</div>` +
    `<div style="flex:1;min-height:0;display:flex;gap:26px;margin:calc(var(--k,1.4)*18px) 0 calc(var(--k,1.4)*16px)">` +
    `<div data-repeat="players" style="flex:1;min-width:0;display:flex;flex-direction:column">${sharedRow}</div>` +
    `<div style="flex:1.12;min-width:0;position:relative;border-radius:18px;overflow:hidden;box-shadow:0 0 0 2px color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent)">${slot("squadPhoto", "photo")}` +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.85)"></div>` +
    `<div style="position:absolute;bottom:22px;left:24px;right:24px;font:600 calc(var(--k,1)*15px)/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{venueDateTime}}</div>` +
    `</div>` +
    `</div>` +
    sponsorsOn(SPONSOR_STRIP_SHARED) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

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
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
