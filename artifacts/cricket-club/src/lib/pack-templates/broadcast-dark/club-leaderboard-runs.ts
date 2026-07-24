import type { PackCardTemplate } from "../types";
import {
  bgLayers,
  clubHeaderFields,
  footerRowShared,
  footerRowStory,
  formatRoot,
  goldChip,
  hashtagFooterStory,
  headerTag,
  presentedBy,
  repeatField,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A19 — Club Leaders · Runs (clubLeaderboard · Runs preset). Leading
// run-scorer for every grade, one card. A20 is the Wickets preset.

const storyRow =
  `<div style="display:flex;align-items:center;gap:28px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:30px 34px">` +
  `<div style="width:120px;flex:none;text-align:center"><div style="font-family:var(--disp,'Anton',sans-serif);font-size:64px;line-height:.85;color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div><div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:5px">{{row.gradeSub}}</div></div>` +
  `<div style="flex:1;font-weight:700;font-size:42px;line-height:1.05">{{row.playerName}}</div>` +
  `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:80px;line-height:.85;color:var(--gold,#F5B21A)">{{row.value}}</div>` +
  `</div>`;

const sharedRow =
  `<div style="flex:1;display:flex;align-items:center;gap:28px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:0 34px">` +
  `<div style="width:110px;flex:none;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:60px;line-height:.85;color:var(--gold,#FBAC27)">{{row.gradeLabel}}</div><div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:5px">{{row.gradeSub}}</div></div>` +
  `<div style="flex:1;font-weight:700;font-size:40px;line-height:1.05">{{row.playerName}}</div>` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:76px;line-height:.85;color:var(--gold,#FBAC27)">{{row.value}}</div>` +
  `</div>`;

const storyHtml = formatRoot(
  bgLayers() +
    storyHeader(goldChip("{{category}}", "story") + headerTag("{{season}}")) +
    `<div style="position:absolute;top:230px;left:70px;right:70px"><div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#F5B21A)">{{subtitle}}</div><div style="font-family:var(--disp,'Anton',sans-serif);font-size:132px;line-height:.94;text-transform:uppercase;margin-top:10px">{{title}}</div></div>` +
    `<div data-repeat="leaders" style="position:absolute;top:600px;left:70px;right:70px;display:flex;flex-direction:column;gap:24px">${storyRow}</div>` +
    sponsorsOn(footerRowStory(52, presentedBy("stats by"))) +
    hashtagFooterStory(60),
);

const sharedHtml = sharedColumnRoot(
  bgLayers(),
  sharedHeader(goldChip("{{category}}", "shared") + headerTag("{{season}}")) +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)"><div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{subtitle}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*96px);line-height:.94;text-transform:uppercase;margin-top:10px">{{title}}</div></div>` +
    `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:22px;margin-top:calc(var(--k,1.4)*18px)">${sharedRow}</div>` +
    footerRowShared(
      sponsorsOn(presentedBy("stats by")) +
        sponsorsOff(
          `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
        ),
      ";margin-top:calc(var(--k,1.4)*16px)",
    ),
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
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("hashtags", "Hashtag footer", "#HALLSHEAD · #PEELPREMIERLEAGUE"),
    textField("hashtagsExtra", "Secondary hashtag", "#PEELPREMIERLEAGUE"),
    textField("sponsorPresentedBy", "Stats source", "PlayHQ"),
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
