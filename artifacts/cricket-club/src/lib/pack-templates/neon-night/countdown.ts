import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  glassPanel,
  neonText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// D10 — Countdown. Hype / countdown to the season opener or finals: cyan hype
// line, the huge gold-glow day count, glass fixture panel.
//
// Field keys are a SUBSET of Broadcast Dark's countdown — `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. Note the countdown kind
// has NO sponsor1–3 keys: the bundle's three-logo strip is therefore replaced
// by the presented-by line in both formats (the strip's slots would be new
// keys, which the parity test forbids). Pack B made the same call.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches —
// verified in the markup). It is transcribed as the story with `--k` resolved
// at its 1.4 default into fixed px; the shared layout keeps the
// `calc(var(--k)*…)` sizes so portrait and square reflow.
//
// The bundle's single hype line "NEW SEASON · SAME HUNGER" binds as the two
// Pack A hype keys joined by the same interpunct (Pack A stacks them instead).

/** `neonText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function neonFlex(
  content: string,
  px: number,
  glow: "cyan" | "gold" = "cyan",
  extraStyle = "",
): string {
  return neonText(content, px, glow, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/** Glass fixture panel: date/venue headline over the fixture line. */
const FIXTURE_PANEL = glassPanel(
  `<div style="font-weight:800;font-size:30px;color:#fff">{{dateVenue}}</div>` +
    `<div style="font-weight:500;font-size:21px;color:rgba(255,255,255,.72);margin-top:8px">{{fixtureLine}}</div>`,
  ";width:100%;padding:26px 30px",
);

/** Hype line, day count, fixture panel; sizes swap between fixed and calc. */
function middle(flex: boolean): string {
  const pt = flex ? "calc(var(--k,1.4)*12px)" : "17px";
  const hype = flex
    ? neonFlex("{{hypeLine1}} · {{hypeLine2}}", 50, "cyan", ";line-height:.9")
    : neonText("{{hypeLine1}} · {{hypeLine2}}", 70, "cyan", ";line-height:.9");
  const count = flex
    ? neonFlex("{{daysToGo}}", 230, "gold", ";line-height:.78")
    : neonText("{{daysToGo}}", 322, "gold", ";line-height:.78");
  const label = flex
    ? neonFlex("DAYS TO GO", 60, "cyan", ";line-height:.9")
    : neonText("DAYS TO GO", 84, "cyan", ";line-height:.9");
  return (
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:${pt};margin-bottom:22px">` +
    hype +
    `<div>${count}${label}</div>` +
    FIXTURE_PANEL +
    `</div>`
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

// PRESENTED_BY_STORY is layout-neutral (a centred flex:none line), so it
// serves the shared sponsors-on footer too — the countdown kind has no
// sponsor-strip keys to fill SPONSOR_STRIP_SHARED with.
const sharedHtml = sharedColumnRoot(
  sharedHeader("COUNTDOWN", "{{eventLabel}}") +
    middle(true) +
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
