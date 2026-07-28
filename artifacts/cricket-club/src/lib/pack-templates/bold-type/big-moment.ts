import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  outlineText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// C8 — Big Moment (live). In-play hit — fifty / century / wicket with the
// live score on a hard hairline row.
//
// Field keys are a SUBSET of Broadcast Dark's big-moment: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack ({{hashtagsExtra}} is
// the one reference key with no home in this composition). The reference
// design declares NO photo key for this kind, so the bundle's action-photo
// frame is dropped entirely; the story becomes pure typography — the moment
// hero and the score row split the column, which is exactly the pack's brief.
// With the photo gone the moment label takes the pack's signature outline
// treatment at poster size, standing in for the image the same way
// match-result's result line does.
//
// The bundle's structured literals bind to Pack A's composed fields at field
// granularity: the "50 (41) · 6 fours · 1 six" line becomes
// {{runs}} ({{balls}}) · {{boundaryDetail}}; the score row's four corners bind
// {{liveScore}} / {{inningsLabel}} left and {{equation}} / {{oversChaseLine}}
// right (the bundle's "NEED 48 FROM 34" and "CHASING 176" halves).
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "bigMoment" does not declare — replaced with the
// pack's gold-bar presented-by footer; sponsors-off comes from the fragments.
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in and normalised onto storyColumnRoot/storyHeader (no header logo —
// the club logo binds in the shared header). The bundle's header carried
// "LIVE · vs MARINERS" left; that moves into storyHeader's tag slot as
// "LIVE · vs {{oppositionName}}". The shared layout is authored from Pack A's
// shared structure (hero over score panel) in Bold Type's language.

/** Bundle score row: hard 2px hairline, score + innings left, chase right. */
function scoreRow(scoreSize: string, padTop: string): string {
  return (
    `<div style="display:flex;align-items:flex-end;gap:24px;border-top:2px solid rgba(255,255,255,.16);padding-top:${padTop}">` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${scoreSize};line-height:.85;color:#fff">{{liveScore}}</div>` +
    `<div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:8px;text-transform:uppercase">{{inningsLabel}}</div></div>` +
    `<div style="flex:1;text-align:right"><div style="font-weight:800;font-size:26px;color:var(--gold,#F5B21A);text-transform:uppercase">{{equation}}</div>` +
    `<div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:6px;text-transform:uppercase">{{oversChaseLine}}</div></div></div>`
  );
}

/** Shared sponsors-on footer: hashtag left, live-scoring credit right. */
const SHARED_FOOTER_ON =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6)">live scoring by {{sponsorPresentedBy}}</div>` +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — outlined moment hero over the live-score hairline row
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("LIVE · vs {{oppositionName}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;margin-top:22px">` +
    `<div>` +
    outlineText("{{momentLabel}}", 230, ";line-height:.82") +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:76px;color:var(--gold,#F5B21A);text-transform:uppercase;margin-top:20px">{{playerName}}</div>` +
    `<div style="font-weight:700;font-size:24px;color:#fff;margin-top:14px">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:19px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    `</div>` +
    scoreRow("101px", "34px") +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: gold moment hero over the score row
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("LIVE", "vs {{oppositionName}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*140px);line-height:.82;text-transform:uppercase;color:var(--gold,#FBAC27)">{{momentLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);color:#fff;text-transform:uppercase;margin-top:calc(var(--k,1.4)*12px)">{{playerName}}</div>` +
    `<div style="font-weight:700;font-size:24px;color:#fff;margin-top:12px">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:19px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    `</div>` +
    scoreRow("calc(var(--k,1.4)*72px)", "calc(var(--k,1.4)*20px)") +
    `</div>` +
    sponsorsOn(SHARED_FOOTER_ON) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

export const bigMoment: PackCardTemplate = {
  kind: "bigMoment",
  designKey: "big-moment",
  name: "Big Moment · Live",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("oppositionName", "Opposition name", "MARINERS"),
    textField("momentLabel", "Moment label", "FIFTY!"),
    textField("playerName", "Player name", "JACK MANUEL"),
    textField("runs", "Runs", "50"),
    textField("balls", "Balls faced", "41"),
    textField("boundaryDetail", "Boundary detail", "6 fours · 1 six"),
    textField("inningsLabel", "Innings label", "YOUR CLUB · 2ND INNINGS"),
    textField("liveScore", "Live score", "2/128"),
    textField("oversChaseLine", "Overs / chase line", "14.2 overs · chasing 176"),
    textField("equation", "Equation", "Need 48 from 34 balls"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · LIVE UPDATES"),
    textField("sponsorPresentedBy", "Live scoring sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
