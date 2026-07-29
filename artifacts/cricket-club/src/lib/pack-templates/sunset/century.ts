import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  STORY_BG,
  clubHeaderFields,
  glassPanel,
  photoField,
  scriptText,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// E16 — Century. Hundred — runs, balls, opponent & round on a full-bleed
// batter photo.
//
// Field keys are IDENTICAL to Broadcast Dark's century: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The bundle's hero
// binds `data-field="value"` — that is {{runs}} in the reference contract
// ("112*", star included). The glass card's gold meta line binds
// {{balls}} BALLS · vs {{opponent}} · RD {{round}} at field granularity; the
// bundle's left sub-line was a club-identity literal (a colours strapline),
// which has no key of its own — it binds {{grade}} instead, the only
// reference key that fits the slot, keeping every declared key bound and no
// literal in the template.
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "century" does not declare — replaced with the pack's
// presented-by line; the sponsors-off hashtag footers come from the pack
// fragments ({{clubHashtag}} story-side, {{hashtags}} shared-side — both
// declared by this kind).
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in to px (62→87, 138→193, 14→20). The shared layout is authored from
// Broadcast Dark's shared structure (figures block left, photo right) in
// Sunset's language.

/** Sunset wash beneath a full-bleed photo under the bundle's scrims; the
 * photo drops to the pack's own sky when nothing is bound. */
const STORY_LAYERS =
  STORY_BG +
  `<div data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`;

/** Sunset-styled photo panel for the authored shared layout: gold hairline
 * ring + bottom scrim; drops entirely when no photo is bound. */
const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:20px;overflow:hidden;box-shadow:0 0 0 2px color-mix(in srgb, var(--gold,#FBAC27) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(10,6,3,.9)"></div></div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — full-bleed photo, script flourish, giant runs, glass
// meta card at the foot (spacer absorbs the sky, so the layout stays
// balanced when the photo drops)
// ---------------------------------------------------------------------------

const storyHtml = columnRoot(
  STORY_LAYERS,
  storyHeader("Raised the Bat") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Century", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:193px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:6px">{{runs}}</div>` +
    `<div style="margin-top:16px">` +
    glassPanel(
      `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px">` +
        `<div style="flex:1;min-width:0">` +
        `<div style="font-weight:800;font-size:36px;line-height:1.05;color:#fff">{{playerName}}</div>` +
        `<div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6);margin-top:6px">{{grade}}</div>` +
        `</div>` +
        `<div style="font:700 15px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:var(--gold,#F5B21A);text-align:right;flex:none">{{balls}} BALLS · vs {{opponent}} · RD {{round}}</div>` +
        `</div>`,
      ";padding:26px 28px",
    ) +
    `</div>` +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: figures block left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("CENTURY", "MILESTONE") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    // justify-content keeps the column balanced whether or not the photo
    // panel is present.
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*10px)">` +
    `<div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*44px);line-height:1;color:var(--gold,#F5B21A);text-shadow:0 3px 18px rgba(0,0,0,.75)">Century</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*140px);line-height:.86;color:#fff;margin-top:calc(var(--k,1.4)*6px)"><span>{{runs}}</span><span style="font-size:calc(var(--k,1.4)*44px);color:rgba(255,255,255,.6)"> ({{balls}})</span></div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*54px);line-height:.92;color:var(--gold,#FBAC27);text-transform:uppercase;margin-top:calc(var(--k,1.4)*8px)">{{playerName}}</div>` +
    `<div style="font:600 22px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:8px">{{grade}} · vs {{opponent}} · RD {{round}}</div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
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
