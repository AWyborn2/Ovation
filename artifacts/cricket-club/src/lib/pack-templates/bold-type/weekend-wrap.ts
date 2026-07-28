import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  clubHeaderFields,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// C6 — Weekend Wrap. Every grade's result + top performers, four rows.
//
// The `matches` repeat contract is IDENTICAL to Broadcast Dark's weekend-wrap
// (same key, row fields and "lost" variant): `bindInput` emits rows per card
// KIND, choosing the alternate template via `variant: "lost"` — a pack with a
// different variant name would silently render every result in the won
// treatment. Bold Type's won/lost split is flat, true to the pack: no chip
// boxes, just the outcome word in gold (won) vs dim grey (lost).
//
// gradeLabel / gradeSub: `bindInput` splits the input's one grade string at
// the first token ("A GRADE" → "A" + "GRADE", "U15s" → "U15s" + ""). The
// bundle renders only the big letter — binding "A GRADE" whole would wrap and
// clip at display size — so the small mono `{{row.gradeSub}}` line is authored
// in under it (Pack A's stacked-block shape); it renders empty for
// single-token grades.
//
// The bundle ships this design as one fluid story branch; the story below is
// transcribed from it with `calc(var(--k,1.4)*…)` resolved at the story `--k`
// (84→118, 44→62, 94→132, 18→25, 22→31). The shared (portrait/square) layout
// is authored here following Broadcast Dark's weekend-wrap shared structure in
// Bold Type's language.
//
// The bundle's story also carries a three-logo sponsor strip, but Pack A's
// weekendWrap declares no `sponsor1..3` (teamList is the only kind with them),
// so the strip is dropped — the sponsors-on branch is the gold bar's
// "supported by {{sponsorPresentedBy}}" credit (real tenant data, same verb as
// Pack A's footer), swapping to `{{clubHashtag}}` when sponsors are off.
//
// Broadcast Dark also declares a `hashtags` field for this kind; this design's
// hashtag footers use `clubHashtag` (story) and `hashtagsExtra` (shared), so
// `hashtags` is deliberately not declared — a subset is allowed, an unused
// declaration is not.

/** Story background: the bundle row-cards' sheened flat block (see team-list.ts). */
const SHEEN_BG = `<div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,.05), transparent 24%), var(--block,#0E1C31)"></div>`;

/** Story root with the bundle row-cards' `60px 70px 54px` padding (see team-list.ts). */
function storyRoot(inner: string): string {
  return columnRoot(SHEEN_BG, inner, "60px 70px 54px");
}

/** Story header: small logo + gold mono left, dim mono right (see team-list.ts). */
function storyTopHeader(left: string, right: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:60px;height:60px;flex:none">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A)">${left}</div></div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);text-align:right">${right}</div>` +
    `</div>`
  );
}

/** Local gold footer bar pairing with this root's 70/54 padding (see team-list.ts). */
function goldBar(right: string): string {
  return (
    `<div style="background:var(--gold,#F5B21A);margin:0 -70px -54px;padding:30px 70px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
    `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>${right}</div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// The bundle's 4 hard-coded grade rows collapse into a base (won) template and
// a data-repeat-variant="lost" alternate. Rows are flex:1 in a
// justify-content:space-between column so fewer grades share the same list
// area. The only variant difference is the outcome word's colour — Bold Type
// has no chip shells.
function storyRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  const outcomeColour = variant === "lost" ? "rgba(255,255,255,.4)" : "var(--gold,#F5B21A)";
  return (
    `<div${variantAttr} style="flex:1;min-height:0;display:flex;align-items:center;gap:26px;border-bottom:2px solid rgba(255,255,255,.1)">` +
    `<div style="width:132px;flex:none"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:62px;line-height:.9;text-transform:uppercase;color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:5px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:24px;color:#fff;line-height:1.2">{{row.resultLine}}</div>` +
    `<div style="font:500 16px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.55);margin-top:6px">{{row.performers}}</div></div>` +
    `<div style="flex:none;font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:${outcomeColour}">{{row.outcome}}</div>` +
    `</div>`
  );
}

const storyHtml = storyRoot(
  storyTopHeader("WEEKEND WRAP · {{roundLabel}}", "{{dateRange}}") +
    `<div style="flex:none;padding-top:20px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:118px;line-height:.82;text-transform:uppercase;color:#fff">WEEKEND</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:118px;line-height:.82;text-transform:uppercase;color:var(--gold,#F5B21A)">WRAP</div>` +
    `</div>` +
    `<div data-repeat="matches" style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;margin-top:25px">${storyRow("won")}${storyRow("lost")}</div>` +
    `<div style="flex:none;margin-top:31px">` +
    goldBar(
      sponsorsOn(
        `<span style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.82">supported by {{sponsorPresentedBy}}</span>`,
      ) +
        sponsorsOff(
          `<span style="font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em">{{clubHashtag}}</span>`,
        ),
    ) +
    `</div>`,
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch. Structure follows Broadcast Dark's weekend-wrap shared
// layout (eyebrow + headline, flex:1 rows, hashtag/presented-by footer row),
// dressed in Bold Type: hairline rows, mono labels, flat outcome colours.
// ---------------------------------------------------------------------------

function sharedRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  const outcomeColour = variant === "lost" ? "rgba(255,255,255,.4)" : "var(--gold,#FBAC27)";
  return (
    `<div${variantAttr} style="flex:1;min-height:0;display:flex;align-items:center;gap:24px;border-bottom:2px solid rgba(255,255,255,.1)">` +
    `<div style="width:110px;flex:none"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:52px;line-height:.9;text-transform:uppercase;color:var(--gold,#FBAC27)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:800;font-size:26px;line-height:1.2">{{row.resultLine}}</div>` +
    `<div style="font:500 17px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.55);margin-top:5px">{{row.performers}}</div></div>` +
    `<div style="flex:none;font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:${outcomeColour}">{{row.outcome}}</div>` +
    `</div>`
  );
}

/** Shared footer row: club hashtag left; supported-by / secondary hashtag right. */
const sharedFooter =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font:700 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font:500 20px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.5)">supported by <span style="color:var(--gold,#FBAC27);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("WEEKEND WRAP", "{{roundLabel}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{roundLabel}} · {{dateRange}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:.82;text-transform:uppercase;margin-top:12px">WEEKEND <span style="color:var(--gold,#FBAC27)">WRAP</span></div>` +
    `</div>` +
    `<div data-repeat="matches" style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;margin-top:calc(var(--k,1.4)*18px)">${sharedRow("won")}${sharedRow("lost")}</div>` +
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
