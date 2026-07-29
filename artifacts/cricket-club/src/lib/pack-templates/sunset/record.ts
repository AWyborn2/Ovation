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

// E12 — Record. Club record — title, holder, value & grade.
//
// The bundle ships ONE fluid layout (sized by `--ch`/`--k`) for this card —
// verified in the html: the only `<sc-if>` branches are sponsors on/off. The
// story format below is the transcription, with the `--k` sizes baked to px at
// the story's k=1.4 (script 62→87, value 138→193, footer gap 14→20), the same
// call this pack's match-result made. The shared format is authored following
// Pack A record's shared structure (left text column, right-half photo) in
// Sunset's language.
//
// Field keys are a strict SUBSET of Broadcast Dark's record (R4 parity):
// `bindInput` maps a ShareCardInput onto keys per card KIND, not per pack.
// `hashtags` is omitted — Sunset's story sponsors-off footer is the pack's
// HASHTAG_FOOTER_STORY ({{clubHashtag}}), and Pack A's record shared has no
// sponsors-off right-hand content either, so nothing binds `hashtags` (the
// same strict subset Bold Type's record ships).
//
// The bundle's sponsors-on footer is the three-logo strip, but Pack A's record
// declares no sponsor1..3 keys — adding them here would fail field-key parity.
// The strip becomes the pack's "presented by {{sponsorPresentedBy}}" line
// (PRESENTED_BY_STORY), which binds the one sponsor key the kind actually has,
// as Packs B/C/D resolved the same conflict.
//
// Bundle literals replaced with bindings:
//  - "HIGHEST SCORE · A GRADE" (glass-panel right chip) → {{title}} alone —
//    binding "{{title}} · {{grade}}" would double-set grade (C/D precedent);
//  - the holder sub-line ("The standard at <club>") is tenant-branded copy
//    and becomes the {{grade}} line under the holder's name.

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// This stat-card family's story header differs from fragments' `storyHeader`
// (transcribed from match-result: 92px logo, 18px gap, 14px tagline): the
// bundle sets an 84px circular logo, 16px gap and a 13px tagline. Transcribed
// inline here, minus the bundle's preview-only pointer-events declarations
// (`flex:none` on the logo wrapper kept, as fragments' header does).
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

// The bundle's story is photo-first: the hero photo IS the background, under a
// cinematic scrim (this family's own stops — slightly gentler than
// match-result's) and the accent horizon glow. The photo layer carries
// `data-drop-if-empty` with the sunset wash beneath it, so a record posted
// without a photo falls back to the pack's own sky (match-result precedent).
const storyLayers =
  STORY_BG +
  `<div data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`;

// The bundle's spacer-before-footer (`margin-top:calc(var(--k)*14px)` on both
// sponsor branches) becomes one flex spacer, as match-result's story did.
const storyHtml = columnRoot(
  storyLayers,
  statStoryHeader("Club Record") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Club Record", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:193px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:6px">{{value}}</div>` +
    glassPanel(
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px">` +
        `<div><div style="font-weight:800;font-size:36px;line-height:1.05;color:#fff">{{playerName}}</div>` +
        `<div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:6px">{{grade}}</div></div>` +
        `<div style="font:700 15px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:var(--gold,#F5B21A);text-align:right;flex:none">{{title}}</div>` +
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
// Shared (portrait/square) — authored; Pack A record's shared is the guide
// ---------------------------------------------------------------------------

// Pack A's shared footer contract: club hashtag left, presented-by right when
// sponsors are on (record has no sponsors-off right-hand content in shared —
// the hashtag line simply stands alone, as in Pack A). The sponsor name stays
// white, matching the pack's PRESENTED_BY_STORY.
const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// Right-half photo with scrims re-inked to Sunset's `--ink` burnt near-black,
// over the pack's SHARED_BG wash. Type keeps the story's language: Kaushan
// script kicker in the accent, white display value, with the grade as the mono
// sub-line.
const sharedHtml = columnRoot(
  SHARED_BG +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#120a07) 0%, rgba(18,10,7,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#120a07), transparent)"></div>`,
  sharedHeader("RECORD", "CLUB BEST") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    scriptText("Club Record", 44) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);line-height:.92;margin-top:8px;text-transform:uppercase">{{title}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*172px);line-height:.86;margin-top:calc(var(--k,1.4)*10px)">{{value}}</div>` +
    `<div style="font-weight:700;font-size:56px;line-height:1;margin-top:calc(var(--k,1.4)*10px)">{{playerName}}</div>` +
    `<div style="font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:12px">{{grade}}</div>` +
    `</div>` +
    sharedFooterRow,
  "58px 66px 52px",
);

export const record: PackCardTemplate = {
  kind: "record",
  designKey: "record",
  name: "Record",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("title", "Record title", "HIGHEST SCORE"),
    textField("value", "Record value", "156*"),
    textField("playerName", "Record holder", "Tim Miles"),
    textField("grade", "Grade", "A GRADE"),
    photoField("photo", "Record holder photo", "Record holder photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Records sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
