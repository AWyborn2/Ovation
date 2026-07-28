import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  SPONSOR_STRIP_SHARED,
  clubHeaderFields,
  logoField,
  neonText,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// D2 — Match Day. Fixture announce: glass head-to-head rows, neon VS divider,
// GROUND · DATE · START glass panel.
//
// Field keys are deliberately a SUBSET of Broadcast Dark's match-day:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack. The bundle has no note.title / note.body block, so those two
// Pack A keys simply are not used here.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches —
// verified in the markup, which has a single `--ch`-height root). As for Packs
// B and C, it is transcribed as the story with `--k` resolved at its 1.4
// default into fixed px; the shared layout keeps the `calc(var(--k)*…)` sizes
// so portrait and square reflow, with Pack A's shared structure as the guide.

/** `neonText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function neonFlex(
  content: string,
  px: number,
  glow: "cyan" | "gold" = "cyan",
  extraStyle = "",
): string {
  return neonText(content, px, glow, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

// ---------------------------------------------------------------------------
// Head-to-head rows, VS divider, fixture info panel
// ---------------------------------------------------------------------------

/**
 * One side of the fixture as a glass row. The club's own row gets the accent
 * glass (gold-tinted fill, ring and glow); the opposition rides the plain
 * glass panel with the cyan floodlight ring.
 */
function teamRow(side: "club" | "opposition", flex: boolean): string {
  const mine = side === "club";
  const shell = mine
    ? `background:color-mix(in srgb, var(--gold,#FBAC27) 10%, transparent);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent);box-shadow:0 0 50px -12px color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent)`
    : `background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16)`;
  const ring = mine
    ? "0 0 0 2px color-mix(in srgb, var(--gold,#FBAC27) 55%, transparent)"
    : "0 0 0 2px rgba(55,207,230,.5)";
  const logoSlot = mine
    ? slot("clubLogo", "logo", "rounded", 14)
    : slot("opposition.logo", "logo", "rounded", 14);
  const name = mine ? "{{clubName}}" : "{{opposition.name}}";
  const tag = mine ? "{{homeAway}}" : "{{oppositionHomeAway}}";
  const glow = mine ? "gold" : "cyan";
  const nameHtml = flex
    ? neonFlex(name, 52, glow, ";line-height:.9")
    : neonText(name, 73, glow, ";line-height:.9");
  return (
    `<div style="flex:none;display:flex;align-items:center;gap:24px;${shell};border-radius:20px;backdrop-filter:blur(6px);padding:22px 30px">` +
    `<div style="width:74px;height:74px;flex:none;border-radius:14px;overflow:hidden;box-shadow:${ring}">${logoSlot}</div>` +
    `<div style="flex:1;min-width:0">${nameHtml}</div>` +
    `<div style="flex:none;font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5)">${tag}</div></div>`
  );
}

/** Neon VS between two cyan hairlines. */
function vsDivider(flex: boolean): string {
  const vs = flex
    ? neonFlex("VS", 66, "cyan", ";flex:none;line-height:.9")
    : neonText("VS", 92, "cyan", ";flex:none;line-height:.9");
  return (
    `<div style="display:flex;align-items:center;gap:22px">` +
    `<div style="flex:1;height:1px;background:rgba(55,207,230,.3)"></div>` +
    vs +
    `<div style="flex:1;height:1px;background:rgba(55,207,230,.3)"></div></div>`
  );
}

function infoCell(label: string, value: string): string {
  return (
    `<div><div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7)">${label}</div>` +
    `<div style="font-weight:800;font-size:26px;color:#fff;margin-top:8px">${value}</div></div>`
  );
}

const INFO_DIVIDER = `<span style="width:1px;height:46px;background:rgba(255,255,255,.18)"></span>`;

/** Glass GROUND · DATE · START panel with glowing cyan labels. */
function infoPanel(flex: boolean): string {
  const mt = flex ? "calc(var(--k,1.4)*6px)" : "8px";
  return (
    `<div style="flex:none;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:20px;backdrop-filter:blur(6px);padding:26px 30px;display:flex;align-items:center;justify-content:space-around;margin-top:${mt}">` +
    infoCell("GROUND", "{{venue}}") +
    INFO_DIVIDER +
    infoCell("DATE", "{{date}}") +
    INFO_DIVIDER +
    infoCell("START", "{{startTime}}") +
    `</div>`
  );
}

/** The centred fixture stack; sizes swap between fixed px and `--k` calcs. */
function middle(flex: boolean): string {
  const gap = flex ? "calc(var(--k,1.4)*18px)" : "25px";
  const pt = flex ? "calc(var(--k,1.4)*8px)" : "11px";
  return (
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:${gap};padding-top:${pt};margin-bottom:22px">` +
    teamRow("club", flex) +
    vsDivider(flex) +
    teamRow("opposition", flex) +
    infoPanel(flex) +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

// The bundle's story sponsor strip: 14px radius plates on near-white glass —
// transcribed locally rather than bending SPONSOR_STRIP_SHARED's 11px one.
const sponsorStripStory =
  `<div style="flex:none"><div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.4);margin-bottom:12px">PROUDLY SUPPORTED BY</div>` +
  `<div style="display:flex;gap:14px">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:88px;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.94)">${slot(`sponsor${n}`, "sponsor", "rounded", 14)}</div>`,
    )
    .join("") +
  `</div></div>`;

const storyHtml = storyColumnRoot(
  storyHeader("{{roundLabel}}") +
    middle(false) +
    sponsorsOn(sponsorStripStory) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("MATCH DAY", "{{roundLabel}}") +
    middle(true) +
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
