import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// C19 — Club Leaders · Runs (clubLeaderboard · Runs preset). Leading
// run-scorer for every grade, one card. C20 is the Wickets preset.
//
// The bundle ships ONE fluid layout (sized by `--ch`/`--k`) — verified in the
// html: the only `<sc-if>` branches are sponsors on/off (this is the card the
// pack's SHARED_BG/gold-bar fragments were transcribed from; the
// isStoryFmt/isNotStory flags exist only in the DC script). Story below is the
// transcription; shared is authored from Pack A club-leaderboard-runs' shared
// structure (header chip/tag, subtitle/title block, the same repeat rows) in
// Bold Type's language.
//
// Field keys and the `leaders` repeat mirror Pack A EXACTLY, minus `hashtags`
// (a strict subset: Bold Type's story sponsors-off footer is the gold bar's
// single {{clubHashtag}}, and the shared sponsors-off slot binds
// {{hashtagsExtra}} as in Pack A, so nothing binds `hashtags`). The bundle's
// three-logo sponsor strip is dropped — Pack A's clubLeaderboard declares no
// sponsor1..3 keys — and the gold bar's "presented by {{sponsorPresentedBy}}"
// credit carries sponsors-on, as in Gold Foil.
//
// Field-granularity calls:
//  - the bundle's two-tone stacked title ("CLUB" white / "RUNS" gold) can't be
//    split out of the single {{title}} field, so the whole title takes the
//    emphatic half's treatment — solid gold display — the same whole-field
//    rule as match-result's outline result line;
//  - the bundle rows show only the grade letter, but the repeat mirrors Pack
//    A's four row keys, so a small mono {{row.gradeSub}} line is set under the
//    letter in the pack's label language (Pack A/Gold Foil place it the same
//    way) rather than dropping the key from the repeat contract.

// ---------------------------------------------------------------------------
// Story header — transcribed (this family differs from fragments'
// `storyHeader`, which has no logo slot). The club NAME is in the gold bar.
// ---------------------------------------------------------------------------

function logoStoryHeader(label: string, tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:60px;height:60px;flex:none">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A)">${label}</div></div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);text-align:right">${tag}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Leader rows — transcribed from the bundle, reused by both formats: hard 2px
// hairline-ruled rows, gold display grade letter, heavy caps name, white
// display value. (The bundle put the width on the letter div; here it wraps
// letter + the added gradeSub line so the gutter stays aligned.)
// ---------------------------------------------------------------------------

const leaderRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:28px;border-bottom:2px solid rgba(255,255,255,.1)">` +
  `<div style="width:calc(var(--k,1.4)*104px);flex:none">` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*48px);color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div>` +
  `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
  `<div style="flex:1;font-weight:800;font-size:calc(var(--k,1.4)*34px);color:#fff;text-transform:uppercase">{{row.playerName}}</div>` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);color:#fff">{{row.value}}</div>` +
  `</div>`;

const leaderRows = `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;margin-top:calc(var(--k,1.4)*18px)">${leaderRow}</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// Both variants are the full-bleed gold bar (the bundle swaps only the right
// span); bars cancel storyColumnRoot's canonical 80/80/70 story margins.
const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${HASHTAG_FOOTER_STORY}</div>`,
  );

// Bundle header label literal "LEADING RUN-SCORERS" → {{subtitle}} (as Gold
// Foil bound the same caption); tag "2025/26" → {{season}}.
const storyHtml = storyColumnRoot(
  logoStoryHeader("{{subtitle}}", "{{season}}") +
    `<div style="flex:none;padding-top:calc(var(--k,1.4)*14px)">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:.82;text-transform:uppercase;color:var(--gold,#F5B21A)">{{title}}</div></div>` +
    leaderRows +
    storyFooters,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

// Pack A's shared footer contract: club hashtag left; presented-by right when
// sponsors are on, the secondary hashtag when they are off.
const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font-weight:800;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.55)">presented by <span style="color:var(--gold,#F5B21A)">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("{{category}}", "{{season}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#FBAC27)">{{subtitle}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:.82;text-transform:uppercase;color:var(--gold,#F5B21A);margin-top:10px">{{title}}</div></div>` +
    leaderRows +
    sharedFooterRow,
);

export const clubLeaderboardRuns: PackCardTemplate = {
  kind: "clubLeaderboard",
  designKey: "club-leaderboard-runs",
  name: "Club Leaders — Runs",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("category", "Category chip", "TOP RUNS"),
    textField("season", "Season", "2025/26"),
    textField("subtitle", "Subtitle", "LEADING RUN-SCORERS · BY GRADE"),
    textField("title", "Title", "CLUB RUNS"),
    repeatField("leaders", "Per-grade leader rows", "4 grade leaders"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtagsExtra", "Secondary hashtag", "#YOURLEAGUE"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  repeats: [
    {
      key: "leaders",
      maxRows: 4,
      fields: [
        textField("gradeLabel", "Grade", "A"),
        textField("gradeSub", "Grade sub-label", "GRADE"),
        textField("playerName", "Leader", "Jack Manuel"),
        textField("value", "Value", "428"),
      ],
    },
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
