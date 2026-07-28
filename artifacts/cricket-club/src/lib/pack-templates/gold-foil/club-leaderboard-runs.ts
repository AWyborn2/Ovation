import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
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

// B19 — Club Leaders · Runs (clubLeaderboard · Runs preset). Leading
// run-scorer for every grade, one card. B20 is the Wickets preset.
//
// The bundle ships ONE fluid layout; the story format is the transcription and
// the shared format is authored from Pack A club-leaderboard-runs' shared
// structure (header chip/tag, subtitle/title block, the same repeat rows).
// Field keys and the `leaders` repeat mirror Pack A EXACTLY (R4 parity) — and
// the bundle's three-logo sponsor strip becomes the presented-by line because
// Pack A's clubLeaderboard declares no sponsor1..3 keys.

// ---------------------------------------------------------------------------
// Leader row — transcribed from the bundle, reused by both formats
// (foil grade letter + foil value flanking the leader's name).
// ---------------------------------------------------------------------------

const leaderRow =
  `<div style="flex:1;min-height:0;display:flex;align-items:center;gap:26px;background:linear-gradient(90deg,rgba(255,255,255,.05),transparent);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:0 32px">` +
  `<div style="width:104px;flex:none;text-align:center">` +
  foilText("{{row.gradeLabel}}", 56, ";font-size:calc(var(--k,1.4)*56px);line-height:.85") +
  `<div style="font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
  `<div style="flex:1;font-weight:700;font-size:38px;line-height:1.05;color:#fff">{{row.playerName}}</div>` +
  foilText("{{row.value}}", 70, ";font-size:calc(var(--k,1.4)*70px);line-height:.86") +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// Bundle story header: small centred club logo above the tracked-caps wordmark
// (differs from fragments' storyHeader, which has no logo slot). The bundle's
// tag literal was "LEADING RUN-SCORERS · 2025/26" — bound to {{subtitle}};
// {{season}} renders in the shared header tag, as in Pack A.
function centredStoryHeader(tag: string): string {
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

const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*14px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;text-align:center;font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:var(--gold,#F5B21A);margin-top:calc(var(--k,1.4)*14px)">{{hashtags}}</div>`,
  );

const storyHtml = columnRoot(
  STORY_BG,
  centredStoryHeader("{{subtitle}}") +
    `<div style="flex:none;text-align:center;margin-top:calc(var(--k,1.4)*8px)">` +
    foilText("{{title}}", 86, ";font-size:calc(var(--k,1.4)*86px);line-height:.86") +
    `</div>` +
    `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:18px;margin-top:calc(var(--k,1.4)*18px)">${leaderRow}</div>` +
    storyFooters,
  "60px 70px 54px",
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

// Pack A's shared footer contract: club hashtag left; presented-by right when
// sponsors are on, the secondary hashtag when they are off.
const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:var(--gold,#F5B21A);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("{{category}}", "{{season}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{subtitle}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*96px);line-height:.94;text-transform:uppercase;margin-top:10px">{{title}}</div></div>` +
    `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:18px;margin-top:calc(var(--k,1.4)*18px)">${leaderRow}</div>` +
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
