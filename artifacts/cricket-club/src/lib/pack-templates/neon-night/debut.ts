import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  accentChip,
  logoField,
  neonText,
  photoField,
  sharedColumnRoot,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// D11 — A Grade Debut. Cap presentation — cyan-ring photo, neon name, big cap
// number.
//
// Field keys mirror Broadcast Dark's debut, INCLUDING its deviation: no
// clubName/clubTagline — the reference design's header carries the grade
// block, so the only header field is clubLogo. The bundle's story header set
// the club wordmark as a literal; with no clubName key available for this
// kind, the header keeps the pack's cyan-glow logo ring and binds {{grade}}
// into the glowing tag ("◍ {{grade}} DEBUT" + season), so the tenant's
// identity still comes from the logo.
//
// Binding fixes folded in per Pack A: the bundle baked the round/opponent line
// as one literal and bound {{capNumber}} on the whole "CAP 246" string — here
// the meta line binds {{round}} / {{opponent}}, {{tributeLine}} (a Pack A key
// the bundle dropped) is restored under it, and "CAP " stays in the template.
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "debut" does not declare — replaced with the pack's
// presented-by line; the sponsors-off hashtag footers come from the pack
// fragments ({{hashtags}}, which this kind declares).
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in on storyColumnRoot. The shared layout is authored from Pack A's
// shared structure (grade header, name + cap column, photo right) in Neon
// Night's language.

const STORY_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:540px;margin-bottom:20px">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:22px;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(4,7,13,.9)"></div></div></div>`;

const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:22px;overflow:hidden;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(4,7,13,.9)"></div></div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — cyan-ring photo, neon name, meta + tribute, CAP hero
// ---------------------------------------------------------------------------

/** This card's stand-in for storyHeader (which needs {{clubName}}): the cyan
 * glow logo ring left, the glowing "◍ {{grade}} DEBUT" tag + season right. */
const storyHeaderDebut =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="width:96px;height:96px;border-radius:50%;overflow:hidden;box-shadow:0 0 24px rgba(55,207,230,.6),0 0 0 2px rgba(55,207,230,.5)">${CLUB_LOGO_SLOT}</div>` +
  `<div style="text-align:right">` +
  `<div style="font:700 20px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.9)">◍ {{grade}} DEBUT</div>` +
  `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.5);margin-top:10px">{{season}}</div>` +
  `</div></div>`;

const storyHtml = storyColumnRoot(
  storyHeaderDebut +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;margin:20px 0 22px">` +
    STORY_PHOTO +
    `<div style="flex:none">` +
    neonText("{{playerName}}", 87, "gold", ";line-height:.9") +
    `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-top:10px">Round {{round}} · vs {{opponent}}</div>` +
    `<div style="font-weight:500;font-size:22px;line-height:1.4;color:rgba(255,255,255,.75);margin-top:10px;max-width:640px">{{tributeLine}}</div>` +
    `</div>` +
    neonText("CAP {{capNumber}}", 129, "cyan", ";line-height:.9;flex:none;margin-top:14px") +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: grade header, name + cap left, photo
// right
// ---------------------------------------------------------------------------

/** Shared header: logo + grade left, accent DEBUT chip + season right. */
const sharedHeaderDebut =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="display:flex;align-items:center;gap:20px">` +
  `<div style="width:100px;height:100px;flex:none">${slot("clubLogo", "logo", "rect")}</div>` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*40px);line-height:.92;text-transform:uppercase;color:var(--gold,#FBAC27)">{{grade}}</div>` +
  `</div>` +
  `<div style="text-align:right">${accentChip("DEBUT")}` +
  `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.6);margin-top:11px">{{season}}</div></div>` +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeaderDebut +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*16px)">` +
    `<div><div style="font:700 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7)">FIRST GRADE DEBUT</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*72px);line-height:.92;color:var(--gold,#FBAC27);text-transform:uppercase;margin-top:14px">{{playerName}}</div></div>` +
    `<div style="font:600 20px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5)">Round {{round}} · vs {{opponent}}</div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.4;color:rgba(255,255,255,.75);max-width:560px">{{tributeLine}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*96px);line-height:.86;text-transform:uppercase">CAP {{capNumber}}</div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
