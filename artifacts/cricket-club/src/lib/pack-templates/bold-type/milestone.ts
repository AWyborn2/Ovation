import type { PackCardTemplate } from "../types";
import {
  clubHeaderFields,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// C5 — Milestone. Giant number with gold unit label, framed photo, tribute
// line.
//
// Field keys are IDENTICAL to Broadcast Dark's milestone: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack.
//
// Sponsors: like Pack A's A5 this card is ["on"]-only. The bundle's three-logo
// strip needed `sponsor1..3` keys the reference design for "milestone" does
// not declare, and its sponsors-off branch was the hashtag half of the gold
// bar — both replaced with Pack A's footer contract (presented-by only when
// sponsors are on; {{clubHashtag}} in the shared footer).
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in and normalised onto storyColumnRoot/storyHeader (no header logo —
// the club logo binds in the shared header). The bundle's header split the
// tier left and the milestone right; storyHeader has one tag slot, so the tag
// composes both ("CLUB MILESTONE · 100 GAMES"). The shared layout is authored
// from Pack A's shared structure (number + name column left, photo right) in
// Bold Type's language.

const STORY_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div></div>`;

const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:2px;overflow:hidden;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,12,22,.9)"></div></div>`;

/** ["on"]-variant gold bar: always anchors the story, credit conditional. */
const GOLD_BAR_STORY =
  `<div style="flex:none;background:var(--gold,#F5B21A);margin:0 -80px -70px;padding:30px 80px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
  `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>` +
  sponsorsOn(
    `<span style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.82">presented by {{sponsorPresentedBy}}</span>`,
  ) +
  `</div>`;

const SHARED_FOOTER =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6)">presented by {{sponsorPresentedBy}}</div>`,
  ) +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — giant number, framed photo, gold name + tribute
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("{{tierLabel}} · {{currentValue}} {{milestoneLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:22px;margin-top:22px">` +
    `<div style="display:flex;align-items:flex-end;gap:24px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:274px;line-height:.76;color:#fff">{{currentValue}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:98px;line-height:.9;color:var(--gold,#F5B21A);padding-bottom:20px">{{milestoneLabel}}</div></div>` +
    STORY_PHOTO +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:82px;color:var(--gold,#F5B21A);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:600;font-size:22px;line-height:1.4;color:rgba(255,255,255,.72);margin-top:10px;max-width:760px">{{headline}}</div></div>` +
    `</div>` +
    GOLD_BAR_STORY,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: number + name column left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("MILESTONE", "{{currentValue}} {{milestoneLabel}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;padding:calc(var(--k,1.4)*10px) 0">` +
    `<div style="flex:none"><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:var(--gold,#FBAC27)">{{tierLabel}}</div>` +
    `<div style="display:flex;align-items:flex-end;gap:20px;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*170px);line-height:.78;color:#fff">{{currentValue}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*60px);line-height:.9;color:var(--gold,#FBAC27);padding-bottom:calc(var(--k,1.4)*12px)">{{milestoneLabel}}</div></div></div>` +
    `<div style="flex:none"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);color:var(--gold,#FBAC27);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.4;color:rgba(255,255,255,.75);margin-top:12px;max-width:560px">{{headline}}</div></div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    SHARED_FOOTER,
);

export const milestone: PackCardTemplate = {
  kind: "milestone",
  designKey: "milestone",
  name: "Milestone",
  sponsorVariants: ["on"],
  fields: [
    ...clubHeaderFields(),
    textField("tierLabel", "Tier label", "CLUB MILESTONE"),
    textField("currentValue", "Milestone value", "100"),
    textField("milestoneLabel", "Milestone label", "GAMES"),
    textField("playerName", "Player name", "TIM MILES"),
    textField(
      "headline",
      "Tribute line",
      "100 Premier League games for the club. A true club great — thanks for every one, Milesy.",
    ),
    photoField("photo", "Player photo", "Player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
