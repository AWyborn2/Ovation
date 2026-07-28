import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  SPONSOR_STRIP_SHARED,
  clubHeaderFields,
  logoField,
  photoField,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// D4 — Team List. Starting XI (≤12 names) with captain & keeper marked.
//
// Field keys and the `players` repeat contract are IDENTICAL to Broadcast
// Dark's team-list: `bindInput` in pack-render.ts produces row values per card
// KIND (`number` / `surname` / `role`), not per pack — a renamed row key would
// silently render the sample defaults instead of the real XI.
//
// The bundle ships this design as one fluid story branch (a flex column sized
// by `--k` / `--ch`); the story below is transcribed from it with the
// `calc(var(--k,1.4)*…)` sizes resolved at the story `--k` (82→115, 54→76,
// 28→39, 16→22, 10→14, 16→22). The shared (portrait/square) layout is authored
// here following Broadcast Dark's team-list shared structure (list left, squad
// photo right with the venue/date caption) in Neon Night's language: glass row
// panels, cyan-glow number badges, the cyan glow ring on the photo.
//
// Role parenthetical: the bundle sets `MANUEL<span> (C)</span>` — the space
// INSIDE the span. The renderer's `cleanupEmptyRoles` only drops spans whose
// content is exactly "()", so the row template mirrors Pack A's shape
// (`{{row.surname}} <span>({{row.role}})</span>`) instead; an empty role
// collapses cleanly, the bundle's shape would leave " ()" behind.

/**
 * Story background, transcribed from the bundle's row cards: the night radial
 * plus two STATIC neon orbs — slightly smaller / dimmer than `STORY_BG`'s
 * (620/700px at .30/.24, blur 42/48) and without the `hhGlow` animation the
 * match-result story breathes on. Kept verbatim rather than reusing the
 * fragment: the row cards' quieter field is the bundle's choice, not drift.
 */
const ROW_STORY_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 28%, var(--surface-top,#0d2138) 0%, var(--ink,#081426) 45%, var(--surface-deep,#04070d) 100%)"></div>` +
  `<div style="position:absolute;top:-120px;left:-120px;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(55,207,230,.30),transparent 62%);filter:blur(42px)"></div>` +
  `<div style="position:absolute;bottom:-160px;right:-140px;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb, var(--gold,#FBAC27) 24%, transparent),transparent 62%);filter:blur(48px)"></div>`;

/**
 * Story root: the bundle row-cards' tighter `60px 70px 54px` padding, not the
 * pack's `storyColumnRoot` (66/70/64) — these cards open with the full glow-ring
 * header at the very top of the frame and pack 12 glass rows below it.
 */
function storyRoot(inner: string): string {
  return columnRoot(ROW_STORY_BG, inner, "60px 70px 54px");
}

/**
 * Story header, transcribed from the bundle's row cards: the circular club
 * logo in a cyan glow ring + name/tagline left, glowing cyan mono eyebrow
 * right. A size down from the fragments' `storyHeader` (86px logo vs 96,
 * 29/14px type vs 30/15, 18px right-aligned capped eyebrow vs 20) — the row
 * cards' bundle branch is tighter throughout, so this stays local.
 */
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
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// One row template replaces the bundle's 12 hard-coded rows: a glass panel per
// player, the order numeral in a cyan-glow badge box (the pack's floodlight
// literal, not the tenant accent), heavy uppercase surname, cyan role
// parenthetical.
const storyRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:20px;backdrop-filter:blur(6px);padding:0 24px">` +
  `<div style="width:76px;height:76px;flex:none;border-radius:12px;background:rgba(55,207,230,.12);border:1px solid rgba(55,207,230,.4);display:flex;align-items:center;justify-content:center;font-family:var(--disp,'Anton'),sans-serif;font-size:39px;color:#37CFE6;text-shadow:0 0 12px rgba(55,207,230,.6)">{{row.number}}</div>` +
  `<span style="font-weight:700;font-size:39px;color:#fff;flex:1;text-transform:uppercase">{{row.surname}} <span style="font-size:22px;color:#37CFE6">({{row.role}})</span></span>` +
  `</div>`;

/**
 * Story sponsor strip, transcribed from the bundle: 14px-radius slots on the
 * near-white wash (the fragments' shared strip keeps the non-story 11px
 * treatment, so this stays local).
 */
const storySponsorStrip =
  `<div style="flex:none;margin-top:22px">` +
  `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.4);margin-bottom:12px">PROUDLY SUPPORTED BY</div>` +
  `<div style="display:flex;gap:14px">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:88px;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.94)">${slot(`sponsor${n}`, "sponsor", "rounded", 14)}</div>`,
    )
    .join("") +
  `</div></div>`;

// The bundle's sponsors-off line is the fragments' HASHTAG_FOOTER_STORY plus
// the row-cards' 22px top margin; `sponsorsOff` wraps in display:contents, so
// the margin has to live on the line itself — transcribed locally.
const storyHashtagFooter = `<div style="flex:none;text-align:center;font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.8);margin-top:22px">{{hashtags}}</div>`;

// The bundle story has no venueDateTime slot (as in Pack B) — the field renders
// in the shared layout's photo caption only.
const storyHtml = storyRoot(
  storyTopHeader("{{gradeRound}}") +
    `<div style="flex:none;text-align:center;padding-top:14px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:115px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 0 30px rgba(55,207,230,.7),0 0 62px rgba(55,207,230,.42)">TEAM LINE-UP</div>` +
    `<div style="margin-top:12px"><div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7)">{{competitionLine}}</div></div>` +
    `</div>` +
    // The bundle pairs justify-content:space-between with gap:10px, so a short
    // XI spreads over the list area instead of bunching at the top.
    `<div data-repeat="players" style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;gap:10px;margin-top:22px">${storyRow}</div>` +
    sponsorsOn(storySponsorStrip) +
    sponsorsOff(storyHashtagFooter),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch for this card. Structure follows Broadcast Dark's team-list
// shared layout (rows flexed by --k, photo column at flex:1.12), dressed in
// Neon Night: glass row panels, cyan number badges, cyan glow ring photo frame.
// ---------------------------------------------------------------------------

const sharedRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:16px;backdrop-filter:blur(6px);padding:0 18px">` +
  `<div style="width:calc(var(--k,1)*40px);height:calc(var(--k,1)*40px);flex:none;border-radius:10px;background:rgba(55,207,230,.12);border:1px solid rgba(55,207,230,.4);display:flex;align-items:center;justify-content:center;font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1)*21px);color:#37CFE6;text-shadow:0 0 12px rgba(55,207,230,.6)">{{row.number}}</div>` +
  `<span style="font-weight:700;font-size:calc(var(--k,1)*24px);line-height:1;flex:1;text-transform:uppercase">{{row.surname}} <span style="font-size:calc(var(--k,1)*16px);color:#37CFE6">({{row.role}})</span></span>` +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("TEAM LIST", "{{gradeRound}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{competitionLine}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*82px);line-height:.9;text-transform:uppercase;margin-top:12px">TEAM <span style="color:var(--gold,#FBAC27)">LINE-UP</span></div>` +
    `</div>` +
    `<div style="flex:1;min-height:0;display:flex;gap:26px;margin:calc(var(--k,1.4)*18px) 0 calc(var(--k,1.4)*16px)">` +
    `<div data-repeat="players" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px">${sharedRow}</div>` +
    // Photo frame borrows the match-result story's cyan glow ring (the pack's
    // photo treatment), with the inner scrim + caption from Pack A's structure.
    `<div style="flex:1.12;min-width:0;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -14px rgba(55,207,230,.6)">${slot("squadPhoto", "photo")}` +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -90px 90px -40px rgba(4,7,13,.92)"></div>` +
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
