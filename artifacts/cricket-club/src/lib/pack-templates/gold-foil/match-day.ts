import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  SPONSOR_STRIP_SHARED,
  clubHeaderFields,
  foilText,
  logoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// B2 — Match Day. Fixture announce: head-to-head circles, ground, date, start.
//
// Field keys are deliberately a SUBSET of Broadcast Dark's match-day:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack. The bundle has no note.title / note.body block, so those two
// Pack A keys simply are not used here.
//
// The bundle ships ONE `--k`-scaled composition for this card (no
// isTall/isSquare branches). That composition is transcribed as the story with
// `--k` resolved at its 1.4 default into fixed px (match-result's story is
// fixed-size too); the shared layout below keeps the `calc(var(--k)*…)` sizes
// so portrait and square reflow, with Pack A's shared structure as the guide.

/**
 * `foilText` at a `--k`-scaled size for the shared layout. The helper takes a
 * fixed px size, so the calc font-size is appended and wins by declaration
 * order.
 */
function foilFlex(content: string, px: number, extraStyle = ""): string {
  return foilText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/**
 * The B-series story header carries a small club mark above the wordmark
 * (unlike B1's) — `storyHeader` deliberately has no logo slot, so the mark is
 * its own flex block.
 */
const STORY_LOGO = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

// ---------------------------------------------------------------------------
// Head-to-head columns and the fixture info panel
// ---------------------------------------------------------------------------

/** One side of the VS row. The club's own circle gets the gold ring. */
function teamCol(side: "club" | "opposition", flex: boolean): string {
  const mine = side === "club";
  const ring = mine
    ? "0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent)"
    : "0 0 0 2px rgba(255,255,255,.16)";
  const logoSlot = mine
    ? slot("clubLogo", "logo", "circle")
    : slot("opposition.logo", "logo", "circle");
  const name = mine ? "{{clubName}}" : "{{opposition.name}}";
  const tag = mine ? "{{homeAway}}" : "{{oppositionHomeAway}}";
  const dim = flex ? "calc(var(--k,1.4)*150px)" : "210px";
  const nameHtml = flex
    ? foilFlex(name, 34, ";margin-top:18px")
    : foilText(name, 48, ";margin-top:18px");
  return (
    `<div style="flex:1;max-width:390px">` +
    `<div style="width:${dim};height:${dim};border-radius:50%;overflow:hidden;margin:0 auto;background:rgba(255,255,255,.05);box-shadow:${ring}">${logoSlot}</div>` +
    nameHtml +
    `<div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.5);margin-top:8px">${tag}</div></div>`
  );
}

function infoCell(label: string, value: string): string {
  return `<div><div style="font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A)">${label}</div><div style="font-weight:800;font-size:30px;line-height:1.1;margin-top:10px;color:#fff">${value}</div></div>`;
}

const INFO_DIVIDER = `<span style="width:1px;height:52px;background:color-mix(in srgb, var(--gold,#F5B21A) 40%, transparent)"></span>`;

/** Gold-bordered GROUND · DATE · START panel (identical in both formats). */
const INFO_PANEL =
  `<div style="flex:none;width:100%;border:1px solid color-mix(in srgb, var(--gold,#F5B21A) 40%, transparent);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.04),transparent);padding:28px 30px;display:flex;align-items:center;justify-content:space-around">` +
  infoCell("GROUND", "{{venue}}") +
  INFO_DIVIDER +
  infoCell("DATE", "{{date}}") +
  INFO_DIVIDER +
  infoCell("START", "{{startTime}}") +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

// The bundle's story sponsor strip is the shared strip with a CENTRED label —
// transcribed locally rather than bending SPONSOR_STRIP_SHARED's left-aligned
// one.
const sponsorStripStory =
  `<div style="flex:none;margin-top:20px"><div style="text-align:center;font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.24em;color:rgba(255,255,255,.4);margin-bottom:14px">PROUDLY SUPPORTED BY</div>` +
  `<div style="display:flex;gap:14px">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:88px;border-radius:11px;overflow:hidden;background:rgba(255,255,255,.94)">${slot(`sponsor${n}`, "sponsor", "rounded", 11)}</div>`,
    )
    .join("") +
  `</div></div>`;

const hashtagFooterStory = `<div style="flex:none;text-align:center;font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:var(--gold,#F5B21A);margin-top:20px">{{hashtags}}</div>`;

const storyHtml = storyColumnRoot(
  STORY_LOGO +
    storyHeader("{{roundLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;padding-top:22px">` +
    foilText("MATCH DAY", 168) +
    `<div style="width:100%;display:flex;align-items:center;justify-content:center;gap:34px">` +
    teamCol("club", false) +
    foilText("VS", 109, ";flex:none") +
    teamCol("opposition", false) +
    `</div>` +
    INFO_PANEL +
    `</div>` +
    sponsorsOn(sponsorStripStory) +
    sponsorsOff(hashtagFooterStory),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("MATCH DAY", "{{roundLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;padding:calc(var(--k,1.4)*16px) 0">` +
    foilFlex("MATCH DAY", 110) +
    `<div style="width:100%;display:flex;align-items:center;justify-content:center;gap:calc(var(--k,1.4)*24px)">` +
    teamCol("club", true) +
    foilFlex("VS", 70, ";flex:none") +
    teamCol("opposition", true) +
    `</div>` +
    INFO_PANEL +
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
