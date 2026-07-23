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

// A6 — Weekend Wrap. Every grade's result + top performers, four rows. The
// bundle styles WON (green) and LOST (red) outcome chips differently, so the
// repeat carries a "lost" row variant capturing the red styling.

function storyRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  const chip =
    variant === "lost"
      ? `<div style="flex:none;font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#F0888C;background:rgba(226,59,59,.15);border:1px solid rgba(226,59,59,.4);border-radius:8px;padding:9px 13px">{{row.outcome}}</div>`
      : `<div style="flex:none;font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#5FD39B;background:rgba(47,158,107,.16);border:1px solid rgba(47,158,107,.4);border-radius:8px;padding:9px 13px">{{row.outcome}}</div>`;
  return (
    `<div${variantAttr} style="display:flex;align-items:center;gap:24px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:22px 26px">` +
    `<div style="width:120px;flex:none;text-align:center"><div style="font-family:var(--disp,'Anton',sans-serif);font-size:56px;line-height:.85;color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div><div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:27px;line-height:1.2">{{row.resultLine}}</div><div style="font-weight:500;font-size:19px;color:rgba(255,255,255,.6);margin-top:5px">{{row.performers}}</div></div>` +
    chip +
    `</div>`
  );
}

function sharedRow(variant: "won" | "lost"): string {
  const variantAttr = variant === "lost" ? ' data-repeat-variant="lost"' : "";
  const chip =
    variant === "lost"
      ? `<div style="flex:none;font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#F0888C;background:rgba(226,59,59,.15);border:1px solid rgba(226,59,59,.4);border-radius:8px;padding:9px 13px">{{row.outcome}}</div>`
      : `<div style="flex:none;font:700 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#5FD39B;background:rgba(47,158,107,.16);border:1px solid rgba(47,158,107,.4);border-radius:8px;padding:9px 13px">{{row.outcome}}</div>`;
  return (
    `<div${variantAttr} style="flex:1;display:flex;align-items:center;gap:24px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:20px 26px">` +
    `<div style="width:110px;flex:none;text-align:center"><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:52px;line-height:.85;color:var(--gold,#FBAC27)">{{row.gradeLabel}}</div><div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:26px;line-height:1.2">{{row.resultLine}}</div><div style="font-weight:500;font-size:18px;color:rgba(255,255,255,.6);margin-top:5px">{{row.performers}}</div></div>` +
    chip +
    `</div>`
  );
}

const storyHtml = formatRoot(
  bgLayers() +
    storyHeader(goldChip("WEEKEND WRAP", "story") + headerTag("{{roundLabel}}")) +
    `<div style="position:absolute;top:236px;left:70px;right:70px">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#F5B21A)">{{roundLabel}} · {{dateRange}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:150px;line-height:.94;text-transform:uppercase;margin-top:12px">WEEKEND<br>WRAP</div>` +
    `</div>` +
    `<div data-repeat="matches" style="position:absolute;top:730px;left:70px;right:70px;display:flex;flex-direction:column;gap:18px">${storyRow("won")}${storyRow("lost")}</div>` +
    hashtagFooterStory(60) +
    sponsorsOn(footerRowStory(56, presentedBy("supported by"))),
);

const sharedHtml = sharedColumnRoot(
  bgLayers(),
  sharedHeader(goldChip("WEEKEND WRAP", "shared") + headerTag("{{roundLabel}}")) +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)"><div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{roundLabel}} · {{dateRange}}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*96px);line-height:.94;text-transform:uppercase;margin-top:12px">WEEKEND WRAP</div></div>` +
    `<div data-repeat="matches" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:calc(var(--k,1.4)*20px)">${sharedRow("won")}${sharedRow("lost")}</div>` +
    footerRowShared(
      sponsorsOn(presentedBy("supported by")) +
        sponsorsOff(
          `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
        ),
      ";margin-top:calc(var(--k,1.4)*16px)",
    ),
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
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("hashtags", "Hashtag footer", "#HALLSHEAD · #PEELPREMIERLEAGUE"),
    textField("hashtagsExtra", "Secondary hashtag", "#PEELPREMIERLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "eSA Sport"),
  ],
  repeats: [
    {
      key: "matches",
      maxRows: 4,
      variants: ["lost"],
      fields: [
        textField("gradeLabel", "Grade", "A"),
        textField("gradeSub", "Grade sub-label", "GRADE"),
        textField("resultLine", "Result line", "Halls Head 2/102 d. R'ham Hornets 9/97"),
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
