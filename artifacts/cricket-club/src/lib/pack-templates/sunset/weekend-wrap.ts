import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  clubHeaderFields,
  repeatField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// E6 — Weekend Wrap. Every grade's result + top performers, four rows.
//
// The `matches` repeat contract is IDENTICAL to Broadcast Dark's weekend-wrap
// (same key, row fields and "lost" variant): `bindInput` emits rows per card
// KIND, choosing the alternate template via `variant: "lost"` — a pack with a
// different variant name would silently render every result in the won
// treatment. Sunset's won/lost split is flat, true to the pack's soft glass:
// no chip shells, just the outcome word in gold (won) vs dim grey (lost).
//
// gradeLabel / gradeSub: `bindInput` splits the input's one grade string at
// the first token ("A GRADE" → "A" + "GRADE", "U15s" → "U15s" + ""). The
// bundle stacks both — the big accent Anton token over the small mono
// `{{row.gradeSub}}` line — so both render; the sub line is empty for
// single-token grades.
//
// The bundle ships this design as one fluid story branch; the story below is
// transcribed from it with `calc(var(--k,1.4)*…)` resolved at the story `--k`
// (10→14, 56→78, 16→22, 44→62, 14→20). The shared (portrait/square) layout is
// authored here following Broadcast Dark's weekend-wrap shared structure in
// Sunset's language: frosted glass rows, script headline, gold grade tokens.
//
// The bundle's story also carries a three-logo sponsor strip, but Pack A's
// weekendWrap declares no `sponsor1..3` (teamList is the only kind with them),
// so the strip is dropped — the sponsors-on branch is a "supported by
// {{sponsorPresentedBy}}" line (Pack A's verb for this kind) in the fragments'
// PRESENTED_BY_STORY treatment (white sponsor name over the warm wash), and
// the sponsors-off branch keeps the bundle's gold `{{hashtags}}` line (a key
// Pack A declares for this kind).

/** Story header: the row cards' 84px logo header (see team-list.ts). */
function storyTopHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:16px">` +
    `<div style="width:84px;height:84px;border-radius:50%;overflow:hidden">${CLUB_LOGO_SLOT}</div>` +
    `<div><div style="font-weight:800;font-size:28px;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,.7)">{{clubName}}</div>` +
    `<div style="font:500 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.72);margin-top:6px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="font:700 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#F5B21A);text-align:right;text-shadow:0 2px 10px rgba(0,0,0,.85);max-width:300px">${tag}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// The bundle's 4 hard-coded grade rows collapse into a base (won) template and
// a data-repeat-variant="lost" alternate. Each row is the pack's glass panel
// (the `glassPanel` declarations inlined — the fragment helper can't carry the
// variant attribute) at flex:1, so fewer grades share the same list area. The
// only variant difference is the outcome word's colour — gold vs dim grey.
function storyRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  const outcomeColour = variant === "lost" ? "rgba(255,255,255,.4)" : "var(--gold,#F5B21A)";
  return (
    `<div${variantAttr} style="flex:1;min-height:0;display:flex;align-items:center;gap:22px;background:rgba(10,12,16,.62);border:1px solid rgba(255,255,255,.14);border-radius:20px;backdrop-filter:blur(9px);padding:0 26px">` +
    `<div style="width:88px;flex:none;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:62px;color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:23px;line-height:1.2;color:#fff">{{row.resultLine}}</div>` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.55);margin-top:5px">{{row.performers}}</div></div>` +
    `<div style="flex:none;font:700 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:${outcomeColour}">{{row.outcome}}</div>` +
    `</div>`
  );
}

// Footer lines carry the row cards' 20px top margin themselves — the sponsors
// wrappers are display:contents (see team-list.ts).
const storySupportedBy = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55);text-shadow:0 2px 10px rgba(0,0,0,.8);margin-top:20px">supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;

const storyHashtagFooter = `<div style="flex:none;text-align:center;font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);margin-top:20px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{hashtags}}</div>`;

// Header tag: the bundle sets "ROUND 3 · 8–9 NOV" — both fields, unlike Pack
// A's story which keeps `dateRange` for the eyebrow. The bundle's nested
// rows wrapper (a flex column holding the gap:16px column) flattens into the
// single data-repeat container; its calc margin resolves to 22px.
const storyHtml = storyColumnRoot(
  storyTopHeader("{{roundLabel}} · {{dateRange}}") +
    `<div style="flex:none;margin-top:14px">` +
    scriptText("Weekend Wrap", 78) +
    `</div>` +
    `<div data-repeat="matches" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:22px">${storyRow("won")}${storyRow("lost")}</div>` +
    sponsorsOn(storySupportedBy) +
    sponsorsOff(storyHashtagFooter),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch. Structure follows Broadcast Dark's weekend-wrap shared
// layout (eyebrow + headline, flex:1 rows, hashtag/presented-by footer row),
// dressed in Sunset: frosted glass rows, script headline, flat gold outcomes.
// ---------------------------------------------------------------------------

function sharedRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  const outcomeColour = variant === "lost" ? "rgba(255,255,255,.4)" : "var(--gold,#FBAC27)";
  return (
    `<div${variantAttr} style="flex:1;min-height:0;display:flex;align-items:center;gap:24px;background:rgba(10,12,16,.62);border:1px solid rgba(255,255,255,.14);border-radius:20px;backdrop-filter:blur(9px);padding:0 26px">` +
    `<div style="width:110px;flex:none;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:52px;color:var(--gold,#FBAC27)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:26px;line-height:1.2">{{row.resultLine}}</div>` +
    `<div style="font:500 17px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.55);margin-top:5px">{{row.performers}}</div></div>` +
    `<div style="flex:none;font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:${outcomeColour}">{{row.outcome}}</div>` +
    `</div>`
  );
}

/** Shared footer row: club hashtag left; supported-by / secondary hashtag right. */
const sharedFooter =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">supported by <span style="color:var(--gold,#FBAC27);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("WEEKEND WRAP", "{{roundLabel}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{roundLabel}} · {{dateRange}}</div>` +
    // extraStyle re-declares font-size so the headline flexes with --k (the
    // later declaration wins; scriptText's fixed px is story-oriented).
    scriptText("Weekend Wrap", 56, ";font-size:calc(var(--k,1.4)*56px);margin-top:10px") +
    `</div>` +
    `<div data-repeat="matches" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:calc(var(--k,1.4)*18px)">${sharedRow("won")}${sharedRow("lost")}</div>` +
    sharedFooter,
);

export const weekendWrap: PackCardTemplate = {
  kind: "weekendWrap",
  designKey: "weekend-wrap",
  name: "Weekend Wrap",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("roundLabel", "Round label", "ROUND 3"),
    textField("dateRange", "Date range", "8–9 NOVEMBER"),
    repeatField("matches", "Per-grade result rows", "4 grade results"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("hashtagsExtra", "Secondary hashtag", "#YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  repeats: [
    {
      key: "matches",
      maxRows: 4,
      variants: ["lost"],
      fields: [
        textField("gradeLabel", "Grade", "A"),
        textField("gradeSub", "Grade sub-label", "GRADE"),
        textField("resultLine", "Result line", "Your Club 2/102 d. R'ham Hornets 9/97"),
        textField("performers", "Top performers", "J. Manuel 39* · A. Osborne 3/13"),
        textField("outcome", "Outcome", "WON"),
      ],
    },
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
