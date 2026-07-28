import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  SHARED_BG,
  clubHeaderFields,
  photoField,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// C13 — Leaderboard (gradeLeader · Runs preset). Grade category leader with
// the big number. C18 is the same layout with the Wickets preset.
//
// The bundle ships ONE fluid layout (sized by `--ch`/`--k`) — verified in the
// html: the only `<sc-if>` branches are sponsors on/off (isStoryFmt/isNotStory
// exist only in the DC script). Story below is the transcription; shared is
// authored from Pack A grade-leader-runs' shared structure (left text column,
// right-half photo) in Bold Type's language.
//
// Field keys are IDENTICAL to Broadcast Dark's grade-leader-runs (a strict
// subset — `hashtags` is omitted: Bold Type's story sponsors-off footer is the
// gold bar's single {{clubHashtag}}, and Pack A's shared has no sponsors-off
// right-hand content, so nothing binds `hashtags`).
//
// The bundle's three-logo sponsor strip is dropped (Pack A's gradeLeader
// declares no sponsor1..3 keys); the gold bar's "presented by
// {{sponsorPresentedBy}}" credit carries sponsors-on, as in Gold Foil.
//
// Bundle literals: "LEADING RUN-SCORER · RUNS" under the value keeps its fixed
// per-design caption and binds the category half ("LEADING RUN-SCORER ·
// {{category}}" — Pack A hard-codes the same caption per preset module);
// "TOP OF THE CHARTS" under the leader's name is club-agnostic design copy and
// stays verbatim.

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// This card family's story header differs from fragments' `storyHeader` (which
// has no logo slot): small club logo beside a tracked mono gold label, tag
// right — transcribed inline. The club NAME appears in the gold footer bar.
function logoStoryHeader(label: string, tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:60px;height:60px;flex:none">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A)">${label}</div></div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);text-align:right">${tag}</div>` +
    `</div>`
  );
}

// Both variants are the full-bleed gold bar (the bundle swaps only the right
// span); bars cancel storyColumnRoot's canonical 80/80/70 story margins.
const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${HASHTAG_FOOTER_STORY}</div>`,
  );

const storyHtml = storyColumnRoot(
  logoStoryHeader("{{grade}} LEADERBOARD", "{{season}}") +
    // `justify-content:space-between` is a no-op while the flex:1 photo frame
    // is present; when `data-drop-if-empty` removes it, the value/name blocks
    // spread instead of leaving a hole.
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;padding-top:calc(var(--k,1.4)*16px);gap:calc(var(--k,1.4)*14px)">` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*166px);line-height:.78;text-transform:uppercase;color:#fff">{{value}}</div>` +
    `<div style="margin-top:10px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">LEADING RUN-SCORER · {{category}}</div></div></div>` +
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;position:relative;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
    slot("photo", "photo") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div>` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);color:var(--gold,#F5B21A);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="margin-top:8px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">TOP OF THE CHARTS</div></div></div>` +
    `</div>` +
    storyFooters,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

// Pack A's shared footer contract: club hashtag left, presented-by right when
// sponsors are on (no sponsors-off right-hand content for this kind).
const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:800;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.55)">presented by <span style="color:var(--gold,#F5B21A)">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// Right-half photo with block-toned scrims (Pack A's structure, re-inked from
// `--ink` to Bold Type's `--block` stage). Content order mirrors Pack A
// (kicker, title, value, category, leader); type keeps the pack's story
// language: white display value, gold display leader name.
const sharedHtml = columnRoot(
  SHARED_BG +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--block,#0E1C31) 0%, rgba(14,28,49,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--block,#0E1C31), transparent)"></div>`,
  sharedHeader("LEADERBOARD", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#FBAC27)">{{grade}} LEADERBOARD</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);line-height:.92;margin-top:8px;text-transform:uppercase">LEADING<br>RUN-SCORER</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*166px);line-height:.82;margin-top:calc(var(--k,1.4)*10px)">{{value}}</div>` +
    `<div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:calc(var(--k,1.4)*10px)">{{category}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:1;color:var(--gold,#F5B21A);text-transform:uppercase;margin-top:10px">{{playerName}}</div>` +
    `</div>` +
    sharedFooterRow,
  "58px 66px 52px",
);

export const gradeLeaderRuns: PackCardTemplate = {
  kind: "gradeLeader",
  designKey: "grade-leader-runs",
  name: "Leaderboard — Leading Run-Scorer",
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
