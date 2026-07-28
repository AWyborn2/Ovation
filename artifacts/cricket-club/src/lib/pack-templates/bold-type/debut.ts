import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  goldChip,
  logoField,
  photoField,
  sharedColumnRoot,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// C11 — A Grade Debut. Gold-framed presentation photo, gold name, big cap
// number.
//
// Field keys mirror Broadcast Dark's debut, INCLUDING its deviation: no
// clubName/clubTagline — this card's header carries the grade block, so the
// only header field is clubLogo. That also means the pack's stock gold-bar
// footers (which set {{clubName}}) can't be used here; this module authors the
// same full-bleed bars with {{clubHashtag}} / {{hashtags}} in the club-name
// position instead. Binding fixes folded in per KTD2, as in Pack A: the bundle
// bound {{capNumber}} on the whole "CAP 246" string and baked the round/
// opponent line as one literal — here "CAP " stays in the template, the meta
// line binds {{round}} / {{opponent}}, and {{tributeLine}} (a Pack A key the
// bundle dropped) is restored under it.
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in and normalised onto storyColumnRoot's margins. The header keeps
// the bundle's logo + label shape but binds {{grade}}. The shared layout is
// authored from Pack A's shared structure (grade header, name + cap column,
// photo right) in Bold Type's language.

const STORY_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div></div>`;

const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:2px;overflow:hidden;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,12,22,.9)"></div></div>`;

/** Full-bleed gold bar minus the club name (not a key on this kind). */
function goldBarStory(inner: string): string {
  return (
    `<div style="flex:none;background:var(--gold,#F5B21A);margin:0 -80px -70px;padding:30px 80px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
    inner +
    `</div>`
  );
}

const STORY_FOOTERS =
  sponsorsOn(
    goldBarStory(
      `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubHashtag}}</span>` +
        `<span style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.82">presented by {{sponsorPresentedBy}}</span>`,
    ),
  ) +
  sponsorsOff(
    goldBarStory(
      `<span style="font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em">{{hashtags}}</span>`,
    ),
  );

const SHARED_FOOTERS =
  sponsorsOn(
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
      `<div style="font-weight:700;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
      `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6)">presented by {{sponsorPresentedBy}}</div>` +
      `</div>`,
  ) + sponsorsOff(HASHTAG_FOOTER_SHARED);

// ---------------------------------------------------------------------------
// Story (1080×1920) — framed photo, gold name, meta + tribute, CAP hero
// ---------------------------------------------------------------------------

/** Bundle header shape with the grade bound: logo + mono label left, season
 * right (this card's stand-in for storyHeader, which needs {{clubName}}). */
const storyHeaderDebut =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="display:flex;align-items:center;gap:18px">` +
  `<div style="width:60px;height:60px;flex:none">${CLUB_LOGO_SLOT}</div>` +
  `<div style="font:700 22px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);text-transform:uppercase">{{grade}} DEBUT</div></div>` +
  `<div style="font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:rgba(255,255,255,.55)">{{season}}</div></div>`;

const storyHtml = sharedColumnRootStory();

function sharedColumnRootStory(): string {
  // Local composition kept in a function only to keep the concatenation
  // readable; this is the pack's standard story column.
  return (
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    storyColumn
  );
}

import { storyColumnRoot } from "./fragments";

const storyColumn = storyColumnRoot(
  storyHeaderDebut +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:20px;margin-top:22px">` +
    STORY_PHOTO +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:82px;color:var(--gold,#F5B21A);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:8px;text-transform:uppercase">ROUND {{round}} · vs {{opponent}}</div>` +
    `<div style="font-weight:600;font-size:22px;line-height:1.4;color:rgba(255,255,255,.72);margin-top:10px;max-width:760px">{{tributeLine}}</div></div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:157px;line-height:.82;color:#fff;text-transform:uppercase">CAP {{capNumber}}</div>` +
    `</div>` +
    STORY_FOOTERS,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: grade header, name + cap left, photo
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:20px">` +
    `<div style="width:100px;height:100px;flex:none">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*40px);line-height:.92;text-transform:uppercase;color:var(--gold,#FBAC27)">{{grade}}</div></div>` +
    `<div style="text-align:right">${goldChip("DEBUT")}` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.6);margin-top:11px">{{season}}</div></div></div>` +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*16px)">` +
    `<div><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:var(--gold,#FBAC27)">FIRST GRADE DEBUT</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*72px);line-height:.92;color:var(--gold,#FBAC27);text-transform:uppercase;margin-top:14px">{{playerName}}</div></div>` +
    `<div style="font:500 22px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);text-transform:uppercase">ROUND {{round}} · vs {{opponent}}</div>` +
    `<div style="font-weight:600;font-size:25px;line-height:1.4;color:rgba(255,255,255,.75);max-width:560px">{{tributeLine}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*100px);line-height:.82;color:#fff;text-transform:uppercase">CAP {{capNumber}}</div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    SHARED_FOOTERS,
);

export const debut: PackCardTemplate = {
  kind: "debut",
  designKey: "debut",
  name: "A Grade Debut",
  sponsorVariants: ["on", "off"],
  fields: [
    // No clubName/clubTagline: this card's header shows the grade block.
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
