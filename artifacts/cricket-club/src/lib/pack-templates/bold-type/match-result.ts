import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  SPONSOR_STRIP_SHARED,
  STORY_BG,
  clubHeaderFields,
  formatRoot,
  logoField,
  outlineText,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// C1 — Match Result. Like Packs A and B, the only Bold Type card with three
// distinct layouts in the bundle (isStoryFmt / isTallFmt / isSquareFmt — all
// three are real markup branches, verified in the html, not just script flags).
//
// Field keys are deliberately IDENTICAL to Broadcast Dark's match-result:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack, so a pack that renamed a key would silently render samples.
// This card declares a strict SUBSET of Pack A's keys (no `photo` — the story
// is "pure typography" by design, so no allowlist entry is needed).

// ---------------------------------------------------------------------------
// Story (1080×1920) — oversized score as hero, flat blocks, no photo
// ---------------------------------------------------------------------------

// Kept on the bundle's absolute pins rather than reflowed into a column: the
// composition is two fixed colour bands split at y=1440 (block field above,
// solid gold below) and — with the POTM column replaced by real performer
// data — nothing in it is conditional, so nothing can collapse into a hole.
// The sponsors on/off variants swap footer text in place, not layout.
//
// Departures from the bundle, all field-granularity driven:
//  - the giant score's gold wicket suffix ("102" + gold "/2") can't be split
//    out of the single {{club.score}} field, so the whole score sets solid;
//  - the result's mixed solid/outline line ("WON BY" solid, "8 WICKETS"
//    outlined) becomes the whole {{result}} in the outline treatment — the
//    pack's signature moment survives at full size;
//  - the gold band's "TOP BAT" / "PLAYER OF THE MATCH" columns are replaced by
//    club/opposition performers: `potm.*` is not on ShareCardInput and nothing
//    populates it, so the bundle's ribbon always announced a fabricated player
//    (see the same removal note in Packs A/B). Performer strings hold two
//    players, so 38px single-name type steps down to 30px wrapping type.
const storyHtml = formatRoot(
  STORY_BG +
    `<div style="position:absolute;top:1440px;left:0;right:0;bottom:0;background:var(--gold,#F5B21A)"></div>` +
    // Header: tracked mono club wordmark left, match tag right.
    `<div style="position:absolute;top:80px;left:80px;right:80px;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:var(--gold,#F5B21A)">{{clubName}}</div>` +
    `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:rgba(255,255,255,.55)">{{matchTitle}}</div></div>` +
    // Oversized club logo, top right of the score block.
    `<div style="position:absolute;top:236px;right:72px;width:330px;height:300px">${CLUB_LOGO_SLOT}</div>` +
    // The hero: club name, 230px score, overs line.
    `<div style="position:absolute;top:206px;left:80px;right:80px">` +
    `<div style="font-weight:700;font-size:30px;line-height:1;letter-spacing:.02em;color:var(--gold,#F5B21A)">{{club.name}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:230px;line-height:.78;letter-spacing:-.01em;margin-top:20px">{{club.score}}</div>` +
    `<div style="font:500 23px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:20px">{{club.oversLabel}}</div></div>` +
    // Opposition rule row: hard 2px hairline, small square logo, score right.
    `<div style="position:absolute;top:770px;left:80px;right:80px;display:flex;align-items:center;gap:22px;border-top:2px solid rgba(255,255,255,.16);padding-top:26px">` +
    `<div style="width:56px;height:56px;flex:none;border-radius:2px;overflow:hidden;box-shadow:0 0 0 2px rgba(255,255,255,.2)">${slot("opposition.logo", "logo", "rect")}</div>` +
    `<div style="font-weight:700;font-size:30px;line-height:1;color:rgba(255,255,255,.85)">{{opposition.name}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:72px;line-height:.9;color:rgba(255,255,255,.9);margin-left:auto">{{opposition.score}}</div>` +
    `<div style="font:500 20px/1 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.45)">{{opposition.oversLabel}}</div></div>` +
    // The result, hollow at poster size — the pack's signature treatment.
    `<div style="position:absolute;top:960px;left:80px;right:80px">${outlineText("{{result}}", 150)}</div>` +
    // Gold band: performer columns set in the accent's ink.
    `<div style="position:absolute;top:1494px;left:80px;right:80px;display:flex;gap:54px;color:var(--accent-ink,#1c1405)">` +
    `<div style="flex:1"><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;opacity:.7">TOP PERFORMERS</div>` +
    `<div style="font-weight:800;font-size:30px;line-height:1.15;margin-top:10px">{{club.performers}}</div></div>` +
    `<div style="flex:1"><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;opacity:.7">OPPOSITION</div>` +
    `<div style="font-weight:800;font-size:30px;line-height:1.15;margin-top:10px">{{opposition.performers}}</div></div></div>` +
    // Bottom bar inside the gold band. The bundle's sponsors-on credit was the
    // POTM sponsor line; the presented-by credit IS real tenant data so it
    // survives, and a hashtag row (absent in the bundle's story, present in
    // its non-story) fills the sponsors-off slot for parity.
    `<div style="position:absolute;bottom:70px;left:80px;right:80px;display:flex;align-items:center;justify-content:space-between;color:var(--accent-ink,#1c1405)">` +
    `<div style="font-weight:800;font-size:26px;line-height:1;letter-spacing:.01em">{{clubName}}</div>` +
    sponsorsOn(
      `<div style="font-weight:600;font-size:22px;line-height:1;opacity:.82">presented by <span style="font-weight:800">{{sponsorPresentedBy}}</span></div>`,
    ) +
    sponsorsOff(
      `<div style="font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.85">{{hashtags}}</div>`,
    ) +
    `</div>`,
);

// ---------------------------------------------------------------------------
// Non-story shared parts
// ---------------------------------------------------------------------------

const nonStoryHeader = sharedHeader("RESULT", "{{matchTitle}}");

const nonStoryFooters = sponsorsOn(SPONSOR_STRIP_SHARED) + sponsorsOff(HASHTAG_FOOTER_SHARED);

/** Result banner: gold-edged panel with a star, used by the tall layout. */
const resultBannerTall =
  `<div style="background:linear-gradient(90deg,var(--panel,#42342B),var(--panel-2,#241c17));border-left:9px solid var(--gold,#FBAC27);border-radius:9px;padding:24px 30px;display:flex;align-items:center;gap:20px;box-shadow:0 22px 44px -22px color-mix(in srgb, var(--panel,#42342B) 90%, transparent)">` +
  `<span style="font-size:38px;line-height:1;color:var(--gold,#FBAC27)">★</span>` +
  `<span style="font-weight:800;font-size:40px;line-height:1;letter-spacing:.01em">{{result}}</span></div>`;

/** One side's row in the tall layout. `mine` styles the club's own side gold. */
function tallTeamRow(side: "opposition" | "club", mine: boolean): string {
  const shell = mine
    ? `background:linear-gradient(90deg,color-mix(in srgb, var(--gold,#FBAC27) 17%, transparent),color-mix(in srgb, var(--gold,#FBAC27) 4%, transparent));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 42%, transparent)`
    : `background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)`;
  const logoBg = mine ? "#2a2410" : "#1f2530";
  const perfColour = mine ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.62)";
  const scoreColour = mine ? ";color:var(--gold,#FBAC27)" : "";
  const oversColour = mine
    ? "color-mix(in srgb, var(--gold,#FBAC27) 75%, transparent)"
    : "rgba(255,255,255,.5)";
  return (
    `<div style="display:flex;align-items:center;gap:24px;${shell};border-radius:16px;padding:24px 28px">` +
    `<div style="width:104px;height:104px;border-radius:13px;overflow:hidden;flex:none;background:var(--surface-2,${logoBg})">${slot(`${side}.logo`, "logo", "rounded", 13)}</div>` +
    `<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:36px;line-height:1.05">{{${side}.name}}</div>` +
    `<div style="font-weight:500;font-size:20px;line-height:1.5;color:${perfColour};margin-top:6px">{{${side}.performers}}</div></div>` +
    `<div style="text-align:right;flex:none">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:80px;line-height:.9${scoreColour}">{{${side}.score}}</div>` +
    `<div style="font:500 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:${oversColour};margin-top:5px">{{${side}.oversLabel}}</div></div></div>`
  );
}

// The cyan Player-of-the-Match panel lived here in the bundle (both non-story
// sizes). Removed for the same reason as the story's POTM column: nothing
// populates `potm.*`, so it always published a fabricated player.

// ---------------------------------------------------------------------------
// Portrait / tall (1080×1350)
// ---------------------------------------------------------------------------

const tallMiddle =
  `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;gap:20px;padding:calc(var(--k,1.4)*16px) 0">` +
  `<div style="flex:none">` +
  `<div style="display:flex;align-items:center;gap:13px;font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#FBAC27)">` +
  `<span style="width:14px;height:14px;border-radius:50%;background:var(--gold,#FBAC27);animation:hhPulse 2.6s ease-in-out infinite"></span>FULL TIME</div>` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*116px);line-height:.92;letter-spacing:.005em;margin-top:calc(var(--k,1.4)*14px);text-transform:uppercase">MATCH<br><span style="color:var(--gold,#FBAC27)">RESULT</span></div>` +
  `</div>` +
  `<div style="flex:none;display:flex;flex-direction:column;gap:18px">` +
  resultBannerTall +
  tallTeamRow("opposition", false) +
  `<div style="display:flex;align-items:center;gap:20px"><div style="flex:1;height:1px;background:rgba(255,255,255,.15)"></div>` +
  `<span style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27)">{{resultVerb}}</span>` +
  `<div style="flex:1;height:1px;background:rgba(255,255,255,.15)"></div></div>` +
  tallTeamRow("club", true) +
  `</div>` +
  `</div>`;

const portraitHtml = sharedColumnRoot(nonStoryHeader + tallMiddle + nonStoryFooters);

// ---------------------------------------------------------------------------
// Square (1080×1080) — the two sides sit side by side
// ---------------------------------------------------------------------------

/** One side's column in the square layout. */
function squareTeamCol(side: "opposition" | "club", mine: boolean): string {
  const shell = mine
    ? `background:linear-gradient(160deg,color-mix(in srgb, var(--gold,#FBAC27) 17%, transparent),color-mix(in srgb, var(--gold,#FBAC27) 4%, transparent));border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 42%, transparent)`
    : `background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)`;
  const logoBg = mine ? "#2a2410" : "#1f2530";
  const scoreColour = mine ? ";color:var(--gold,#FBAC27)" : "";
  const oversColour = mine
    ? "color-mix(in srgb, var(--gold,#FBAC27) 75%, transparent)"
    : "rgba(255,255,255,.5)";
  const perfColour = mine ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.62)";
  return (
    `<div style="flex:1;display:flex;flex-direction:column;${shell};border-radius:16px;padding:26px 28px">` +
    `<div style="display:flex;align-items:center;gap:15px">` +
    `<div style="width:70px;height:70px;border-radius:11px;overflow:hidden;flex:none;background:var(--surface-2,${logoBg})">${slot(`${side}.logo`, "logo", "rounded", 11)}</div>` +
    `<div style="font-weight:700;font-size:27px;line-height:1.08">{{${side}.name}}</div></div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:104px;line-height:.86;margin-top:auto;padding-top:18px${scoreColour}">{{${side}.score}}</div>` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:${oversColour};margin-top:8px">{{${side}.oversLabel}}</div>` +
    `<div style="font-weight:500;font-size:19px;line-height:1.5;color:${perfColour};margin-top:12px">{{${side}.performers}}</div></div>`
  );
}

const squareMiddle =
  `<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;padding:16px 0">` +
  // Compact result banner: FULL TIME and the result share one bar.
  `<div style="flex:none;display:flex;align-items:center;gap:16px;background:linear-gradient(90deg,var(--panel,#42342B),var(--panel-2,#241c17));border-left:8px solid var(--gold,#FBAC27);border-radius:9px;padding:20px 26px;box-shadow:0 20px 40px -22px color-mix(in srgb, var(--panel,#42342B) 90%, transparent)">` +
  `<span style="font:600 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:var(--gold,#FBAC27);display:flex;align-items:center;gap:11px">` +
  `<span style="width:12px;height:12px;border-radius:50%;background:var(--gold,#FBAC27);animation:hhPulse 2.6s ease-in-out infinite"></span>FULL TIME</span>` +
  `<span style="width:1px;height:34px;background:rgba(255,255,255,.2)"></span>` +
  `<span style="font-weight:800;font-size:38px;line-height:1;letter-spacing:.01em">{{result}}</span></div>` +
  `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:16px">` +
  squareTeamCol("opposition", false) +
  `<div style="flex:none;align-self:center;font:700 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#FBAC27);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:14px 12px;writing-mode:vertical-rl;text-orientation:upright">{{resultVerbShort}}</div>` +
  squareTeamCol("club", true) +
  `</div>` +
  `</div>`;

const squareHtml = sharedColumnRoot(nonStoryHeader + squareMiddle + nonStoryFooters);

export const matchResult: PackCardTemplate = {
  kind: "matchSummary",
  designKey: "match-result",
  name: "Match Result",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("matchTitle", "Match title", "GAME 2 · ROUND 2"),
    textField("result", "Result banner", "YOUR CLUB WON BY 8 WICKETS"),
    textField("resultVerb", "Result verb (divider)", "DEFEATED BY"),
    textField("resultVerbShort", "Result verb (square, abbreviated)", "DEF"),
    textField("club.name", "Club side name", "Your Club"),
    textField("club.score", "Club score", "2/102"),
    textField("club.oversLabel", "Club overs label", "15 OVERS"),
    textField("club.performers", "Club top performers", "J. Manuel 39* (38) · T. Miles 35* (35)"),
    logoField("club.logo", "Club side logo", "Logo"),
    textField("opposition.name", "Opposition name", "Rockingham Hornets"),
    textField("opposition.score", "Opposition score", "9/97"),
    textField("opposition.oversLabel", "Opposition overs label", "20 OVERS"),
    textField(
      "opposition.performers",
      "Opposition top performers",
      "E. Smith 33 (28) · A. Beattie 2/9 (4)",
    ),
    logoField("opposition.logo", "Opposition logo", "Logo"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
  ],
  formats: {
    story: storyHtml,
    portrait: portraitHtml,
    square: squareHtml,
  },
};
