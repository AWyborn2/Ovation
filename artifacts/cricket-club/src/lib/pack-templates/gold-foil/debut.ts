import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  foilText,
  goldChip,
  logoField,
  photoField,
  sharedColumnRoot,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// B11 — A Grade Debut. Cap presentation — photo, foil name, big cap number.
//
// Field keys are IDENTICAL to Broadcast Dark's debut, and like Pack A's A11
// this card declares clubLogo ONLY from the header set — no clubName /
// clubTagline, because the reference design's header carries the grade block
// instead. The bundle's story header set the club wordmark as a literal; with
// no clubName key available for this kind, the header binds {{grade}} into the
// ruled tag instead (logo + "{{grade}} DEBUT" + season), so the tenant's
// identity still comes from the logo.
//
// Binding fixes folded in per Pack A: the tribute sentence is structured as
// Round {{round}} · vs {{opponent}} — {{tributeLine}}, and {{capNumber}} binds
// the number only (the "CAP " prefix stays in the template).
//
// The bundle is story-only; the shared layout is authored from the story's
// visual language plus Pack A's shared structure (grade header, name + cap
// number stacked left, photo right).

/** Story header: logo over a gold-ruled "{{grade}} DEBUT" tag plus season. */
const storyHeaderDebut =
  `<div style="flex:none;text-align:center">` +
  `<div style="width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>` +
  `<div style="display:flex;align-items:center;justify-content:center;gap:16px">` +
  `<span style="width:90px;height:1px;background:linear-gradient(90deg,transparent,var(--gold,#F5B21A))"></span>` +
  `<span style="font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;color:var(--gold,#F5B21A)">{{grade}} DEBUT</span>` +
  `<span style="width:90px;height:1px;background:linear-gradient(90deg,var(--gold,#F5B21A),transparent)"></span>` +
  `</div>` +
  `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.5);margin-top:12px">{{season}}</div>` +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — photo, foil name, occasion line, foil CAP number
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeaderDebut +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;margin:30px 0 34px">` +
    // Cap-presentation photo drops when empty rather than framing a blank box.
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:520px;margin-bottom:22px;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>` +
    `<div style="flex:none">` +
    foilText("{{playerName}}", 100) +
    `<div style="font-weight:500;font-size:23px;line-height:1.4;color:rgba(255,255,255,.75);margin-top:12px;max-width:640px">Round {{round}} · vs {{opponent}} — {{tributeLine}}</div>` +
    `</div>` +
    foilText("CAP {{capNumber}}", 134, ";flex:none;margin-top:26px") +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: grade header, name + cap left, photo
// right
// ---------------------------------------------------------------------------

const sharedHeaderDebut =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="display:flex;align-items:center;gap:20px">` +
  `<div style="width:100px;height:100px;flex:none">${CLUB_LOGO_SLOT}</div>` +
  `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*40px);line-height:.92;text-transform:uppercase;color:var(--gold,#F5B21A)">{{grade}}</div>` +
  `</div>` +
  `<div style="text-align:right">${goldChip("DEBUT")}` +
  `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.6);margin-top:11px">{{season}}</div></div>` +
  `</div>`;

const sharedHtml = sharedColumnRoot(
  sharedHeaderDebut +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;gap:calc(var(--k,1.4)*20px)">` +
    `<div><div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:var(--gold,#F5B21A)">FIRST GRADE DEBUT</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*88px);line-height:.92;margin-top:14px;text-transform:uppercase">{{playerName}}</div></div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.4;color:rgba(255,255,255,.78);max-width:560px">Round {{round}} · vs {{opponent}} — {{tributeLine}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*96px);line-height:.86;color:var(--gold,#F5B21A);text-shadow:0 4px 24px rgba(0,0,0,.6)">CAP {{capNumber}}</div>` +
    `</div>` +
    `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 24px 60px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>` +
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
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
