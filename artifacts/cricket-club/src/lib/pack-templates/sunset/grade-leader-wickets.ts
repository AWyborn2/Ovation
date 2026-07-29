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

// E18 — Leading Wicket-Taker (gradeLeader · Wickets preset). Same layout as
// E13 with the category swapped — see grade-leader-runs.ts for the
// transcription notes (single fluid bundle layout with only sponsor `<sc-if>`
// branches; story transcribed with `--k` baked at 1.4, shared authored from
// Pack A; sponsor strip → presented-by line and `hashtags` omitted for R4
// parity; header tag → "{{grade}} LEADERBOARD"; panel chip →
// "{{category}} · {{season}}"; flavour sub-line dropped).
//
// The one per-preset difference beyond samples: the bundle's caption script
// reads "Leading Wickets" (not "Leading Wicket-Taker") — kept verbatim, as
// Pack A hard-codes its own caption per preset module.

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

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

const storyLayers =
  STORY_BG +
  `<div data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`;

const storyHtml = columnRoot(
  storyLayers,
  statStoryHeader("{{grade}} LEADERBOARD") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Leading Wickets", 87) +
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

const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

const sharedHtml = columnRoot(
  SHARED_BG +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#120a07) 0%, rgba(18,10,7,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#120a07), transparent)"></div>`,
  sharedHeader("LEADERBOARD", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)"><span>{{grade}}</span> LEADERBOARD</div>` +
    scriptText("Leading Wickets", 54, ";font-size:calc(var(--k,1.4)*54px);margin-top:10px") +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*172px);line-height:.86;margin-top:calc(var(--k,1.4)*10px)">{{value}}</div>` +
    `<div style="font:600 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:calc(var(--k,1.4)*10px)">{{category}}</div>` +
    `<div style="font-weight:700;font-size:56px;line-height:1;margin-top:10px">{{playerName}}</div>` +
    `</div>` +
    sharedFooterRow,
  "58px 66px 52px",
);

export const gradeLeaderWickets: PackCardTemplate = {
  kind: "gradeLeader",
  designKey: "grade-leader-wickets",
  name: "Leading Wicket-Taker",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("grade", "Grade", "A GRADE"),
    textField("category", "Category", "WICKETS"),
    textField("value", "Leading value", "24"),
    textField("playerName", "Leader", "Alex Osborne"),
    textField("season", "Season", "2025/26"),
    photoField("photo", "Player photo", "Bowler photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
