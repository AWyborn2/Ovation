import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  SHARED_BG,
  STORY_BG,
  clubHeaderFields,
  glassPanel,
  photoField,
  scriptText,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// E13 — Leaderboard (gradeLeader · Runs preset). Grade category leader with
// the big number over the hero photo. E18 is the same layout with the Wickets
// preset.
//
// The bundle ships ONE fluid layout (sized by `--ch`/`--k`) — verified in the
// html: the only `<sc-if>` branches are sponsors on/off. The story format
// below is the transcription, with the `--k` sizes baked to px at the story's
// k=1.4 (script 62→87, value 138→193, footer gap 14→20), the same call this
// pack's match-result made. The shared format is authored following Pack A
// grade-leader-runs' shared structure (left text column, right-half photo) in
// Sunset's language.
//
// Field keys are a strict SUBSET of Broadcast Dark's grade-leader-runs (R4
// parity). `hashtags` is omitted — Sunset's story sponsors-off footer is the
// pack's HASHTAG_FOOTER_STORY ({{clubHashtag}}) and the shared footer follows
// Pack A's contract (no sponsors-off right-hand content), so nothing binds it.
//
// The bundle's sponsors-on footer is the three-logo strip, but Pack A's
// gradeLeader declares no sponsor1..3 keys — adding them here would fail
// field-key parity. The strip becomes the pack's "presented by
// {{sponsorPresentedBy}}" line, as Packs B/C/D resolved the same conflict.
//
// Bundle literals replaced with bindings:
//  - header tag "A Grade Leaderboard" → "{{grade}} LEADERBOARD" (grade binds
//    uppercase — "A GRADE" — so the tag is set in caps, as B/D bound it);
//  - the caption script "Leading Run-Scorer" is the fixed per-design caption
//    and stays verbatim (Pack A hard-codes the same caption per preset);
//  - the glass-panel right chip "RUNS · 2025/26" → "{{category}} · {{season}}"
//    (the category/season pair, as B/D bound it);
//  - the leader sub-line ("Top of the charts") is flavour copy with no key on
//    this kind; it is dropped rather than double-rendering {{grade}}, which
//    already sits in the header tag.

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// This stat-card family's story header differs from fragments' `storyHeader`
// (transcribed from match-result: 92px logo, 18px gap, 14px tagline): the
// bundle sets an 84px circular logo, 16px gap and a 13px tagline. Transcribed
// inline here, minus the bundle's preview-only pointer-events declarations.
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

// Photo-first story: hero photo as the background under this family's scrim
// and the accent horizon glow, `data-drop-if-empty` with the sunset wash
// beneath (match-result precedent — no photo, no blank frame).
const storyLayers =
  STORY_BG +
  `<div data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`;

// The bundle's `margin-top:calc(var(--k)*14px)` on both sponsor branches
// becomes one flex spacer, as match-result's story did.
const storyHtml = columnRoot(
  storyLayers,
  statStoryHeader("{{grade}} LEADERBOARD") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Leading Run-Scorer", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:193px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:6px">{{value}}</div>` +
    glassPanel(
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px">` +
        `<div style="font-weight:800;font-size:36px;line-height:1.05;color:#fff">{{playerName}}</div>` +
        `<div style="font:700 15px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:var(--gold,#F5B21A);text-align:right;flex:none">{{category}} · {{season}}</div>` +
        `</div>`,
      ";margin-top:16px;padding:26px 28px",
    ) +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

// Pack A's shared footer contract: club hashtag left, presented-by right when
// sponsors are on (no sponsors-off right-hand content for this kind in
// shared). The sponsor name stays white, matching PRESENTED_BY_STORY.
const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// Right-half photo with scrims re-inked to Sunset's `--ink` burnt near-black.
// Content order mirrors Pack A (kicker, caption, value, category, leader);
// the caption keeps the story's Kaushan script so the pack's identity carries
// into portrait/square (`extraStyle` re-sizes the script with `--k`, the same
// override pattern B/D use on foilText/neonText).
const sharedHtml = columnRoot(
  SHARED_BG +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#120a07) 0%, rgba(18,10,7,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#120a07), transparent)"></div>`,
  sharedHeader("LEADERBOARD", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)"><span>{{grade}}</span> LEADERBOARD</div>` +
    scriptText("Leading Run-Scorer", 54, ";font-size:calc(var(--k,1.4)*54px);margin-top:10px") +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*172px);line-height:.86;margin-top:calc(var(--k,1.4)*10px)">{{value}}</div>` +
    `<div style="font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:calc(var(--k,1.4)*10px)">{{category}}</div>` +
    `<div style="font-weight:700;font-size:56px;line-height:1;margin-top:10px">{{playerName}}</div>` +
    `</div>` +
    sharedFooterRow,
  "58px 66px 52px",
);

export const gradeLeaderRuns: PackCardTemplate = {
  kind: "gradeLeader",
  designKey: "grade-leader-runs",
  name: "Leaderboard",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("grade", "Grade", "A GRADE"),
    textField("category", "Category", "RUNS"),
    textField("value", "Leading value", "428"),
    textField("playerName", "Leader", "Jack Manuel"),
    textField("season", "Season", "2025/26"),
    photoField("photo", "Player photo", "Player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
