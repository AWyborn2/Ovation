import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  glassPanel,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// E10 — Countdown. Hype / countdown to the season opener or finals: script
// hype line, the huge day count over the sunset sky, glass fixture panel.
//
// Field keys are a SUBSET of Broadcast Dark's countdown — `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. Contract points, all
// following Pack D's calls on the same card:
//  - the countdown kind has NO sponsor1–3 keys, so the bundle's three-logo
//    strip is replaced by the presented-by line in both formats (the strip's
//    slots would be new keys, which the parity test forbids);
//  - clubHashtag and hashtagsExtra are unused: the bundle's sponsors-off
//    footer is the combined hashtag line, so it binds {{hashtags}} — a local
//    story footer stands in for fragments' HASHTAG_FOOTER_STORY (whose
//    {{clubHashtag}} would otherwise force an extra declared key);
//  - the bundle's script/Anton hype stack ("New Season" / "SAME HUNGER") maps
//    onto Pack A's two hype keys — {{hypeLine1}} takes the script flourish,
//    {{hypeLine2}} the Anton line (Pack A stacks them in one face instead).
//
// The bundle ships ONE `--k`-scaled composition on the plain sunset wash (no
// photo, no isTall/isSquare branches). It is transcribed as the story with
// `--k` resolved at its 1.4 default into fixed px; the shared layout keeps the
// `calc(var(--k)*…)` sizes so portrait and square reflow.

/** `scriptText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function scriptFlex(content: string, px: number, extraStyle = ""): string {
  return scriptText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/** Frosted fixture panel: date/venue headline over the fixture line. */
function fixturePanel(extraStyle: string): string {
  return glassPanel(
    `<div style="text-align:center"><div style="font-weight:800;font-size:28px;color:#fff">{{dateVenue}}</div>` +
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.72);margin-top:6px">{{fixtureLine}}</div></div>`,
    `;padding:26px 28px${extraStyle}`,
  );
}

// Local sponsors-off footer binding {{hashtags}} — see the module note.
const hashtagFooterStory = `<div style="flex:none;text-align:center;font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.8)">{{hashtags}}</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("{{eventLabel}}") +
    `<div style="flex:none;margin-top:14px">` +
    scriptText("{{hypeLine1}}", 76) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:90px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82)">{{hypeLine2}}</div>` +
    `</div>` +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;margin-top:22px">` +
    `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">` +
    `<div style="display:flex;align-items:flex-end;gap:24px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:308px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82)">{{daysToGo}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:84px;line-height:.9;text-transform:uppercase;color:var(--gold,#F5B21A);text-shadow:0 4px 22px rgba(0,0,0,.7);padding-bottom:20px">DAYS TO GO</div>` +
    `</div></div>` +
    `<div style="flex:none">${fixturePanel("")}</div>` +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(hashtagFooterStory),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

// PRESENTED_BY_STORY is layout-neutral (a centred flex:none line), so it
// serves the shared sponsors-on footer too — the countdown kind has no
// sponsor-strip keys to fill SPONSOR_STRIP_SHARED with.
const sharedHtml = sharedColumnRoot(
  sharedHeader("COUNTDOWN", "{{eventLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding:calc(var(--k,1.4)*12px) 0">` +
    `<div>` +
    scriptFlex("{{hypeLine1}}", 54) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*64px);line-height:.9;text-transform:uppercase;color:#fff">{{hypeLine2}}</div>` +
    `</div>` +
    `<div><div style="display:flex;align-items:flex-end;justify-content:center;gap:24px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*220px);line-height:.9;text-transform:uppercase;color:#fff">{{daysToGo}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*60px);line-height:.9;text-transform:uppercase;color:var(--gold,#FBAC27);padding-bottom:calc(var(--k,1.4)*14px)">DAYS TO GO</div>` +
    `</div></div>` +
    fixturePanel(";width:100%") +
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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Season launch sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
