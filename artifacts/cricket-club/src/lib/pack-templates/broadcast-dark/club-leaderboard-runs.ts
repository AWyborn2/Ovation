import type { PackCardTemplate } from "../types";
import { SK_MONO } from "../shared";
import {
  ACC,
  DISP,
  MUTED,
  bdCard,
  bdChip,
  bdDisplay,
  bdEyebrow,
  bdFooterPresented,
  bdFormats,
  bdSplit,
  clubHeaderFields,
  repeatField,
  textField,
  type BdFormat,
} from "./fragments";

// A19 — Club Leaders · Runs (clubLeaderboard · Runs preset). The handoff's
// "Club leaders" rows: grade block, leader, value. Up to eight grades on the
// tall formats; landscape summarises to the top five beside the title. A20
// (Wickets preset) reuses this layout.

const row =
  `<div style="display:flex;align-items:center;gap:2.6cqmin;padding:1.2cqmin 2.4cqmin;margin-top:1cqmin;border-radius:1cqmin;background:rgba(255,255,255,.05);border:.2cqmin solid rgba(255,255,255,.1)">` +
  `<div style="width:12cqmin;flex:none"><div style="font-family:${DISP};font-size:4.4cqmin;line-height:.95;color:${ACC};white-space:nowrap">{{row.gradeLabel}}</div><div style="font-family:${SK_MONO};font-weight:600;font-size:1.5cqmin;letter-spacing:.12em;color:${MUTED};margin-top:.4cqmin">{{row.gradeSub}}</div></div>` +
  `<div style="flex:1;min-width:0;font-weight:600;font-size:3.3cqmin;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{row.playerName}}</div>` +
  `<div style="flex:none;font-family:${DISP};font-size:5.4cqmin;line-height:.9">{{row.value}}</div>` +
  `</div>`;

/** Shared Club Leaders markup builder (Runs and Wickets presets). */
export function clubLeadersBuild(fmt: BdFormat): string {
  const head = bdEyebrow("{{subtitle}}") + bdDisplay("{{title}}", 10.5, ";line-height:.92");
  const rows = `<div data-repeat="leaders" data-repeat-max="${fmt === "landscape" ? 5 : 8}">${row}</div>`;
  return bdCard({
    chip: bdChip("{{category}}"),
    tag: "{{season}}",
    body: bdSplit(fmt, head, rows),
    footer: bdFooterPresented("stats by", { offLeft: "hashtagsExtra" }),
  });
}

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
  formats: bdFormats(clubLeadersBuild),
};
