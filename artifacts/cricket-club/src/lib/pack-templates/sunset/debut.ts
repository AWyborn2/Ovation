import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  SHARED_BG,
  STORY_BG,
  glassPanel,
  goldChip,
  logoField,
  photoField,
  scriptText,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// E11 — A Grade Debut. Cap presentation — full-bleed photo, script flourish,
// glass card with the big cap number.
//
// Field keys mirror Broadcast Dark's debut, INCLUDING its deviation: no
// clubName/clubTagline — the reference design's header carries the grade
// block, so the only header field is clubLogo. The bundle's story header set
// the club wordmark as a literal; with no clubName key available for this
// kind, the header keeps Sunset's circular logo and sets {{grade}} beside it,
// with a gold DEBUT tag + {{season}} on the right — the tenant's identity
// still comes from the logo.
//
// Binding fixes folded in per Pack A (as Packs B/C/D did): the bundle baked
// the round/opponent line as one literal and bound {{capNumber}} on the whole
// "CAP 246" string — here the meta line binds {{round}} / {{opponent}},
// {{tributeLine}} (a Pack A key the bundle dropped) is restored under it, and
// the "CAP " prefix stays in the template.
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "debut" does not declare — replaced with the pack's
// presented-by line; the sponsors-off hashtag footers come from the pack
// fragments ({{clubHashtag}} story-side, {{hashtags}} shared-side — both
// declared by this kind).
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in to px (62→87, 84→118, 14→20). The shared layout is authored from
// Broadcast Dark's shared structure (grade header, bottom-anchored name +
// cap block over a full-bleed photo) in Sunset's language.

/** Full-bleed photo over the sunset wash; drops to the pack's own sky when no
 * photo is bound — the scrims read correctly over either. */
function photoLayers(base: string): string {
  return (
    base +
    `<div data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}</div>` +
    `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
    `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`
  );
}

/** Glass meta card: round/opponent + restored tribute left, CAP number right. */
function capPanel(extraStyle: string): string {
  return glassPanel(
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px">` +
      `<div style="flex:1;min-width:0">` +
      `<div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">Round {{round}} · vs {{opponent}}</div>` +
      `<div style="font-weight:500;font-size:20px;line-height:1.4;color:rgba(255,255,255,.75);margin-top:8px">{{tributeLine}}</div>` +
      `</div>` +
      `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:56px;line-height:.9;color:var(--gold,#F5B21A);flex:none">CAP {{capNumber}}</div>` +
      `</div>`,
    extraStyle,
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920) — full-bleed cap-presentation photo, script flourish,
// name, glass cap card at the foot (spacer absorbs the sky, so the layout
// stays balanced when the photo drops)
// ---------------------------------------------------------------------------

/** This card's stand-in for storyHeader (which needs {{clubName}}): circular
 * logo + {{grade}} left, gold DEBUT tag + {{season}} right. */
const storyHeaderDebut =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="display:flex;align-items:center;gap:18px">` +
  `<div style="width:92px;height:92px;border-radius:50%;overflow:hidden;flex:none">${CLUB_LOGO_SLOT}</div>` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:40px;line-height:.95;text-transform:uppercase;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.7)">{{grade}}</div>` +
  `</div>` +
  `<div style="text-align:right">` +
  `<div style="font:700 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.85)">DEBUT</div>` +
  `<div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.72);margin-top:8px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{season}}</div>` +
  `</div>` +
  `</div>`;

const storyHtml = columnRoot(
  photoLayers(STORY_BG),
  storyHeaderDebut +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("First Grade Debut", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:118px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:6px">{{playerName}}</div>` +
    `<div style="margin-top:16px">${capPanel(";padding:26px 28px")}</div>` +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: grade header, bottom-anchored script +
// name + glass cap card over the full-bleed photo
// ---------------------------------------------------------------------------

/** Shared header: rect logo + grade left, gold DEBUT chip + season right. */
const sharedHeaderDebut =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="display:flex;align-items:center;gap:20px">` +
  `<div style="width:100px;height:100px;flex:none">${slot("clubLogo", "logo", "rect")}</div>` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*40px);line-height:.95;text-transform:uppercase;color:var(--gold,#FBAC27);text-shadow:0 2px 12px rgba(0,0,0,.7)">{{grade}}</div>` +
  `</div>` +
  `<div style="text-align:right">${goldChip("DEBUT")}` +
  `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.72);margin-top:11px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{season}}</div></div>` +
  `</div>`;

const sharedHtml = columnRoot(
  photoLayers(SHARED_BG),
  sharedHeaderDebut +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:calc(var(--k,1.4)*14px);padding:calc(var(--k,1.4)*14px) 0">` +
    `<div>` +
    `<div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*44px);line-height:1;color:var(--gold,#F5B21A);text-shadow:0 3px 18px rgba(0,0,0,.75)">First Grade Debut</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:10px">{{playerName}}</div>` +
    `</div>` +
    capPanel(";padding:24px 26px") +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
  "58px 66px 52px",
);

export const debut: PackCardTemplate = {
  kind: "debut",
  designKey: "debut",
  name: "A Grade Debut",
  sponsorVariants: ["on", "off"],
  fields: [
    // No clubName/clubTagline: like Pack A, this card's header shows the grade
    // block, so only the logo comes from the header set.
    logoField("clubLogo", "Club logo", "Club logo"),
    textField("grade", "Grade", "A GRADE MENS"),
    textField("season", "Season", "2025/26"),
    textField("playerName", "Player name", "Oscar Smith"),
    textField("round", "Round", "2"),
    textField("opponent", "Opponent", "Rockingham Hornets"),
    textField("tributeLine", "Tribute line", "welcome to the top grade, Oscar."),
    textField("capNumber", "Cap number", "246"),
    photoField("photo", "Debut photo", "Cap presentation / debut photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
