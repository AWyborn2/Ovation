import type { PackCardTemplate } from "../types";
import { SK_COND, SK_MONO } from "../shared";
import {
  ACC,
  ACC_INK,
  DISP,
  LINE,
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

// A6 — Weekend Wrap. One row per grade: grade block, result line and top
// performers, outcome pill (won on the accent, lost outlined — the
// `data-repeat-variant="lost"` alternate row). Five grades on the tall
// formats; landscape summarises to four beside the title.

function row(variant: "won" | "lost"): string {
  const lost = variant === "lost";
  const pill = lost
    ? `background:transparent;color:${MUTED};border:.2cqmin solid ${LINE}`
    : `background:${ACC};color:${ACC_INK};border:.2cqmin solid transparent`;
  return (
    `<div${lost ? ' data-repeat-variant="lost"' : ""} style="display:flex;align-items:center;gap:2.6cqmin;padding:1.8cqmin 2.4cqmin;margin-top:1.2cqmin;border-radius:1.2cqmin;background:rgba(255,255,255,.05);border:.2cqmin solid rgba(255,255,255,.08)">` +
    `<div style="width:11cqmin;flex:none;text-align:center"><div style="font-family:${DISP};font-size:5.4cqmin;line-height:.9;color:${ACC}">{{row.gradeLabel}}</div><div style="font-family:${SK_MONO};font-weight:600;font-size:1.5cqmin;letter-spacing:.12em;color:${MUTED};margin-top:.5cqmin">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:3.1cqmin;line-height:1.2">{{row.resultLine}}</div><div style="font-weight:500;font-size:2.3cqmin;line-height:1.3;color:${MUTED};margin-top:.5cqmin">{{row.performers}}</div></div>` +
    `<div style="flex:none;font-family:${SK_COND};font-weight:800;font-size:2.6cqmin;line-height:1;letter-spacing:.08em;padding:1cqmin 1.8cqmin;border-radius:.8cqmin;${pill}">{{row.outcome}}</div>` +
    `</div>`
  );
}

function build(fmt: BdFormat): string {
  const head =
    bdEyebrow("<span>{{roundLabel}}</span> · <span>{{dateRange}}</span>") +
    bdDisplay("WEEKEND<br>WRAP", 12, ";line-height:.88");
  const rows = `<div data-repeat="matches" data-repeat-max="${fmt === "landscape" ? 4 : 5}">${row("won")}${row("lost")}</div>`;
  return bdCard({
    chip: bdChip("WEEKEND WRAP"),
    body: bdSplit(fmt, head, rows),
    footer: bdFooterPresented("supported by", { offLeft: "hashtagsExtra" }),
  });
}

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
  formats: bdFormats(build),
};
