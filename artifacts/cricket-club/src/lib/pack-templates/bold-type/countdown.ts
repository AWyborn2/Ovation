import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// C10 — Countdown. Hype / countdown to the season opener or finals.
//
// Field keys are deliberately a SUBSET of Broadcast Dark's countdown:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack. hashtagsExtra is unused (nothing in the bundle wants a second
// hashtag line).
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches);
// as for match-day, it is transcribed as the story with `--k` resolved at its
// 1.4 default into fixed px, and the shared layout keeps the flexing calcs.
//
// Bundle departures, all contract-driven:
//  - the bundle's bottom rule row is GROUND / OPPONENT / START, but Pack A's
//    countdown has no venue/startTime keys — the row becomes two cells binding
//    the contract's composed strings: DATE & VENUE → {{dateVenue}} and
//    FIXTURE → {{fixtureLine}} (same data, one field per cell);
//  - the bundle's three-logo sponsor strip is dropped: sponsor1–3 are not in
//    Pack A's countdown contract. Sponsors-on credit rides the gold bar as
//    "presented by {{sponsorPresentedBy}}" instead (fragments'
//    PRESENTED_BY_STORY), matching Pack A's presented-by-only sponsor model;
//  - the story header's right tag is {{eventLabel}}; the bundle's second tag
//    ("SAT 8 NOV") is covered by {{dateVenue}} in the rule row.

/** The hype stack + big number + rule row; sizes swap between fixed and calc. */
function middle(flex: boolean): string {
  const k = (px: number, fixed: number) => (flex ? `calc(var(--k,1.4)*${px}px)` : `${fixed}px`);
  return (
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;padding:${k(16, 22)} 0 ${k(22, 31)}">` +
    // Two-line hype statement, second line gold.
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${k(58, 81)};line-height:.82;text-transform:uppercase;color:#fff">{{hypeLine1}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${k(58, 81)};line-height:.82;text-transform:uppercase;color:var(--gold,#F5B21A)">{{hypeLine2}}</div></div>` +
    // The oversized number IS the hero — pure type, no photo.
    `<div style="display:flex;align-items:flex-end;gap:28px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${k(240, 336)};line-height:.72;color:#fff">{{daysToGo}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${k(66, 92)};line-height:.9;color:var(--gold,#F5B21A);padding-bottom:${k(16, 22)};text-transform:uppercase">Days<br>to go</div></div>` +
    // Hard-rule info row.
    `<div style="display:flex;gap:20px;border-top:2px solid rgba(255,255,255,.16);padding-top:26px">` +
    `<div style="flex:1"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">DATE &amp; VENUE</div>` +
    `<div style="font-weight:800;font-size:28px;color:#fff;margin-top:8px">{{dateVenue}}</div></div>` +
    `<div style="flex:1"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">FIXTURE</div>` +
    `<div style="font-weight:800;font-size:28px;color:#fff;margin-top:8px">{{fixtureLine}}</div></div>` +
    `</div></div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("{{eventLabel}}") +
    middle(false) +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("COUNTDOWN", "{{eventLabel}}") +
    middle(true) +
    sponsorsOn(
      `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;color:rgba(255,255,255,.6)">season launch presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

export const countdown: PackCardTemplate = {
  kind: "countdown",
  designKey: "countdown",
  name: "Countdown",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("eventLabel", "Event label", "SEASON OPENER"),
    textField("daysToGo", "Days to go", "2"),
    textField("hypeLine1", "Hype line 1", "NEW SEASON"),
    textField("hypeLine2", "Hype line 2", "SAME HUNGER"),
    textField("dateVenue", "Date / venue", "Sat 8 Nov · Rushton Park"),
    textField("fixtureLine", "Fixture line", "vs Mariners · first ball 12:30 PM"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Season launch sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
