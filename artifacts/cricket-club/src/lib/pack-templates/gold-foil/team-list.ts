import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  SPONSOR_STRIP_SHARED,
  STORY_BG,
  clubHeaderFields,
  foilText,
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

// B4 — Team List. Starting XI (≤12 names) with captain & keeper marked.
//
// Field keys and the `players` repeat contract are IDENTICAL to Broadcast
// Dark's team-list: `bindInput` in pack-render.ts produces row values per card
// KIND (`number` / `surname` / `role`), not per pack — a renamed row key would
// silently render the sample defaults instead of the real XI.
//
// The bundle ships this design as a story-only composition (a flex column that
// flexes via `--k`, unlike match-result's pinned story). The story below is
// transcribed from it; the shared (portrait/square) layout is authored here,
// following Broadcast Dark's team-list shared structure (list left, squad photo
// right with the venue/date caption) in Gold Foil's visual language.

/**
 * The static brushed-metal ramp the bundle paints row numerals with — the same
 * specular sequence as `foilText` but un-animated, as a style fragment usable
 * on inline spans. Kept local: only the row/repeat cards need it.
 */
const FOIL_SPAN =
  `font-family:var(--disp,'Anton'),sans-serif;` +
  `background:linear-gradient(180deg,#FFF3CC 4%,#F7CE6C 32%,#C8860A 60%,#8A5B06 78%,#FFE59C 100%);` +
  `-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;` +
  `filter:drop-shadow(0 3px 12px rgba(0,0,0,.55))`;

/**
 * Story root: the bundle's tighter `60px 70px 54px` padding, not the pack's
 * `storyColumnRoot` (96px top) — these row cards open with a logo header at the
 * very top of the frame, so the match-result composition's tall head margin
 * would push the 12-row list off balance.
 */
function storyRoot(inner: string): string {
  return columnRoot(STORY_BG, inner, "60px 70px 54px");
}

/**
 * Story header, transcribed from the bundle: club logo above the tracked-caps
 * club name over a gold-ruled tag line. Unlike the match-result story (see
 * `fragments.ts` storyHeader), the bundle's row cards DO carry a logo slot.
 */
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

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// One row template replaces the bundle's 12 hard-coded rows. Sizes are the
// bundle's `calc(var(--k,1.4)*…)` resolved at the story `--k` (30→42, 56→78,
// 17→24). The role parenthetical mirrors Broadcast Dark's structure exactly so
// the renderer's `cleanupEmptyRoles` drops the empty "()" span on players with
// no role.
const storyRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:22px;border-bottom:1px solid color-mix(in srgb, var(--gold,#F5B21A) 18%, transparent)">` +
  `<span style="${FOIL_SPAN};font-size:42px;width:78px;text-align:center;flex:none">{{row.number}}</span>` +
  `<span style="font-weight:700;font-size:42px;line-height:1;flex:1;color:#fff">{{row.surname}} <span style="font-size:24px;color:var(--gold,#F5B21A)">({{row.role}})</span></span>` +
  `</div>`;

/** Story sponsor strip: the bundle centres the label (shared strip's is left). */
const storySponsorStrip =
  `<div style="flex:none;margin-top:20px">` +
  `<div style="text-align:center;font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:rgba(255,255,255,.4);margin-bottom:14px">PROUDLY SUPPORTED BY</div>` +
  `<div style="display:flex;gap:14px">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:88px;border-radius:11px;overflow:hidden;background:rgba(255,255,255,.94)">${slot(`sponsor${n}`, "sponsor", "rounded", 11)}</div>`,
    )
    .join("") +
  `</div></div>`;

const storyHtml = storyRoot(
  storyTopHeader("{{gradeRound}}") +
    `<div style="flex:none;text-align:center;margin-top:14px">` +
    foilText("TEAM LINE UP", 118) +
    `<div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:rgba(255,255,255,.5);margin-top:12px">{{competitionLine}}</div>` +
    `</div>` +
    // `justify-content:space-between` keeps a short XI spread over the list
    // area instead of bunching at the top (the bundle's 12 flex:1 rows fill it).
    `<div data-repeat="players" style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;margin-top:25px">${storyRow}</div>` +
    sponsorsOn(storySponsorStrip) +
    sponsorsOff(
      `<div style="flex:none;text-align:center;font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:var(--gold,#F5B21A);margin-top:20px">{{hashtags}}</div>`,
    ),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch for this card. Structure follows Broadcast Dark's team-list
// shared layout (rows flexed by --k, photo column at flex:1.12), dressed in
// Gold Foil: foil numerals, gold hairline rows, the 55% gold photo ring.
// ---------------------------------------------------------------------------

const sharedRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:16px;border-bottom:1px solid color-mix(in srgb, var(--gold,#FBAC27) 18%, transparent)">` +
  `<span style="${FOIL_SPAN};font-size:calc(var(--k,1)*30px);width:calc(var(--k,1)*48px);text-align:center;flex:none">{{row.number}}</span>` +
  `<span style="font-weight:700;font-size:calc(var(--k,1)*26px);line-height:1;flex:1">{{row.surname}} <span style="font-size:calc(var(--k,1)*17px);color:var(--gold,#FBAC27)">({{row.role}})</span></span>` +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("TEAM LIST", "{{gradeRound}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{competitionLine}}</div>` +
    // `foilText` takes a fixed px size (story-oriented); the shared layout must
    // flex with --k, so the extraStyle re-declares font-size — the later
    // declaration wins and the nominal 100 is never rendered.
    foilText("TEAM LINE UP", 100, ";font-size:calc(var(--k,1.4)*100px);margin-top:12px") +
    `</div>` +
    `<div style="flex:1;min-height:0;display:flex;gap:26px;margin:calc(var(--k,1.4)*18px) 0 calc(var(--k,1.4)*16px)">` +
    `<div data-repeat="players" style="flex:1;min-width:0;display:flex;flex-direction:column">${sharedRow}</div>` +
    `<div style="flex:1.12;min-width:0;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 55%, transparent)">${slot("squadPhoto", "photo")}` +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -90px 90px -40px rgba(8,9,11,.9)"></div>` +
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
