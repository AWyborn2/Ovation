import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  clubHeaderFields,
  glassPanel,
  neonText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// D8 — Big Moment (live). In-play hit — fifty / century / wicket with the
// live score on a glass panel.
//
// Field keys are a SUBSET of Broadcast Dark's big-moment: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack ({{clubHashtag}} and
// {{hashtagsExtra}} are the reference keys with no home in this composition).
// The reference design declares NO photo key for this kind, so the bundle's
// action-photo frame is dropped entirely; with the frame gone the neon moment
// hero and the glass score panel split the column — the pack's identity
// carries the card without the image.
//
// The bundle's structured literals bind to Pack A's composed fields at field
// granularity: the "50 (41) · 6 fours · 1 six" line becomes
// {{runs}} ({{balls}}) · {{boundaryDetail}}, and the single chase line
// ("14.2 overs · chasing 176 · need 48 from 34") splits into
// {{oversChaseLine}} + {{equation}} as Pack A structures the panel.
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "bigMoment" does not declare — replaced with Pack A's
// "live scoring by" credit; the sponsors-off hashtag footers come from the
// pack fragments ({{hashtags}}, which this kind declares).
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in on the pack's storyColumnRoot/storyHeader. The shared layout is
// authored from Pack A's shared structure (centred moment + panel) in Neon
// Night's language.

/** Pack A's big-moment credits the scorer, not a "presented by". */
const LIVE_SCORING_BY = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">live scoring by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;

/** Cyan glowing mono innings label (the bundle's panel eyebrow). */
const INNINGS_LABEL = `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7)">{{inningsLabel}}</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — neon moment + name over the glass live-score panel
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("LIVE · vs {{oppositionName}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;margin:14px 0 22px">` +
    `<div style="flex:none">` +
    neonText("{{momentLabel}}", 204, "gold", ";line-height:.9") +
    neonText("{{playerName}}", 78, "cyan", ";line-height:.9;margin-top:11px") +
    `<div style="font-weight:700;font-size:26px;color:#fff;margin-top:10px">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:20px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    `</div>` +
    glassPanel(
      INNINGS_LABEL +
        neonText("{{liveScore}}", 112, "cyan", ";line-height:.9;margin-top:8px") +
        `<div style="font-weight:600;font-size:22px;color:#fff;margin-top:8px">{{oversChaseLine}}</div>` +
        `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.7);margin-top:5px">{{equation}}</div>`,
      ";flex:none;width:100%;padding:24px 30px",
    ) +
    `</div>` +
    sponsorsOn(LIVE_SCORING_BY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: centred moment + glass panel
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("LIVE", "vs {{oppositionName}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:calc(var(--k,1.4)*14px);padding:calc(var(--k,1.4)*10px) 0">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*150px);line-height:.86;color:var(--gold,#FBAC27);text-shadow:0 0 46px color-mix(in srgb, var(--gold,#FBAC27) 40%, transparent);text-transform:uppercase">{{momentLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*72px);line-height:.94;text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font-weight:700;font-size:30px;line-height:1;color:#fff">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:24px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    glassPanel(
      INNINGS_LABEL +
        `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*80px);line-height:.9;color:var(--gold,#FBAC27);margin-top:10px">{{liveScore}}</div>` +
        `<div style="font-weight:600;font-size:27px;color:#fff;margin-top:10px">{{oversChaseLine}}</div>` +
        `<div style="font-weight:500;font-size:22px;color:rgba(255,255,255,.7);margin-top:5px">{{equation}}</div>`,
      ";width:100%;max-width:760px;margin-top:calc(var(--k,1.4)*10px);padding:24px 30px",
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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · LIVE UPDATES"),
    textField("sponsorPresentedBy", "Live scoring sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
