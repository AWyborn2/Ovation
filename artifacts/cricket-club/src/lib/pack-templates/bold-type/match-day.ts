import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  SPONSOR_STRIP_SHARED,
  clubHeaderFields,
  logoField,
  outlineText,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// C2 — Match Day. Fixture announce: head-to-head rows, ground, date, start.
//
// Field keys are deliberately a SUBSET of Broadcast Dark's match-day:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack. The bundle has no note.title / note.body block, so those two
// Pack A keys simply are not used here.
//
// The bundle ships ONE `--k`-scaled composition for this card (no
// isTall/isSquare branches). Like Gold Foil's match-day, that composition is
// transcribed as the story with `--k` resolved at its 1.4 default into fixed px
// on `storyColumnRoot`; the shared layout keeps the `calc(var(--k)*…)` sizes so
// portrait and square reflow, with Pack A's shared structure as the guide.
//
// Bundle departures, all contract-driven:
//  - the story header follows the pack's `storyHeader` (club wordmark left, no
//    logo slot) — the bundle's own header logo + right-hand "SATURDAY" tag are
//    dropped; the date lives on the VS divider ({{date}} · {{startTime}},
//    replacing the bundle's literal "SAT 8 NOV · 12:30 PM");
//  - the home sub-line "HOME · RUSHTON PARK" binds {{homeAway}} · {{venue}};
//  - the gold bar's sponsors-on credit ("SUPPORTED BY …") has no key in the
//    matchDay contract (no sponsorPresentedBy on Pack A's match-day), so with
//    sponsors on the bar carries the club name alone and the three-logo strip
//    above it does the sponsor work; sponsors-off puts {{hashtags}} in the bar.

/** One head-to-head row. The club's own logo frame gets the gold ring. */
function teamRow(side: "club" | "opposition", flex: boolean): string {
  const mine = side === "club";
  const ring = mine ? "0 0 0 2px var(--gold,#F5B21A)" : "0 0 0 2px rgba(255,255,255,.2)";
  const logoSlot = mine ? CLUB_LOGO_SLOT : slot("opposition.logo", "logo", "rect");
  const name = mine ? "{{clubName}}" : "{{opposition.name}}";
  const nameColour = mine ? "#fff" : "var(--gold,#F5B21A)";
  const tag = mine ? "{{homeAway}} · {{venue}}" : "{{oppositionHomeAway}}";
  const dim = flex ? "calc(var(--k,1.4)*104px)" : "146px";
  const nameSize = flex ? "calc(var(--k,1.4)*88px)" : "123px";
  return (
    `<div style="display:flex;align-items:center;gap:26px">` +
    `<div style="width:${dim};height:${dim};flex:none;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;box-shadow:${ring}">${logoSlot}</div>` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${nameSize};line-height:.82;text-transform:uppercase;color:${nameColour}">${name}</div>` +
    `<div style="margin-top:6px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">${tag}</div></div></div></div>`
  );
}

/** The outlined VS + hard rule + gold date/time divider between the rows. */
function vsDivider(flex: boolean): string {
  const vs = flex
    ? outlineText("VS", 56, ";flex:none;font-size:calc(var(--k,1.4)*56px)")
    : outlineText("VS", 78, ";flex:none");
  return (
    `<div style="display:flex;align-items:center;gap:20px">` +
    vs +
    `<div style="flex:1;height:2px;background:rgba(255,255,255,.16)"></div>` +
    `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A)">{{date}} · {{startTime}}</div></div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

// The bundle's story sponsor strip: sharp 2px corners and solid white plates —
// the pack's hard-edged take on the shared strip, transcribed locally.
const sponsorStripStory =
  `<div style="flex:none;margin-top:31px;margin-bottom:24px">` +
  `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.4);margin-bottom:12px">PROUDLY SUPPORTED BY</div>` +
  `<div style="display:flex;gap:12px">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:80px;background:#fff;border-radius:2px;overflow:hidden">${slot(`sponsor${n}`, "sponsor", "rect")}</div>`,
    )
    .join("") +
  `</div></div>`;

// The full-bleed gold bar (pairs with storyColumnRoot's padding via the
// negative margins). Right side is the sponsors-off hashtag only — see the
// module note on the missing sponsors-on credit key.
const goldBarStory =
  `<div style="flex:none;background:var(--gold,#F5B21A);margin:0 -80px -70px;padding:30px 80px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
  `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>` +
  sponsorsOff(
    `<span style="font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em">{{hashtags}}</span>`,
  ) +
  `</div>`;

const storyHtml = storyColumnRoot(
  storyHeader("{{roundLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:31px;padding-top:14px">` +
    teamRow("club", false) +
    vsDivider(false) +
    teamRow("opposition", false) +
    `</div>` +
    sponsorsOn(sponsorStripStory) +
    goldBarStory,
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("MATCH DAY", "{{roundLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*22px);padding-top:calc(var(--k,1.4)*10px)">` +
    teamRow("club", true) +
    vsDivider(true) +
    teamRow("opposition", true) +
    `</div>` +
    sponsorsOn(SPONSOR_STRIP_SHARED) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

export const matchDay: PackCardTemplate = {
  kind: "matchDay",
  designKey: "match-day",
  name: "Match Day",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("roundLabel", "Round label", "THIS SATURDAY · ROUND 3"),
    textField("opposition.name", "Opposition name", "MARINERS"),
    logoField("opposition.logo", "Opposition logo", "Opponent logo"),
    textField("homeAway", "Club home/away label", "HOME"),
    textField("oppositionHomeAway", "Opposition home/away label", "AWAY"),
    textField("venue", "Ground", "Rushton Park"),
    textField("date", "Date", "Sat 8 Nov"),
    textField("startTime", "Start time", "12:30 PM"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
