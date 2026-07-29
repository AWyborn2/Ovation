import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  glassPanel,
  repeatField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// E19 — Club Leaders · Runs (clubLeaderboard · Runs preset). Leading
// run-scorer for every grade, one card. E20 is the Wickets preset.
//
// The bundle ships ONE fluid layout (sized by `--ch`/`--k`) over the pack's
// sunset wash (its layers match fragments' STORY_BG verbatim, at
// storyColumnRoot's own 60/70/54 padding) — the only `<sc-if>` branches are
// sponsors on/off. The story format below is the transcription, with the
// `--k` sizes baked to px at the story's k=1.4 (script 56→78, grade 54→76,
// value 58→81, margins 10→14 / 16→22, footer gap 14→20), the same call this
// pack's match-result made. The shared format is authored following Pack A
// club-leaderboard-runs' shared structure (header chip/tag, subtitle/title
// block, the same repeat rows) in Sunset's language.
//
// Field keys and the `leaders` repeat mirror Pack A EXACTLY where used, a
// strict subset otherwise (R4 parity):
//  - the bundle's three-logo sponsor strip becomes the presented-by line —
//    Pack A's clubLeaderboard declares no sponsor1..3 keys (B/C/D precedent);
//  - `hashtags` is omitted — Sunset's story sponsors-off footer is the pack's
//    HASHTAG_FOOTER_STORY ({{clubHashtag}}) and the shared footer's
//    sponsors-off slot carries {{hashtagsExtra}} per Pack A's contract, so
//    nothing binds it.
//
// Bundle literals replaced with bindings:
//  - the story header tag "LEADING RUN-SCORERS · 2025/26" → {{subtitle}} (as
//    Gold Foil and Neon Night bound the same caption); {{season}} renders in
//    the shared header tag, as in Pack A;
//  - the script headline "Club Runs" → {{title}} (Pack A's title sample is the
//    same copy).

// ---------------------------------------------------------------------------
// Leader rows — transcribed from the bundle: frosted glass rows (glassPanel
// matches the bundle row's fill/border/radius/blur verbatim) with an accent
// grade letter, white leader name and white value. The bundle's two nested
// wrappers (flex column + gapped column) collapse into the one data-repeat
// group. Story bakes the k-scaled sizes; shared keeps them on `--k`.
// ---------------------------------------------------------------------------

const storyRow = glassPanel(
  `<div style="width:100px;flex:none;text-align:center">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:76px;color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;font-weight:700;font-size:34px;color:#fff">{{row.playerName}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:81px;color:#fff">{{row.value}}</div>`,
  ";flex:1;min-height:0;display:flex;align-items:center;gap:26px;padding:0 30px",
);

const sharedRow = glassPanel(
  `<div style="width:100px;flex:none;text-align:center">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*54px);color:var(--gold,#F5B21A)">{{row.gradeLabel}}</div>` +
    `<div style="font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:4px">{{row.gradeSub}}</div></div>` +
    `<div style="flex:1;font-weight:700;font-size:34px;color:#fff">{{row.playerName}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);color:#fff">{{row.value}}</div>`,
  ";flex:1;min-height:0;display:flex;align-items:center;gap:26px;padding:0 30px",
);

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// This stat-card family's story header differs from fragments' `storyHeader`
// (transcribed from match-result: 92px logo, 18px gap, 14px tagline): the
// bundle sets an 84px circular logo, 16px gap and a 13px tagline. Transcribed
// inline here.
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

// The bundle's `margin-top:calc(var(--k)*14px)` on both sponsor branches
// becomes one flex spacer, as match-result's story did.
const storyHtml = storyColumnRoot(
  statStoryHeader("{{subtitle}}") +
    `<div style="flex:none;margin-top:14px">` +
    scriptText("{{title}}", 78) +
    `</div>` +
    `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:22px">${storyRow}</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

// Pack A's shared footer contract: club hashtag left; presented-by right when
// sponsors are on, the secondary hashtag when they are off. The sponsor name
// stays white, matching the pack's PRESENTED_BY_STORY.
const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;margin-top:calc(var(--k,1.4)*16px)">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  sponsorsOff(
    `<div style="font-weight:700;font-size:22px;letter-spacing:.12em;color:var(--gold,#FBAC27)">{{hashtagsExtra}}</div>`,
  ) +
  `</div>`;

// Subtitle stays accent-gold as in Pack A's shared; the title keeps the
// story's Kaushan script so the pack's identity carries into portrait/square
// (`extraStyle` re-sizes the script with `--k`, the same override pattern B/D
// use on foilText/neonText).
const sharedHtml = sharedColumnRoot(
  sharedHeader("{{category}}", "{{season}}") +
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{subtitle}}</div>` +
    scriptText("{{title}}", 72, ";font-size:calc(var(--k,1.4)*72px);margin-top:10px") +
    `</div>` +
    `<div data-repeat="leaders" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;margin-top:calc(var(--k,1.4)*16px)">${sharedRow}</div>` +
    sharedFooterRow,
);

export const clubLeaderboardRuns: PackCardTemplate = {
  kind: "clubLeaderboard",
  designKey: "club-leaderboard-runs",
  name: "Club Leaders — Runs",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("category", "Category chip", "TOP RUNS"),
    textField("season", "Season", "2025/26"),
    textField("subtitle", "Subtitle", "LEADING RUN-SCORERS · BY GRADE"),
    textField("title", "Title", "CLUB RUNS"),
    repeatField("leaders", "Per-grade leader rows", "4 grade leaders"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtagsExtra", "Secondary hashtag", "#YOURLEAGUE"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  repeats: [
    {
      key: "leaders",
      maxRows: 4,
      fields: [
        textField("gradeLabel", "Grade", "A"),
        textField("gradeSub", "Grade sub-label", "GRADE"),
        textField("playerName", "Leader", "Jack Manuel"),
        textField("value", "Value", "428"),
      ],
    },
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
