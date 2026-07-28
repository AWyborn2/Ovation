import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  PRESENTED_BY_STORY,
  SHARED_BG,
  STORY_BG,
  clubHeaderFields,
  foilText,
  photoField,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// B18 — Leading Wicket-Taker (gradeLeader · Wickets preset). Same layout as
// B13 with the category swapped — see grade-leader-runs.ts for the
// transcription notes (single fluid bundle layout; story transcribed, shared
// authored from Pack A; sponsor strip → presented-by line for R4 parity).

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

function centredStoryHeader(tag: string): string {
  return (
    `<div style="flex:none;text-align:center">` +
    `<div style="width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font:600 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.34em;color:rgba(255,255,255,.6)">{{clubName}}</div>` +
    `<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-top:15px">` +
    `<span style="width:90px;height:1px;background:linear-gradient(90deg,transparent,var(--gold,#F5B21A))"></span>` +
    `<span style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#F5B21A)">${tag}</span>` +
    `<span style="width:90px;height:1px;background:linear-gradient(90deg,var(--gold,#F5B21A),transparent)"></span>` +
    `</div></div>`
  );
}

const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*14px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;text-align:center;font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:var(--gold,#F5B21A);margin-top:calc(var(--k,1.4)*14px)">{{hashtags}}</div>`,
  );

const storyHtml = columnRoot(
  STORY_BG,
  centredStoryHeader("{{grade}} LEADERBOARD") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:calc(var(--k,1.4)*12px)">` +
    `<div>` +
    foilText("{{value}}", 190, ";font-size:calc(var(--k,1.4)*190px);line-height:.82") +
    `<div style="font:600 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:rgba(255,255,255,.62);margin-top:14px">LEADING WICKET-TAKER</div></div>` +
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:520px;margin:calc(var(--k,1.4)*16px) 0;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>` +
    `<div>` +
    foilText("{{playerName}}", 66, ";font-size:calc(var(--k,1.4)*66px)") +
    `<div style="font:600 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.55);margin-top:13px">{{category}} · {{season}}</div></div>` +
    `</div>` +
    storyFooters,
  "60px 70px 54px",
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A's shared is the guide
// ---------------------------------------------------------------------------

const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:var(--gold,#F5B21A);font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

const sharedHtml = columnRoot(
  SHARED_BG +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#070603) 0%, rgba(7,6,3,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#070603), transparent)"></div>`,
  sharedHeader("LEADERBOARD", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)"><span>{{grade}}</span> LEADERBOARD</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);line-height:.92;margin-top:8px;text-transform:uppercase">LEADING<br>WICKET-TAKER</div>` +
    foilText(
      "{{value}}",
      172,
      ";font-size:calc(var(--k,1.4)*172px);line-height:.86;margin-top:calc(var(--k,1.4)*10px)",
    ) +
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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Stats source", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
