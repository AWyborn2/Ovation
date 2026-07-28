import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// C16 — Century. Giant runs figure, framed batter photo, gold name.
//
// Field keys are IDENTICAL to Broadcast Dark's century: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The story binds the
// bundle's meta line ({{balls}} BALLS · vs {{opponent}} · RD {{round}});
// {{grade}} appears in the shared meta line as Pack A composes it, so every
// declared key stays bound.
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "century" does not declare — replaced with the pack's
// gold-bar presented-by footer; the sponsors-off hashtag footers come from the
// pack fragments.
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in and normalised onto storyColumnRoot/storyHeader (no header logo —
// the club logo binds in the shared header). The bundle's header split
// "RAISED THE BAT" left and "CENTURY" right; storyHeader has one tag slot, so
// the tag composes both. The sub-line under the name named club colours in the
// bundle — neutralised to "A HUNDRED FOR THE CLUB". The bundle bound the runs
// hero as one field including the star, matching Pack A's {{runs}} ("112*"),
// so nothing collapses. The shared layout is authored from Pack A's shared
// structure (figures column left, photo right) in Bold Type's language.

const STORY_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div></div>`;

const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:2px;overflow:hidden;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,12,22,.9)"></div></div>`;

/** Shared sponsors-on footer: hashtag left, presented-by right. */
const SHARED_FOOTER_ON =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6)">presented by {{sponsorPresentedBy}}</div>` +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — giant runs, framed photo, gold name, gold bar
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("RAISED THE BAT · CENTURY") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:20px;margin-top:22px">` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:232px;line-height:.78;text-transform:uppercase;color:#fff">{{runs}}</div>` +
    `<div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:14px;text-transform:uppercase">{{balls}} BALLS · vs {{opponent}} · RD {{round}}</div></div>` +
    STORY_PHOTO +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:78px;color:var(--gold,#F5B21A);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:8px">A HUNDRED FOR THE CLUB</div></div>` +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: figures column left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("CENTURY", "MILESTONE") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*12px)">` +
    `<div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:var(--gold,#FBAC27)">RAISED THE BAT</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*150px);line-height:.82;color:#fff"><span>{{runs}}</span><span style="font-size:calc(var(--k,1.4)*44px);color:rgba(255,255,255,.6)"> ({{balls}})</span></div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:.92;color:var(--gold,#FBAC27);text-transform:uppercase;margin-top:calc(var(--k,1.4)*8px)">{{playerName}}</div>` +
    `<div style="font:500 22px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);text-transform:uppercase;margin-top:8px">{{grade}} · vs {{opponent}} · RD {{round}}</div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    sponsorsOn(SHARED_FOOTER_ON) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

export const century: PackCardTemplate = {
  kind: "century",
  designKey: "century",
  name: "Century",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("playerName", "Player name", "Jack Manuel"),
    textField("grade", "Grade", "A GRADE"),
    textField("runs", "Runs", "112*"),
    textField("balls", "Balls", "68"),
    textField("opponent", "Opponent", "BALDIVIS"),
    textField("round", "Round", "4"),
    photoField("photo", "Batter photo", "Batter photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
