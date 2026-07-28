import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  clubHeaderFields,
  foilText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// B8 — Big Moment (live). In-play hit — fifty / century / wicket with the live
// score panel.
//
// Field keys are IDENTICAL to Broadcast Dark's big-moment: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack.
//
// The bundle's action-photo slot is DROPPED: the reference design for
// "bigMoment" declares no photo field, so a slot here would be a new key the
// parity contract forbids — and an unbindable slot would render a permanent
// empty box. The composition centres on the foil moment + live panel instead.
// The bundle's single chase line splits into {{oversChaseLine}} + {{equation}}
// as Pack A structures it, and the three-logo sponsor strip (needing
// undeclared `sponsor1..3` keys) becomes a "live scoring by" sponsor line.
//
// The bundle is story-only; the shared layout is authored from the story's
// visual language plus Pack A's shared structure (centred moment + panel).

/** Bundle story header carries the club logo above the wordmark. */
const storyLogo = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

/** Pack A's big-moment credits the scorer, not a "presented by". */
const LIVE_SCORING_BY = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">live scoring by <span style="color:var(--gold,#F5B21A);font-weight:700">{{sponsorPresentedBy}}</span></div>`;

/** Gold-edged live score panel, shared between formats bar the type scale. */
function livePanel(scoreHtml: string, maxWidth = ""): string {
  return (
    `<div style="flex:none;width:100%;${maxWidth}border:1px solid color-mix(in srgb, var(--gold,#F5B21A) 40%, transparent);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.04),transparent);padding:24px 30px">` +
    `<div style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.6)">{{inningsLabel}}</div>` +
    scoreHtml +
    `<div style="font-weight:600;font-size:23px;color:#fff;margin-top:8px">{{oversChaseLine}}</div>` +
    `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.65);margin-top:5px">{{equation}}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — foil moment + name, batting line, live score panel
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyLogo +
    storyHeader("LIVE · vs {{oppositionName}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center;gap:64px;margin:30px 0 34px">` +
    `<div style="flex:none">` +
    foilText("{{momentLabel}}", 208, ";line-height:.84") +
    foilText("{{playerName}}", 84, ";margin-top:14px") +
    `<div style="font-weight:700;font-size:28px;color:#fff;margin-top:12px">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:22px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    `</div>` +
    livePanel(foilText("{{liveScore}}", 126, ";margin-top:10px")) +
    `</div>` +
    sponsorsOn(LIVE_SCORING_BY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: centred moment + live panel
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("LIVE", "vs {{oppositionName}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:calc(var(--k,1.4)*14px);padding:calc(var(--k,1.4)*10px) 0">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*150px);line-height:.86;color:var(--gold,#F5B21A);text-shadow:0 0 46px color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent)">{{momentLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*72px);line-height:.94;text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:700;font-size:30px;line-height:1;color:#fff">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:24px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    livePanel(
      `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*90px);line-height:.9;color:var(--gold,#F5B21A);margin-top:10px">{{liveScore}}</div>`,
      "max-width:760px;margin-top:calc(var(--k,1.4)*10px);",
    ) +
    `</div>` +
    sponsorsOn(LIVE_SCORING_BY) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

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
    textField("sponsorPresentedBy", "Live scoring sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
