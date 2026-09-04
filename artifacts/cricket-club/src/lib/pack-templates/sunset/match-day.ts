import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  HASHTAG_FOOTER_SHARED,
  SPONSOR_STRIP_SHARED,
  STORY_BG,
  clubHeaderFields,
  glassPanel,
  logoField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// E2 — Match Day. Fixture announce: staggered head-to-head over the sunset
// sky, script flourish, glass GROUND · DATE · START panel.
//
// Field keys are deliberately a SUBSET of Broadcast Dark's match-day:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack. As in Packs B/C/D, note.title / note.body are unused (the
// bundle has no note block). Two further contract-driven departures:
//  - the bundle's story is photo-first (a full-bleed ground photo under the
//    scrims), but the matchDay kind has NO photo key in Broadcast Dark and the
//    extra-key allowlist covers only sunset-v1/matchSummary — the photo layer
//    is DROPPED and the story rides the pack's sunset wash, exactly what the
//    bundle's own drop-if-empty behaviour renders when no photo is bound
//    (match-result's scrims already prove they read correctly over the wash,
//    so the scrim layers are kept);
//  - the bundle's sponsors-off footer is the combined hashtag line, and the
//    matchDay kind has no clubHashtag key, so fragments'
//    HASHTAG_FOOTER_STORY ({{clubHashtag}}) cannot be used — a local footer
//    with the same styling binds {{hashtags}} instead.
//
// Header split: the bundle's story header tag is competition + round and its
// hero line is the day hype ("THIS SATURDAY") — one roundLabel key covers
// both, so the header tag takes the literal card label ("MATCH DAY", the same
// text the shared chip carries) and the hero Anton line binds {{roundLabel}}.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches).
// It is transcribed as the story with `--k` resolved at its 1.4 default into
// fixed px; the shared layout keeps the `calc(var(--k)*…)` sizes so portrait
// and square reflow, with Pack A's shared structure as the guide (the story's
// staggered/diagonal VS composition needs the 1920 canvas, so the shared VS
// row is level, as in every other pack).

/** `scriptText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function scriptFlex(content: string, px: number, extraStyle = ""): string {
  return scriptText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

// Cinematic scrim + accent horizon glow over the wash (bundle's match-day
// gradient stops; the photo layer between wash and scrims is dropped — see the
// module note).
const storyLayers =
  STORY_BG +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.72) 0%,rgba(8,10,14,.15) 24%,rgba(8,10,14,.12) 42%,rgba(8,10,14,.74) 70%,rgba(6,8,11,.97) 100%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`;

const GOLD_RING =
  "box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 60%, transparent),0 8px 30px rgba(0,0,0,.6)";
const WHITE_RING = "box-shadow:0 0 0 3px rgba(255,255,255,.3),0 8px 30px rgba(0,0,0,.6)";

function infoCell(label: string, value: string): string {
  return (
    `<div style="text-align:center"><div style="font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#F5B21A)">${label}</div>` +
    `<div style="font-weight:800;font-size:22px;color:#fff;margin-top:7px">${value}</div></div>`
  );
}

/** Frosted GROUND · DATE · START panel (identical bindings in both formats). */
function infoPanel(extraStyle: string): string {
  return glassPanel(
    infoCell("GROUND", "{{venue}}") +
      infoCell("DATE", "{{date}}") +
      infoCell("START", "{{startTime}}"),
    `;display:flex;align-items:center;justify-content:space-around${extraStyle}`,
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — staggered head-to-head, script flourish, glass panel
// ---------------------------------------------------------------------------

/** One side of the story's diagonal VS. The club's frame gets the gold ring. */
function storyTeamCol(side: "club" | "opposition", extraStyle: string): string {
  const mine = side === "club";
  const ring = mine ? GOLD_RING : WHITE_RING;
  const logoSlot = mine
    ? slot("clubLogo", "logo", "rounded", 20)
    : slot("opposition.logo", "logo", "rounded", 20);
  const name = mine ? "{{clubName}}" : "{{opposition.name}}";
  const tag = mine ? "{{homeAway}}" : "{{oppositionHomeAway}}";
  return (
    `<div style="flex:1;text-align:center${extraStyle}">` +
    `<div style="width:420px;height:420px;border-radius:20px;overflow:hidden;margin:0 auto;${ring}">${logoSlot}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:62px;color:#fff;margin-top:18px;text-transform:uppercase;text-shadow:0 3px 16px rgba(0,0,0,.8)">${name}</div>` +
    `<div style="margin-top:6px;font:600 50px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">${tag}</div></div>`
  );
}

// The bundle's story sponsor strip: bare logo plates, no label, 82px / 12px
// radius — transcribed locally (fragments' shared strip is 88px / 11px with a
// PROUDLY SUPPORTED BY label).
const sponsorStripStory =
  `<div style="flex:none;display:flex;gap:14px">` +
  [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:82px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.92)">${slot(`sponsor${n}`, "sponsor", "rounded", 12)}</div>`,
    )
    .join("") +
  `</div>`;

// Local sponsors-off footer binding {{hashtags}} — see the module note.
const hashtagFooterStory = `<div style="flex:none;text-align:center;font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.8)">{{hashtags}}</div>`;

const storyHtml = columnRoot(
  storyLayers,
  storyHeader("MATCH DAY") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center">` +
    `<div style="display:flex;align-items:flex-start;justify-content:center;gap:36px">` +
    storyTeamCol("club", "") +
    `<div style="flex:none;margin-top:266px;font-family:var(--disp,'Anton'),sans-serif;font-size:146px;line-height:1;color:var(--gold,#F5B21A);text-shadow:0 4px 22px rgba(0,0,0,.8)">VS</div>` +
    storyTeamCol("opposition", ";margin-top:252px") +
    `</div>` +
    `</div>` +
    `<div style="flex:none">` +
    scriptText("Match Day", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:84px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:2px">{{roundLabel}}</div>` +
    infoPanel(";margin-top:18px;padding:24px 28px") +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(sponsorStripStory) +
    sponsorsOff(hashtagFooterStory),
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait / square) — level VS row under the script flourish
// ---------------------------------------------------------------------------

/** One side of the shared VS row (level; `--k`-scaled frames). */
function sharedTeamCol(side: "club" | "opposition"): string {
  const mine = side === "club";
  const ring = mine ? GOLD_RING : WHITE_RING;
  const logoSlot = mine
    ? slot("clubLogo", "logo", "rounded", 20)
    : slot("opposition.logo", "logo", "rounded", 20);
  const name = mine ? "{{clubName}}" : "{{opposition.name}}";
  const tag = mine ? "{{homeAway}}" : "{{oppositionHomeAway}}";
  return (
    `<div style="flex:1;text-align:center">` +
    `<div style="width:calc(var(--k,1.4)*150px);height:calc(var(--k,1.4)*150px);border-radius:20px;overflow:hidden;margin:0 auto;background:rgba(255,255,255,.05);${ring}">${logoSlot}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*36px);color:#fff;margin-top:16px;text-transform:uppercase">${name}</div>` +
    `<div style="margin-top:8px;font:600 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.6)">${tag}</div></div>`
  );
}

const sharedHtml = sharedColumnRoot(
  sharedHeader("MATCH DAY", "{{roundLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;align-items:center;text-align:center;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:none">` +
    scriptFlex("Match Day", 48) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*44px);line-height:.9;text-transform:uppercase;margin-top:8px">{{roundLabel}}</div>` +
    `</div>` +
    `<div style="flex:none;width:100%;display:flex;align-items:center;justify-content:center;gap:calc(var(--k,1.4)*24px)">` +
    sharedTeamCol("club") +
    `<div style="flex:none;font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*64px);line-height:1;color:var(--gold,#FBAC27)">VS</div>` +
    sharedTeamCol("opposition") +
    `</div>` +
    infoPanel(";width:100%;padding:24px 28px") +
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
