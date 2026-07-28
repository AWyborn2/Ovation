import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  foilText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// B10 — Countdown. Hype / countdown to the season opener or finals.
//
// Field keys are a SUBSET of Broadcast Dark's countdown — `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. Note the countdown kind
// has NO sponsor1–3 keys: the bundle's three-logo strip is therefore replaced
// by the presented-by line in both formats (the strip's slots would be new
// keys, which the parity test forbids).
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches).
// It is transcribed as the story with `--k` resolved at its 1.4 default into
// fixed px; the shared layout keeps the `calc(var(--k)*…)` sizes so portrait
// and square reflow, with Pack A's shared structure as the guide.

/** `foilText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function foilFlex(content: string, px: number, extraStyle = ""): string {
  return foilText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/** Small club mark the B-series story header carries above the wordmark. */
const STORY_LOGO = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

/** Gold-bordered fixture panel: date/venue headline over the fixture line. */
const FIXTURE_PANEL =
  `<div style="flex:none;width:100%;border:1px solid color-mix(in srgb, var(--gold,#F5B21A) 40%, transparent);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.04),transparent);padding:26px 30px">` +
  `<div style="font-weight:800;font-size:30px;color:#fff">{{dateVenue}}</div>` +
  `<div style="font-weight:500;font-size:22px;color:rgba(255,255,255,.72);margin-top:8px">{{fixtureLine}}</div></div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — foil hype line, the huge foil day count, fixture panel
// ---------------------------------------------------------------------------

// The bundle's single hype line "NEW SEASON · SAME HUNGER" binds as the two
// Pack A hype keys joined by the same interpunct (Pack A stacks them on two
// lines instead).
const storyHtml = storyColumnRoot(
  STORY_LOGO +
    storyHeader("{{eventLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:17px;margin-bottom:34px">` +
    foilText("{{hypeLine1}} · {{hypeLine2}}", 73) +
    `<div>` +
    foilText("{{daysToGo}}", 330, ";line-height:.78") +
    foilText("DAYS TO GO", 84) +
    `</div>` +
    FIXTURE_PANEL +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

// PRESENTED_BY_STORY is layout-neutral (a centred flex:none line), so it
// serves the shared sponsors-on footer too — the countdown kind has no
// sponsor-strip keys to fill SPONSOR_STRIP_SHARED with.
const sharedHtml = sharedColumnRoot(
  sharedHeader("COUNTDOWN", "{{eventLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding:calc(var(--k,1.4)*14px) 0">` +
    foilFlex("{{hypeLine1}} · {{hypeLine2}}", 48) +
    `<div>` +
    foilFlex("{{daysToGo}}", 236, ";line-height:.78") +
    foilFlex("DAYS TO GO", 56) +
    `</div>` +
    FIXTURE_PANEL +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
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
