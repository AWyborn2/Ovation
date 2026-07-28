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

// D6 — Weekend Wrap. Every grade's result + top performers, four rows.
//
// The `matches` repeat contract is IDENTICAL to Broadcast Dark's weekend-wrap
// (same key, row fields and "lost" variant): `bindInput` emits rows per card
// KIND, choosing the alternate template via `variant: "lost"` — a pack with a
// different variant name would silently render every result in the won
// treatment. Neon Night's won/lost split is glow vs no-glow: the outcome word
// in glowing cyan mono (won) vs dim grey with the shadow off (lost) — no chip
// shells, the glass row panel is the shell.
//
// gradeLabel / gradeSub: `bindInput` splits the input's one grade string at
// the first token ("A GRADE" → "A" + "GRADE", "U15s" → "U15s" + ""). The
// bundle stacks both — the big accent-glow token over the small mono
// `{{row.gradeSub}}` line — so both render; the sub line is empty for
// single-token grades.
//
// The bundle ships this design as one fluid story branch; the story below is
// transcribed from it with `calc(var(--k,1.4)*…)` resolved at the story `--k`
// (80→112, 44→62, 8→11, 18→25, 16→22). The shared (portrait/square) layout is
// authored here following Broadcast Dark's weekend-wrap shared structure in
// Neon Night's language.
//
// The bundle's story also carries a three-logo sponsor strip, but Pack A's
// weekendWrap declares no `sponsor1..3` (teamList is the only kind with them),
// so the strip is dropped — the sponsors-on branch is a "supported by
// {{sponsorPresentedBy}}" line (Pack A's verb for this kind) in the fragments'
// PRESENTED_BY_STORY treatment, and the sponsors-off branch keeps the bundle's
// glowing cyan `{{hashtags}}` line (a key Pack A declares for this kind).

/** Story background: the row-cards' static-orb night field (see team-list.ts). */
const ROW_STORY_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 28%, var(--surface-top,#0d2138) 0%, var(--ink,#081426) 45%, var(--surface-deep,#04070d) 100%)"></div>` +
  `<div style="position:absolute;top:-120px;left:-120px;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(55,207,230,.30),transparent 62%);filter:blur(42px)"></div>` +
  `<div style="position:absolute;bottom:-160px;right:-140px;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb, var(--gold,#FBAC27) 24%, transparent),transparent 62%);filter:blur(48px)"></div>`;

/** Story root with the bundle row-cards' `60px 70px 54px` padding (see team-list.ts). */
function storyRoot(inner: string): string {
  return columnRoot(ROW_STORY_BG, inner, "60px 70px 54px");
}

/** Story header: glow-ring logo + name/tagline left, cyan eyebrow right (see team-list.ts). */
function storyTopHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:86px;height:86px;border-radius:50%;overflow:hidden;box-shadow:0 0 24px rgba(55,207,230,.5),0 0 0 2px rgba(55,207,230,.5)">${CLUB_LOGO_SLOT}</div>` +
    `<div><div style="font-weight:800;font-size:29px;line-height:1.05">{{clubName}}</div>` +
    `<div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.5);margin-top:6px">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="font:700 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.9);text-align:right;max-width:300px">◍ ${tag}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// The bundle's 4 hard-coded grade rows collapse into a base (won) template and
// a data-repeat-variant="lost" alternate. Rows are flex:1 glass panels in a
// gap:16px column so fewer grades share the same list area. The grade token
// glows in the tenant accent (the bundle's gold-glow treatment); the only
// variant difference is the outcome word — cyan glow vs dim, shadow off.
function storyRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  const outcome =
    variant === "lost"
      ? `<div style="flex:none;font:700 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.4)">{{row.outcome}}</div>`
      : `<div style="flex:none;font:700 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#37CFE6;text-shadow:0 0 14px rgba(55,207,230,.7)">{{row.outcome}}</div>`;
  return (
    `<div${variantAttr} style="flex:1;min-height:0;display:flex;align-items:center;gap:22px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:24px;backdrop-filter:blur(6px);padding:0 26px">` +
    `<div style="width:88px;flex:none;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:62px;line-height:.9;text-transform:uppercase;color:var(--gold,#F5B21A);text-shadow:0 0 30px color-mix(in srgb, var(--gold,#FBAC27) 75%, transparent),0 0 66px color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:23px;line-height:1.2;color:#fff">{{row.resultLine}}</div>` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.55);margin-top:5px">{{row.performers}}</div></div>` +
    outcome +
    `</div>`
  );
}

// Footer lines carry the row-cards' 22px top margin themselves — the
// sponsors wrappers are display:contents (see team-list.ts).
const storySupportedBy = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5);margin-top:22px">supported by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;

const storyHashtagFooter = `<div style="flex:none;text-align:center;font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.8);margin-top:22px">{{hashtags}}</div>`;

// The bundle story has no dateRange slot (the eyebrow is "WEEKEND WRAP · RD 3")
// — the field renders in the shared layout's eyebrow only, as in Pack B.
const storyHtml = storyRoot(
  storyTopHeader("WEEKEND WRAP · {{roundLabel}}") +
    `<div style="flex:none;text-align:center;padding-top:11px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:112px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 0 30px rgba(55,207,230,.7),0 0 62px rgba(55,207,230,.42)">WEEKEND WRAP</div>` +
    `</div>` +
    `<div data-repeat="matches" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:25px">${storyRow("won")}${storyRow("lost")}</div>` +
    sponsorsOn(storySupportedBy) +
    sponsorsOff(storyHashtagFooter),
);

// ---------------------------------------------------------------------------
// Shared (portrait 1080×1350 / square 1080×1080) — authored; the bundle has no
// non-story branch. Structure follows Broadcast Dark's weekend-wrap shared
// layout (eyebrow + headline, flex:1 rows, hashtag/presented-by footer row),
// dressed in Neon Night: glass rows, accent-glow grade tokens, glow outcomes.
// ---------------------------------------------------------------------------

function sharedRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  const outcome =
    variant === "lost"
      ? `<div style="flex:none;font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:rgba(255,255,255,.4)">{{row.outcome}}</div>`
      : `<div style="flex:none;font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#37CFE6;text-shadow:0 0 14px rgba(55,207,230,.7)">{{row.outcome}}</div>`;
  return (
    `<div${variantAttr} style="flex:1;min-height:0;display:flex;align-items:center;gap:24px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:20px;backdrop-filter:blur(6px);padding:0 26px">` +
    `<div style="width:110px;flex:none;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:52px;line-height:.9;text-transform:uppercase;color:var(--gold,#FBAC27);text-shadow:0 0 30px color-mix(in srgb, var(--gold,#FBAC27) 75%, transparent),0 0 66px color-mix(in srgb, var(--gold,#FBAC27) 45%, transparent)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:26px;line-height:1.2">{{row.resultLine}}</div>` +
    `<div style="font:500 17px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.55);margin-top:5px">{{row.performers}}</div></div>` +
    outcome +
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
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*80px);line-height:.9;text-transform:uppercase;margin-top:12px">WEEKEND <span style="color:var(--gold,#FBAC27)">WRAP</span></div>` +
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
