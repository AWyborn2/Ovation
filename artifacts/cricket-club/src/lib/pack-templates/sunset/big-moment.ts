import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  clubHeaderFields,
  glassPanel,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// E8 — Big Moment (live). In-play hit — fifty / century / wicket with the
// live score on a glass panel.
//
// Field keys are a SUBSET of Broadcast Dark's big-moment: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack ({{hashtagsExtra}} is
// a reference key with no home in this composition). The reference design
// declares NO photo key for this kind, so the bundle's full-bleed action
// photo is dropped entirely; the sunset wash carries the card, the content
// column centres (justify-content) so nothing floats over a hole, and the
// script moment flourish is enlarged (87→140) to carry the frame the photo
// vacated, as Pack D did for the same removal.
//
// The bundle's structured literals bind to Pack A's composed fields at field
// granularity: the script "Fifty!" flourish binds {{momentLabel}}, the panel's
// "2/128" is {{liveScore}}, its mono sub-line ("14.2 OVERS · 2ND INNINGS")
// binds {{inningsLabel}}, the gold "NEED 48 FROM 34" is {{equation}}, and the
// bundle's in-panel runs line ("50 (41) · 6 fours · 1 six") becomes
// {{runs}} ({{balls}}) · {{boundaryDetail}} moved under the player name (Pack
// A's structure), freeing the panel's right column for {{equation}} +
// {{oversChaseLine}} so the chase splits across both reference keys.
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "bigMoment" does not declare — replaced with Pack A's
// "live scoring by" credit; the sponsors-off hashtag footers come from the
// pack fragments ({{clubHashtag}} story-side, {{hashtags}} shared-side —
// both declared by this kind).
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in to px (68→95) on the pack's storyColumnRoot/storyHeader. The
// shared layout is authored from Broadcast Dark's shared structure (centred
// moment + panel) in Sunset's language.

/** Pack A's big-moment credits the scorer, not a "presented by". */
const LIVE_SCORING_BY = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55);text-shadow:0 2px 10px rgba(0,0,0,.8)">live scoring by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;

/** Glass live-score panel: score + innings left, chase equation right. */
function scorePanel(scoreHtml: string, extraStyle: string): string {
  return glassPanel(
    `<div style="display:flex;align-items:center;gap:20px">` +
      `<div style="flex:none">` +
      scoreHtml +
      `<div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:6px">{{inningsLabel}}</div>` +
      `</div>` +
      `<div style="flex:1;text-align:right">` +
      `<div style="font-weight:800;font-size:24px;line-height:1.2;color:var(--gold,#F5B21A)">{{equation}}</div>` +
      `<div style="font-weight:500;font-size:18px;line-height:1.3;color:rgba(255,255,255,.6);margin-top:6px">{{oversChaseLine}}</div>` +
      `</div>` +
      `</div>`,
    extraStyle,
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — script moment flourish + name over the glass panel,
// centred on the sunset wash
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("LIVE · vs {{oppositionName}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:34px;margin:20px 0">` +
    `<div style="flex:none">` +
    scriptText("{{momentLabel}}", 140) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:95px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:8px">{{playerName}}</div>` +
    `<div style="font-weight:700;font-size:28px;line-height:1;color:#fff;margin-top:16px;text-shadow:0 2px 10px rgba(0,0,0,.7)">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:22px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    `</div>` +
    scorePanel(
      `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:64px;line-height:.85;color:#fff">{{liveScore}}</div>`,
      ";flex:none;padding:26px 28px",
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
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*16px);padding:calc(var(--k,1.4)*10px) 0">` +
    `<div>` +
    `<div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*84px);line-height:1;color:var(--gold,#F5B21A);text-shadow:0 3px 18px rgba(0,0,0,.75)">{{momentLabel}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*64px);line-height:.94;text-transform:uppercase;color:#fff;margin-top:10px">{{playerName}}</div>` +
    `<div style="font-weight:700;font-size:30px;line-height:1;color:#fff;margin-top:14px">{{runs}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:24px">({{balls}})</span> · {{boundaryDetail}}</div>` +
    `</div>` +
    scorePanel(
      `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:.85;color:#fff">{{liveScore}}</div>`,
      ";width:100%;max-width:760px;padding:24px 28px",
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
