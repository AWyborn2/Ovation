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

// C20 — Club Leaders · Wickets (clubLeaderboard · Wickets preset). Leading
// wicket-taker for every grade, one card. Same layout as C19 — see
// club-leaderboard-runs.ts for the full transcription notes (one fluid bundle
// layout with sponsors-only `<sc-if>` branches, authored shared, dropped
// sponsor strip, omitted `hashtags` key, whole-{{title}} gold treatment,
// gradeSub added under the grade letter for repeat-contract parity).
//
// The only per-preset difference in the bundle markup is the title's display
// size (82px here vs the runs card's 84px — "WICKETS" is the longer word).

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
// Leader rows — transcribed from the bundle, reused by both formats
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

const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${HASHTAG_FOOTER_STORY}</div>`,
  );

const storyHtml = storyColumnRoot(
  logoStoryHeader("{{subtitle}}", "{{season}}") +
    `<div style="flex:none;padding-top:calc(var(--k,1.4)*14px)">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*82px);line-height:.82;text-transform:uppercase;color:var(--gold,#F5B21A)">{{title}}</div></div>` +
    leaderRows +
    storyFooters,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

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
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*82px);line-height:.82;text-transform:uppercase;color:var(--gold,#F5B21A);margin-top:10px">{{title}}</div></div>` +
    leaderRows +
    sharedFooterRow,
);

export const clubLeaderboardWickets: PackCardTemplate = {
  kind: "clubLeaderboard",
  designKey: "club-leaderboard-wickets",
  name: "Club Leaders — Wickets",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("category", "Category chip", "TOP WICKETS"),
    textField("season", "Season", "2025/26"),
    textField("subtitle", "Subtitle", "LEADING WICKET-TAKERS · BY GRADE"),
    textField("title", "Title", "CLUB WICKETS"),
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
        textField("playerName", "Leader", "Alex Osborne"),
        textField("value", "Value", "24"),
      ],
    },
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
