import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  glassPanel,
  repeatField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// E20 — Club Leaders · Wickets (clubLeaderboard · Wickets preset). Leading
// wicket-taker for every grade, one card. Same layout as E19 — see
// club-leaderboard-runs.ts for the transcription notes (single fluid bundle
// layout over the pack's sunset wash with only sponsor `<sc-if>` branches;
// story transcribed with `--k` baked at 1.4, shared authored from Pack A;
// sponsor strip → presented-by line and `hashtags` omitted for R4 parity;
// header tag → {{subtitle}}, script headline → {{title}}).
//
// The one per-preset difference beyond samples: the bundle's script headline
// bakes at 54px base (76px at k=1.4) where the Runs card uses 56 (78) — the
// longer "Club Wickets" copy gets the slightly smaller script.

// ---------------------------------------------------------------------------
// Leader rows — transcribed from the bundle (see club-leaderboard-runs.ts)
// ---------------------------------------------------------------------------

const storyRow = glassPanel(
  `<div style="width:100px;flex:none;text-align:center">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:76px;color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;font-weight:700;font-size:34px;color:#fff">{{row.playerName}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:81px;color:#fff">{{row.value}}</div>`,
  ";flex:1;min-height:0;display:flex;align-items:center;gap:26px;padding:0 30px",
);

const sharedRow = glassPanel(
  `<div style="width:100px;flex:none;text-align:center">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*54px);color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;font-weight:700;font-size:34px;color:#fff">{{row.playerName}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);color:#fff">{{row.value}}</div>`,
  ";flex:1;min-height:0;display:flex;align-items:center;gap:26px;padding:0 30px",
);

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

function statStoryHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:16px">` +
    `<div style="width:84px;height:84px;border-radius:50%;overflow:hidden;flex:none">${CLUB_LOGO_SLOT}</div>` +
    `<div><div style="font-weight:800;font-size:28px;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,.7)">{{clubName}}</div>` +
    `<div style="font:500 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.72);margin-top:6px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="font:700 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#F5B21A);text-align:right;text-shadow:0 2px 10px rgba(0,0,0,.85);max-width:300px">${tag}</div>` +
    `</div>`
  );
}

const storyHtml = storyColumnRoot(
  statStoryHeader("{{subtitle}}") +
    `<div style="flex:none;margin-top:14px">` +
    scriptText("{{title}}", 76) +
    `</div>` +
    `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:22px">${storyRow}</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeader("{{category}}", "{{season}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{subtitle}}</div>` +
    scriptText("{{title}}", 72, ";font-size:calc(var(--k,1.4)*72px);margin-top:10px") +
    `</div>` +
    `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:calc(var(--k,1.4)*16px)">${sharedRow}</div>` +
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
