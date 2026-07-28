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

// C18 — Leading Wicket-Taker (gradeLeader · Wickets preset). Same layout as
// C13 with the category swapped — see grade-leader-runs.ts for the full
// transcription notes (one fluid bundle layout, sponsors-only `<sc-if>`
// branches, authored shared, dropped sponsor strip, omitted `hashtags` key).
//
// Per-preset bundle literals here: the value caption "LEADING WICKET-TAKER ·
// {{category}}" and the leader sub-line "LEADING THE ATTACK" (club-agnostic
// design copy, kept verbatim).

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

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

const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${HASHTAG_FOOTER_STORY}</div>`,
  );

const storyHtml = storyColumnRoot(
  logoStoryHeader("{{grade}} LEADERBOARD", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;padding-top:calc(var(--k,1.4)*16px);gap:calc(var(--k,1.4)*14px)">` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*166px);line-height:.78;text-transform:uppercase;color:#fff">{{value}}</div>` +
    `<div style="margin-top:10px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">LEADING WICKET-TAKER · {{category}}</div></div></div>` +
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;position:relative;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
    slot("photo", "photo") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div>` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);color:var(--gold,#F5B21A);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="margin-top:8px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">LEADING THE ATTACK</div></div></div>` +
    `</div>` +
    storyFooters,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:800;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.55)">presented by <span style="color:var(--gold,#F5B21A)">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

const sharedHtml = columnRoot(
  SHARED_BG +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--block,#0E1C31) 0%, rgba(14,28,49,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--block,#0E1C31), transparent)"></div>`,
  sharedHeader("LEADERBOARD", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#FBAC27)">{{grade}} LEADERBOARD</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);line-height:.92;margin-top:8px;text-transform:uppercase">LEADING<br>WICKET-TAKER</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*166px);line-height:.82;margin-top:calc(var(--k,1.4)*10px)">{{value}}</div>` +
    `<div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:calc(var(--k,1.4)*10px)">{{category}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:1;color:var(--gold,#F5B21A);text-transform:uppercase;margin-top:10px">{{playerName}}</div>` +
    `</div>` +
    sharedFooterRow,
  "58px 66px 52px",
);

export const gradeLeaderWickets: PackCardTemplate = {
  kind: "gradeLeader",
  designKey: "grade-leader-wickets",
  name: "Leaderboard — Leading Wicket-Taker",
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
