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

// C4 — Team List. Starting XI (≤12 names) with captain & keeper marked.
//
// Field keys and the `players` repeat contract are IDENTICAL to Broadcast
// Dark's team-list: `bindInput` in pack-render.ts produces row values per card
// KIND (`number` / `surname` / `role`), not per pack — a renamed row key would
// silently render the sample defaults instead of the real XI.
//
// The bundle ships this design as one fluid story branch (a flex column sized
// by `--k` / `--ch`); the story below is transcribed from it with the
// `calc(var(--k,1.4)*…)` sizes resolved at the story `--k` (92→129, 40→56,
// 74→104, 30→42, 17→24; the 2.8px number stroke rounds to the pack's 3px).
// The shared (portrait/square) layout is authored here following Broadcast
// Dark's team-list shared structure (list left, squad photo right with the
// venue/date caption) in Bold Type's language: outline-stroke numerals, hard
// 2px hairline rows, sharp 2px photo corners, full-strength gold ring.
//
// Role parenthetical: the bundle sets `MANUEL<span> (C)</span>` — the space
// INSIDE the span. The renderer's `cleanupEmptyRoles` only drops spans whose
// content is exactly "()", so the row template mirrors Pack A's shape
// (`{{row.surname}} <span>({{row.role}})</span>`) instead; an empty role
// collapses cleanly, the bundle's shape would leave " ()" behind.
//
// Sponsor mapping: the bundle's gold bar carries a "SUPPORTED BY <sponsor>"
// credit, but Pack A's teamList declares no `sponsorPresentedBy` (teamList is
// the only kind with `sponsor1..3`, and new keys are forbidden). So the
// sponsors-on branch is the three-logo strip above the bar — the strip carries
// the crediting — and the bar's right span renders only in the sponsors-off
// branch, holding `{{hashtags}}` (Pack A's teamList hashtag key; the
// `clubHashtag` key the bundle's bar implies is likewise not on this kind).

/**
 * Story background, transcribed from the bundle's row cards: the flat block
 * with a subtle top sheen. Not `STORY_BG` (the un-sheened field of the pinned
 * match-result story) and not `SHARED_BG` (which adds the beam/glow the row
 * cards don't have).
 */
const SHEEN_BG = `<div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,.05), transparent 24%), var(--block,#0E1C31)"></div>`;

/**
 * Story root: the bundle row-cards' tighter `60px 70px 54px` padding, not the
 * pack's `storyColumnRoot` (80/80/70). The gold footer bar below cancels THIS
 * padding with `margin:0 -70px -54px` — change one and you must change both.
 */
function storyRoot(inner: string): string {
  return columnRoot(SHEEN_BG, inner, "60px 70px 54px");
}

/**
 * Story header, transcribed from the bundle: small club logo beside a tracked
 * gold mono line, dim tracked mono line right. Unlike the match-result story
 * (see fragments.ts storyHeader), the bundle's row cards DO carry a logo slot.
 */
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

/**
 * Local gold footer bar: same treatment as the fragments' goldBarStory, but
 * with this root's 70/54 negative margins — the fragments' bars pair with
 * `storyColumnRoot`'s 80/70 padding and would misalign here.
 */
function goldBar(right: string): string {
  return (
    `<div style="background:var(--gold,#F5B21A);margin:0 -70px -54px;padding:30px 70px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
    `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>${right}</div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// One row template replaces the bundle's 12 hard-coded rows: hollow
// outline-stroke numeral (the pack's signature, inline-span form of
// fragments.ts outlineText), heavy uppercase surname, gold role parenthetical.
// The bundle drops the hairline on its 12th row; a single repeat template
// keeps it on every row — invisible against the gold bar's top edge.
const storyRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:26px;border-bottom:2px solid rgba(255,255,255,.1)">` +
  `<span style="font-family:var(--disp,'Anton'),sans-serif;font-size:56px;line-height:1;color:transparent;-webkit-text-stroke:3px var(--gold,#F5B21A);width:104px;flex:none">{{row.number}}</span>` +
  `<span style="font-weight:800;font-size:42px;color:#fff;flex:1;text-transform:uppercase">{{row.surname}} <span style="font-size:24px;color:var(--gold,#F5B21A)">({{row.role}})</span></span>` +
  `</div>`;

/**
 * Story sponsor strip, transcribed from the bundle: left-aligned tracked mono
 * label, three white slots with Bold Type's sharp 2px corners (the shared
 * strip in fragments.ts keeps the 11px-radius non-story treatment).
 */
const storySponsorStrip =
  `<div style="margin-bottom:24px">` +
  `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.4);margin-bottom:12px">PROUDLY SUPPORTED BY</div>` +
  `<div style="display:flex;gap:12px">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:80px;background:#fff;border-radius:2px;overflow:hidden">${slot(`sponsor${n}`, "sponsor", "rect")}</div>`,
    )
    .join("") +
  `</div></div>`;

// Header right: the bundle shows the opponent ("vs …") there, but Pack A folds
// the opponent into `{{competitionLine}}` and declares no opponent key — so the
// slot carries `{{venueDateTime}}`, the one header-weight text field the story
// otherwise leaves to the shared layout's photo caption.
const storyHtml = storyRoot(
  storyTopHeader("{{gradeRound}}", "{{venueDateTime}}") +
    `<div style="flex:none;padding-top:20px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:129px;line-height:.82;text-transform:uppercase;color:#fff">TEAM <span style="color:var(--gold,#F5B21A)">LINE-UP</span></div>` +
    `<div style="margin-top:12px;font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">{{competitionLine}}</div>` +
    `</div>` +
    // `justify-content:space-between` keeps a short XI spread over the list
    // area instead of bunching at the top (the bundle's 12 flex:1 rows fill it).
    `<div data-repeat="players" style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;margin-top:22px">${storyRow}</div>` +
    `<div style="flex:none;margin-top:31px">` +
    sponsorsOn(storySponsorStrip) +
    goldBar(
      sponsorsOff(
        `<span style="font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em">{{hashtags}}</span>`,
      ),
    ) +
    `</div>`,
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch for this card. Structure follows Broadcast Dark's team-list
// shared layout (rows flexed by --k, photo column at flex:1.12), dressed in
// Bold Type: outline numerals, 2px hairlines, sharp corners, solid gold ring.
// ---------------------------------------------------------------------------

const sharedRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:16px;border-bottom:2px solid rgba(255,255,255,.1)">` +
  `<span style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1)*30px);line-height:1;color:transparent;-webkit-text-stroke:2px var(--gold,#FBAC27);width:calc(var(--k,1)*52px);flex:none">{{row.number}}</span>` +
  `<span style="font-weight:800;font-size:calc(var(--k,1)*26px);line-height:1;flex:1;text-transform:uppercase">{{row.surname}} <span style="font-size:calc(var(--k,1)*17px);color:var(--gold,#FBAC27)">({{row.role}})</span></span>` +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("TEAM LIST", "{{gradeRound}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{competitionLine}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*92px);line-height:.82;text-transform:uppercase;margin-top:12px">TEAM <span style="color:var(--gold,#FBAC27)">LINE-UP</span></div>` +
    `</div>` +
    `<div style="flex:1;min-height:0;display:flex;gap:26px;margin:calc(var(--k,1.4)*18px) 0 calc(var(--k,1.4)*16px)">` +
    `<div data-repeat="players" style="flex:1;min-width:0;display:flex;flex-direction:column">${sharedRow}</div>` +
    `<div style="flex:1.12;min-width:0;position:relative;border-radius:2px;overflow:hidden;box-shadow:0 0 0 3px var(--gold,#FBAC27)">${slot("squadPhoto", "photo")}` +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -90px 90px -40px rgba(6,10,18,.9)"></div>` +
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
