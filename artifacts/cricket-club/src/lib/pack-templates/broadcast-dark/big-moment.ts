import type { PackCardTemplate } from "../types";
import { SK_COND, SK_MONO } from "../shared";
import {
  ACC,
  DISP,
  MUTED,
  bdAccentPill,
  bdCard,
  bdColumn,
  bdCond,
  bdDisplay,
  bdFormats,
  bdFooterPresented,
  clubHeaderFields,
  textField,
  type BdFormat,
} from "./fragments";

// A8 — Big Moment · Live. The moment in accent display type, the player and
// their knock, then a live scorebug (innings, score, overs/chase, equation).
// The LIVE chip is broadcast red by design — a status colour, not the accent.
// No photo slot: the card renders without one by design (see bind.ts, A6).

const LIVE_CHIP = `<div style="display:inline-flex;align-items:center;gap:1cqmin;font-family:${SK_COND};font-weight:800;font-size:2.4cqmin;line-height:1;letter-spacing:.12em;padding:1cqmin 2cqmin;background:#E23B3B;color:#fff;border-radius:.6cqmin"><span style="width:1.1cqmin;height:1.1cqmin;border-radius:50%;background:#fff;animation:hhPulse 1.4s ease-in-out infinite"></span>LIVE</div>`;

const moment =
  bdDisplay("{{momentLabel}}", 22, `;line-height:.86;color:${ACC};max-width:74cqmin;text-wrap:balance`) +
  bdCond("{{playerName}}", 8.4, ";margin-top:1.6cqmin") +
  `<div style="font-size:3.4cqmin;font-weight:600;margin-top:1.4cqmin">{{runs}} <span style="color:${MUTED}">({{balls}})</span> · {{boundaryDetail}}</div>`;

const scorebug =
  `<div style="background:rgba(255,255,255,.06);border:.2cqmin solid rgba(255,255,255,.12);border-left:1cqmin solid ${ACC};border-radius:1.2cqmin;padding:2.4cqmin 3cqmin;display:flex;flex-direction:column;align-items:flex-start">` +
  `<div style="font-family:${SK_MONO};font-weight:600;font-size:2.2cqmin;letter-spacing:.18em;color:${MUTED}">{{inningsLabel}}</div>` +
  `<div style="font-family:${DISP};font-size:13cqmin;line-height:.9;margin-top:1cqmin">{{liveScore}}</div>` +
  `<div style="font-size:3cqmin;font-weight:500;color:${MUTED};margin-top:.8cqmin">{{oversChaseLine}}</div>` +
  bdAccentPill("{{equation}}", 3.8, ";margin-top:2cqmin") +
  `</div>`;

function build(fmt: BdFormat): string {
  const body =
    fmt === "landscape"
      ? `<div style="display:flex;align-items:center;gap:8cqmin"><div style="flex:none;max-width:110cqmin">${moment}</div><div style="flex:none">${scorebug}</div></div>`
      : bdColumn(moment + `<div style="margin-top:4cqmin">${scorebug}</div>`, true);
  return bdCard({
    chip: LIVE_CHIP,
    tag: "vs {{oppositionName}}",
    body,
    footer: bdFooterPresented("live scoring by", { offLeft: "hashtagsExtra" }),
  });
}

export const bigMoment: PackCardTemplate = {
  kind: "bigMoment",
  designKey: "big-moment",
  name: "Big Moment · Live",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("oppositionName", "Opposition name", "MARINERS"),
    textField("momentLabel", "Moment label", "FIFTY!"),
    textField("playerName", "Player name", "JACK MANUEL"),
    textField("runs", "Runs", "50"),
    textField("balls", "Balls faced", "41"),
    textField("boundaryDetail", "Boundary detail", "6 fours · 1 six"),
    textField("inningsLabel", "Innings label", "YOUR CLUB · 2ND INNINGS"),
    textField("liveScore", "Live score", "2/128"),
    textField("oversChaseLine", "Overs / chase line", "14.2 overs · chasing 176"),
    textField("equation", "Equation", "Need 48 from 34 balls"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · LIVE UPDATES"),
    textField("hashtagsExtra", "Secondary footer tag", "LIVE UPDATES"),
    textField("sponsorPresentedBy", "Live scoring sponsor", "Your Sponsor"),
  ],
  formats: bdFormats(build),
};
