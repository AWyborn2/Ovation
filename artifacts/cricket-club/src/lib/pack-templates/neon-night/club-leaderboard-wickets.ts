import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  STORY_BG,
  clubHeaderFields,
  glassPanel,
  neonText,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// D20 — Club Leaders · Wickets (clubLeaderboard · Wickets preset). Leading
// wicket-taker for every grade, one card. Same layout as D19 (see
// club-leaderboard-runs.ts for the transcription notes) with the category
// swapped and the bundle's slightly smaller neon headline (the longer "CLUB
// WICKETS" sets at 78px where "CLUB RUNS" sets at 84px).

// ---------------------------------------------------------------------------
// Leader row — transcribed from the bundle, reused by both formats
// (glassPanel matches the bundle row's fill/border/radius/blur verbatim).
// ---------------------------------------------------------------------------

const leaderRow = glassPanel(
  `<div style="width:100px;flex:none;text-align:center">` +
    neonText(
      "{{row.gradeLabel}}",
      54,
      "gold",
      ";font-size:calc(var(--k,1.4)*54px);line-height:.9",
    ) +
    `<div style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;font-weight:700;font-size:34px;color:#fff">{{row.playerName}}</div>` +
    neonText("{{row.value}}", 60, "cyan", ";font-size:calc(var(--k,1.4)*60px);line-height:.9"),
  ";flex:1;min-height:0;display:flex;align-items:center;gap:26px;padding:0 30px",
);

const leaderRows = `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:18px;margin-top:calc(var(--k,1.4)*18px)">${leaderRow}</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

function glowStoryHeader(tag: string): string {
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

const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*16px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*16px)">${HASHTAG_FOOTER_STORY}</div>`,
  );

const storyHtml = columnRoot(
  STORY_BG,
  glowStoryHeader("{{subtitle}}") +
    `<div style="flex:none;text-align:center;padding-top:calc(var(--k,1.4)*8px)">` +
    neonText("{{title}}", 78, "cyan", ";font-size:calc(var(--k,1.4)*78px);line-height:.9") +
    `</div>` +
    leaderRows +
    storyFooters,
  "60px 70px 54px",
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("{{category}}", "{{season}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{subtitle}}</div>` +
    neonText(
      "{{title}}",
      96,
      "cyan",
      ";font-size:calc(var(--k,1.4)*96px);line-height:.94;margin-top:10px",
    ) +
    `</div>` +
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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
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
