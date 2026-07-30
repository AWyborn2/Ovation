import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  FOIL_RAMP,
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  STORY_BG,
  clubHeaderFields,
  foilText,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// B6 — Weekend Wrap. Every grade's result + top performers, four rows.
//
// The `matches` repeat contract is IDENTICAL to Broadcast Dark's weekend-wrap
// (same key, row fields and "lost" variant): `bindInput` emits rows per card
// KIND, choosing the red-chip template via `variant: "lost"` — a pack with a
// different variant name would silently render every result green.
//
// The bundle ships this design story-only; the story below is transcribed from
// it, the shared (portrait/square) layout is authored here following Broadcast
// Dark's weekend-wrap shared structure in Gold Foil's visual language.
//
// Broadcast Dark declares a `hashtags` field for this kind too; this design's
// two hashtag footers use `clubHashtag` (story) and `hashtagsExtra` (shared),
// so `hashtags` is deliberately not declared — a subset is allowed, an unused
// declaration is not.

/** Static foil ramp for the big grade letter (see team-list.ts for context). */
const FOIL_SPAN =
  `font-family:var(--disp,'Anton'),sans-serif;` +
  `background:${FOIL_RAMP};` +
  `-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;` +
  `filter:drop-shadow(0 3px 12px rgba(0,0,0,.55))`;

/** Story root with the bundle's `60px 70px 54px` padding (see team-list.ts). */
function storyRoot(inner: string): string {
  return columnRoot(STORY_BG, inner, "60px 70px 54px");
}

/** Story header: logo over tracked-caps club name + gold-ruled tag line. */
function storyTopHeader(tag: string): string {
  return (
    `<div style="flex:none;text-align:center">` +
    `<div style="width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font:600 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;color:rgba(255,255,255,.6)">{{clubName}}</div>` +
    `<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-top:15px">` +
    `<span style="width:90px;height:1px;background:linear-gradient(90deg,transparent,var(--gold,#F5B21A))"></span>` +
    `<span style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#F5B21A)">${tag}</span>` +
    `<span style="width:90px;height:1px;background:linear-gradient(90deg,var(--gold,#F5B21A),transparent)"></span>` +
    `</div></div>`
  );
}

/** WON (green) / LOST (red) outcome chip — colours shared with Broadcast Dark. */
function outcomeChip(variant: "won" | "lost", fontSize: number): string {
  return variant === "lost"
    ? `<div style="flex:none;font:700 ${fontSize}px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#F0888C;background:rgba(226,59,59,.15);border:1px solid rgba(226,59,59,.4);border-radius:8px;padding:9px 13px">{{row.outcome}}</div>`
    : `<div style="flex:none;font:700 ${fontSize}px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#5FD39B;background:rgba(47,158,107,.16);border:1px solid rgba(47,158,107,.4);border-radius:8px;padding:9px 13px">{{row.outcome}}</div>`;
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// The bundle's 4 hard-coded grade rows collapse into a base (won) template and
// a data-repeat-variant="lost" alternate. Rows are flex:1 so they share the
// list area evenly however many grades played. The foil grade letter is the
// bundle's calc(var(--k,1.4)*50px) resolved at the story --k (→70px).
function storyRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  return (
    `<div${variantAttr} style="flex:1;min-height:0;display:flex;align-items:center;gap:24px;background:linear-gradient(90deg,rgba(255,255,255,.05),transparent);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:0 28px">` +
    `<div style="width:92px;flex:none;text-align:center"><div style="${FOIL_SPAN};font-size:70px;line-height:.85;text-transform:uppercase">{{row.gradeLabel}}</div><div style="font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:25px;line-height:1.2;color:#fff">{{row.resultLine}}</div><div style="font-weight:500;font-size:17px;color:rgba(255,255,255,.6);margin-top:5px">{{row.performers}}</div></div>` +
    outcomeChip(variant, 15) +
    `</div>`
  );
}

const storyHtml = storyRoot(
  storyTopHeader("WEEKEND WRAP · {{roundLabel}}") +
    `<div style="flex:none;text-align:center;margin-top:11px">${foilText("WEEKEND WRAP", 115)}</div>` +
    `<div data-repeat="matches" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin:25px 0 20px">${storyRow("won")}${storyRow("lost")}</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch. Structure follows Broadcast Dark's weekend-wrap shared
// layout (eyebrow + headline, flex:1 rows, hashtag/presented-by footer row),
// dressed in Gold Foil.
// ---------------------------------------------------------------------------

function sharedRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  return (
    `<div${variantAttr} style="flex:1;min-height:0;display:flex;align-items:center;gap:24px;background:linear-gradient(90deg,rgba(255,255,255,.05),transparent);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:0 26px">` +
    `<div style="width:110px;flex:none;text-align:center"><div style="${FOIL_SPAN};font-size:52px;line-height:.85;text-transform:uppercase">{{row.gradeLabel}}</div><div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:26px;line-height:1.2">{{row.resultLine}}</div><div style="font-weight:500;font-size:18px;color:rgba(255,255,255,.6);margin-top:5px">{{row.performers}}</div></div>` +
    outcomeChip(variant, 16) +
    `</div>`
  );
}

/** Shared footer row: club hashtag left; presented-by / secondary hashtag right. */
const sharedFooter =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:var(--gold,#FBAC27);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
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
    // later declaration wins; foilText's fixed px is story-oriented).
    foilText("WEEKEND WRAP", 96, ";font-size:calc(var(--k,1.4)*96px);margin-top:12px") +
    `</div>` +
    `<div data-repeat="matches" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:calc(var(--k,1.4)*20px)">${sharedRow("won")}${sharedRow("lost")}</div>` +
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
