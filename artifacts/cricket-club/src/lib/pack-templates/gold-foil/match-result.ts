import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  SPONSOR_STRIP_SHARED,
  STORY_BG,
  clubHeaderFields,
  foilText,
  formatRoot,
  logoField,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// B1 — Match Result. Like Pack A's A1, the only Gold Foil card with three
// distinct layouts in the bundle (isStoryFmt / isTallFmt / isSquareFmt).
//
// Field keys are deliberately IDENTICAL to Broadcast Dark's match-result:
// `bindInput` in pack-render.ts maps a ShareCardInput onto keys per card KIND,
// not per pack, so a pack that renamed a key would silently render samples.

// ---------------------------------------------------------------------------
// Story (1080×1920) — centred foil composition with a photo hero
// ---------------------------------------------------------------------------

const storyHtml = formatRoot(
  STORY_BG +
    storyHeader("{{matchTitle}}") +
    `<div style="position:absolute;top:206px;left:40px;right:40px;text-align:center">` +
    foilText("MATCH<br>RESULT", 150) +
    `</div>` +
    // Photo hero: gold ring + an inner bottom scrim so the result line below
    // stays legible over a bright celebration shot.
    `<div style="position:absolute;top:560px;left:90px;right:90px;height:632px;border-radius:14px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 55%, transparent),0 30px 70px -30px rgba(0,0,0,.95)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -120px 130px -60px rgba(8,9,11,.92)"></div></div>` +
    `<div style="position:absolute;top:1244px;left:40px;right:40px;text-align:center;font-family:'Bricolage Grotesque','IBM Plex Sans',sans-serif;font-weight:800;font-size:62px;line-height:1;letter-spacing:-.01em;color:#fff">{{result}}</div>` +
    // Two score columns split by a gold hairline.
    `<div style="position:absolute;top:1392px;left:80px;right:80px;display:flex;align-items:stretch">` +
    `<div style="flex:1;text-align:center;padding:0 18px">` +
    `<div style="font-weight:600;font-size:22px;line-height:1.2;color:rgba(255,255,255,.6)">{{opposition.name}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:78px;line-height:1;margin-top:12px">{{opposition.score}}</div>` +
    `<div style="font:500 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.45);margin-top:8px">{{opposition.oversLabel}}</div></div>` +
    `<div style="width:2px;background:linear-gradient(180deg,transparent,color-mix(in srgb, var(--gold,#FBAC27) 65%, transparent),transparent)"></div>` +
    `<div style="flex:1;text-align:center;padding:0 18px">` +
    `<div style="font-weight:700;font-size:22px;line-height:1.2;color:var(--gold,#F5B21A)">{{club.name}}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:78px;line-height:1;margin-top:12px;color:var(--gold,#F5B21A)">{{club.score}}</div>` +
    `<div style="font:500 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:color-mix(in srgb, var(--gold,#FBAC27) 72%, transparent);margin-top:8px">{{club.oversLabel}}</div></div>` +
    `</div>` +
    // Gold ribbon: the pack's hero callout.
    `<div style="position:absolute;bottom:118px;left:80px;right:80px;background:linear-gradient(90deg,#C8860A,var(--gold,#F5B21A) 42%,#FFDE8A 66%,var(--gold,#F5B21A));border-radius:12px;padding:24px 30px;display:flex;align-items:center;justify-content:center;gap:20px;box-shadow:0 20px 50px -22px color-mix(in srgb, var(--gold,#FBAC27) 70%, transparent)">` +
    `<span style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:#3a2600">PLAYER OF THE MATCH</span>` +
    `<span style="width:8px;height:8px;border-radius:50%;background:#3a2600"></span>` +
    `<span style="font-weight:800;font-size:30px;line-height:1;color:#241700">{{potm.name}} — {{potm.figures}}</span></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
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

/** Cyan POTM panel — the one non-gold accent, shared by both non-story sizes. */
function potmPanel(opts: {
  gap: number;
  padding: string;
  radius: number;
  photo: string;
  photoRadius: number;
  labelSize: number;
  nameStyle: string;
  figuresSize: number;
  figuresMarginTop: number;
  detailSize: number;
}): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;gap:${opts.gap}px;background:linear-gradient(90deg,rgba(55,207,230,.14),rgba(255,255,255,.03));border:1px solid rgba(55,207,230,.34);border-radius:${opts.radius}px;padding:${opts.padding}">` +
    `<div style="width:${opts.photo};height:${opts.photo};border-radius:${opts.photoRadius}px;overflow:hidden;flex:none;box-shadow:0 0 0 2px rgba(55,207,230,.4)">${slot("potm.photo", "photo", "rounded", opts.photoRadius)}</div>` +
    `<div style="flex:1;min-width:0">` +
    `<div style="font:700 ${opts.labelSize}px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#37CFE6">PLAYER OF THE MATCH</div>` +
    `<div style="${opts.nameStyle}">{{potm.name}}</div>` +
    `<div style="font-weight:700;font-size:${opts.figuresSize}px;line-height:1;margin-top:${opts.figuresMarginTop}px">{{potm.figures}} <span style="font-weight:500;color:rgba(255,255,255,.6);font-size:${opts.detailSize}px">{{potm.detail}}</span></div>` +
    `</div></div>`
  );
}

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
  potmPanel({
    gap: 26,
    padding: "24px 26px",
    radius: 18,
    photo: "calc(var(--k,1.4)*128px)",
    photoRadius: 14,
    labelSize: 20,
    nameStyle:
      "font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:.92;color:var(--gold,#FBAC27);margin-top:12px",
    figuresSize: 32,
    figuresMarginTop: 10,
    detailSize: 24,
  }) +
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
  potmPanel({
    gap: 22,
    padding: "20px 24px",
    radius: 16,
    photo: "118px",
    photoRadius: 12,
    labelSize: 17,
    nameStyle:
      "font-family:var(--disp,'Anton'),sans-serif;font-size:54px;line-height:.92;color:var(--gold,#FBAC27);margin-top:9px",
    figuresSize: 26,
    figuresMarginTop: 7,
    detailSize: 20,
  }) +
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
    textField("potm.name", "Player of the match", "ALEX OSBORNE"),
    textField("potm.figures", "POTM figures", "3/13"),
    textField("potm.detail", "POTM detail", "(4 overs)"),
    photoField("potm.photo", "POTM photo", "Player photo"),
    photoField("photo", "Hero photo", "Celebration / action photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
    logoField("sponsor1", "Sponsor logo 1", "Sponsor"),
    logoField("sponsor2", "Sponsor logo 2", "Sponsor"),
    logoField("sponsor3", "Sponsor logo 3", "Sponsor"),
  ],
  formats: {
    story: storyHtml,
    portrait: portraitHtml,
    square: squareHtml,
  },
};
