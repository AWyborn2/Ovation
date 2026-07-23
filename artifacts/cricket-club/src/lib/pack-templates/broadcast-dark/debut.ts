import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  formatRoot,
  goldChip,
  logoField,
  photoField,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// A11 — A Grade Debut. Full-bleed cap-presentation photo, script name, big cap
// number. Binding fixes folded in per KTD2: the bundle wrapped the whole
// tribute sentence in data-field="opponent"; here it is split into structured
// {{round}} / {{opponent}} plus {{tributeLine}}, and {{capNumber}} binds the
// number only (the "CAP " prefix stays in the template).
//
// The header carries the grade block instead of the club name/tagline, so this
// card's header fields differ from the rest of the pack (clubLogo only).

const photoOverlaysStory =
  `<div style="position:absolute;inset:0">${slot("photo", "photo")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.82) 0%,rgba(8,10,14,.15) 24%,transparent 40%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,rgba(6,8,11,.97) 0%,rgba(6,8,11,.55) 26%,transparent 52%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 58% at 28% 118%, color-mix(in srgb, var(--gold,#FBAC27) 24%, transparent), transparent 56%)"></div>`;

const photoOverlaysShared =
  `<div style="position:absolute;inset:0">${slot("photo", "photo")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.82) 0%,rgba(8,10,14,.15) 24%,transparent 42%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,rgba(6,8,11,.97) 0%,rgba(6,8,11,.55) 26%,transparent 54%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 58% at 28% 118%, color-mix(in srgb, var(--gold,#FBAC27) 24%, transparent), transparent 56%)"></div>`;

const storyHtml = formatRoot(
  photoOverlaysStory +
    `<div style="position:absolute;top:60px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between;pointer-events:none">` +
    `<div style="display:flex;align-items:center;gap:22px">` +
    `<div style="width:118px;height:118px;pointer-events:auto">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:70px;line-height:.92;text-transform:uppercase;color:var(--gold,#F5B21A);text-shadow:0 3px 16px rgba(0,0,0,.7)">{{grade}}</div>` +
    `</div>` +
    `<div style="text-align:right">` +
    goldChip("DEBUT", "story") +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.72);margin-top:11px;text-shadow:0 2px 10px rgba(0,0,0,.85)">{{season}}</div>` +
    `</div>` +
    `</div>` +
    `<div style="position:absolute;top:720px;left:70px;width:620px">` +
    `<div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:#37CFE6;text-shadow:0 2px 12px rgba(0,0,0,.8)">FIRST GRADE DEBUT</div>` +
    `<div style="font-family:'Kaushan Script',cursive;font-size:150px;line-height:.82;color:var(--gold,#F5B21A);margin-top:20px;text-shadow:0 4px 22px rgba(0,0,0,.7)">{{playerName}}</div>` +
    `</div>` +
    `<div style="position:absolute;top:1200px;left:74px;width:620px;font-weight:600;font-size:27px;line-height:1.4;color:rgba(255,255,255,.86);text-shadow:0 2px 12px rgba(0,0,0,.8)">Round {{round}} · vs {{opponent}} — {{tributeLine}}</div>` +
    `<div style="position:absolute;top:1400px;left:70px">` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:150px;line-height:.86;color:var(--gold,#F5B21A);text-shadow:0 4px 24px rgba(0,0,0,.6)">CAP {{capNumber}}</div>` +
    `</div>` +
    sponsorsOn(
      `<div style="position:absolute;bottom:56px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between"><div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div><div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.72);text-shadow:0 2px 10px rgba(0,0,0,.8)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div></div>`,
    ) +
    sponsorsOff(
      `<div style="position:absolute;bottom:66px;left:70px;right:70px;text-align:center;font-weight:700;font-size:26px;line-height:1;letter-spacing:.13em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{hashtags}}</div>`,
    ),
  ";background:var(--ink,#0b0f14)",
);

const sharedHtml = formatRoot(
  photoOverlaysShared +
    `<div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:58px 66px 52px">` +
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:20px"><div style="width:116px;height:116px;flex:none">${CLUB_LOGO_SLOT}</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*50px);line-height:.92;text-transform:uppercase;color:var(--gold,#FBAC27);text-shadow:0 3px 16px rgba(0,0,0,.7)">{{grade}}</div></div>` +
    `<div style="text-align:right">` +
    goldChip("DEBUT", "shared") +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.72);margin-top:11px;text-shadow:0 2px 10px rgba(0,0,0,.85)">{{season}}</div>` +
    `</div>` +
    `</div>` +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:calc(var(--k,1.4)*20px)">` +
    `<div><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:#37CFE6;text-shadow:0 2px 12px rgba(0,0,0,.8)">FIRST GRADE DEBUT</div><div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*104px);line-height:.86;color:var(--gold,#FBAC27);margin-top:18px;text-shadow:0 4px 22px rgba(0,0,0,.7)">{{playerName}}</div></div>` +
    `<div style="font-weight:600;font-size:26px;line-height:1.4;color:rgba(255,255,255,.88);max-width:640px;text-shadow:0 2px 12px rgba(0,0,0,.8)">Round {{round}} · vs {{opponent}} — {{tributeLine}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*104px);line-height:.86;color:var(--gold,#FBAC27);text-shadow:0 4px 24px rgba(0,0,0,.6)">CAP {{capNumber}}</div>` +
    `</div>` +
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between"><div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div>` +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.72);text-shadow:0 2px 10px rgba(0,0,0,.8)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>` +
    `</div>`,
  ";background:var(--ink,#0b0f14)",
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
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("hashtags", "Hashtag footer", "#HALLSHEAD · #PEELPREMIERLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "eSA Sport"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
