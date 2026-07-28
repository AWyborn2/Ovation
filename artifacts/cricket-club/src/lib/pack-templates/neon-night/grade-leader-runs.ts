import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  SHARED_BG,
  STORY_BG,
  clubHeaderFields,
  neonText,
  photoField,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// D13 — Leaderboard (gradeLeader · Runs preset). Grade category leader with
// the big neon number. D18 is the same layout with the Wickets preset.
//
// The bundle ships ONE fluid layout (sized by `--ch`/`--k`) — verified in the
// html: the only `<sc-if>` branches are sponsors on/off (isStoryFmt/isNotStory
// exist only in the DC script). Story below is the transcription; shared is
// authored from Pack A grade-leader-runs' shared structure (left text column,
// right-half photo) in Neon Night's language.
//
// Field keys are IDENTICAL to Broadcast Dark's grade-leader-runs (R4 parity),
// which is also why the bundle's three-logo sponsor strip becomes the
// presented-by line — Pack A's gradeLeader declares no sponsor1..3 keys.
//
// Bundle literals: the caption "LEADING RUN-SCORER" under the value is the
// fixed per-design caption and stays verbatim (Pack A hard-codes the same
// caption per preset module); the leader sub-line "RUNS · 2025/26" is the
// category/season pair → "{{category}} · {{season}}", as Gold Foil bound it.
//
// Glow shadows are set via `neonText` — the bundle's per-card shadow stops
// (.7/.42 cyan, 75%/45% gold) are normalised to the pack's canonical glow,
// the same way fragments' STORY_BG normalises the orb layers.

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// This card family's story header differs from fragments' `storyHeader`
// (transcribed from match-result: 96px logo ring, 20px unwrapped tag): the
// bundle sets an 86px glow-ring logo, 29px name, and a right-aligned WRAPPING
// 18px tag (max-width:300px), so it is transcribed inline here.
function glowStoryHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:86px;height:86px;border-radius:50%;overflow:hidden;box-shadow:0 0 24px rgba(55,207,230,.5),0 0 0 2px rgba(55,207,230,.5)">${CLUB_LOGO_SLOT}</div>` +
    `<div><div style="font-weight:800;font-size:29px;line-height:1.05">{{clubName}}</div>` +
    `<div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.5);margin-top:6px">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="font:700 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.9);text-align:right;max-width:300px">◍ ${tag}</div>` +
    `</div>`
  );
}

const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*16px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*16px)">${HASHTAG_FOOTER_STORY}</div>`,
  );

const storyHtml = columnRoot(
  STORY_BG,
  glowStoryHeader("{{grade}} LEADERBOARD") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:calc(var(--k,1.4)*14px)">` +
    `<div>` +
    neonText("{{value}}", 180, "cyan", ";font-size:calc(var(--k,1.4)*180px);line-height:.9") +
    `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7);margin-top:14px">LEADING RUN-SCORER</div></div>` +
    // Cyan-ringed player photo; `data-drop-if-empty` collapses the framed box
    // when no photo is bound (same call as match-result's story hero).
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:540px;margin:calc(var(--k,1.4)*14px) 0;position:relative;border-radius:22px;overflow:hidden;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
    slot("photo", "photo") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(4,7,13,.9)"></div></div>` +
    `<div>` +
    neonText("{{playerName}}", 62, "gold", ";font-size:calc(var(--k,1.4)*62px);line-height:.9") +
    `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-top:12px">{{category}} · {{season}}</div></div>` +
    `</div>` +
    storyFooters,
  "60px 70px 54px",
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
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// Right-half photo with scrims re-inked to Neon Night's `--ink` night navy.
// Content order mirrors Pack A (kicker, title, value, category, leader); type
// keeps the pack's story language: white/cyan neon value, gold neon leader.
const sharedHtml = columnRoot(
  SHARED_BG +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#081426) 0%, rgba(8,20,38,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#081426), transparent)"></div>`,
  sharedHeader("LEADERBOARD", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7)"><span>{{grade}}</span> LEADERBOARD</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);line-height:.92;margin-top:8px;text-transform:uppercase">LEADING<br>RUN-SCORER</div>` +
    neonText(
      "{{value}}",
      172,
      "cyan",
      ";font-size:calc(var(--k,1.4)*172px);line-height:.86;margin-top:calc(var(--k,1.4)*10px)",
    ) +
    `<div style="font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:calc(var(--k,1.4)*10px)">{{category}}</div>` +
    neonText("{{playerName}}", 56, "gold", ";line-height:1;margin-top:10px") +
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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
