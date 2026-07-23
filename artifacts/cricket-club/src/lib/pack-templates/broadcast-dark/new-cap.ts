import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  clubHeaderFields,
  formatRoot,
  goldChip,
  photoField,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "./fragments";

// A15 — New Cap. Cap presentation over a full-bleed photo — number, name &
// grade. "CAP " stays literal; {{capNumber}} binds the number only. The header
// text carries drop shadows over the photo (unlike the standard header).

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
    `<div style="position:absolute;top:60px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:22px"><div style="width:104px;height:104px">${CLUB_LOGO_SLOT}</div><div><div style="font-weight:800;font-size:34px;line-height:1;letter-spacing:.01em;text-shadow:0 2px 12px rgba(0,0,0,.7)">{{clubName}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.6);margin-top:8px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{clubTagline}}</div></div></div><div style="text-align:right">${goldChip("NEW CAP", "story")}<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.7);margin-top:11px;text-shadow:0 2px 10px rgba(0,0,0,.85)">{{season}}</div></div></div>` +
    `<div style="position:absolute;top:720px;left:70px;width:620px"><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:#37CFE6;text-shadow:0 2px 12px rgba(0,0,0,.8)">PRESENTED WITH CAP</div><div style="font-family:'Kaushan Script',cursive;font-size:150px;line-height:.82;color:var(--gold,#F5B21A);margin-top:20px;text-shadow:0 4px 22px rgba(0,0,0,.7)">{{playerName}}</div></div>` +
    `<div style="position:absolute;top:1210px;left:74px;width:620px;font-weight:600;font-size:27px;line-height:1.4;color:rgba(255,255,255,.86);text-shadow:0 2px 12px rgba(0,0,0,.8)">{{grade}}</div>` +
    `<div style="position:absolute;top:1400px;left:70px;font-family:var(--disp,'Anton',sans-serif);font-size:150px;line-height:.86;color:var(--gold,#F5B21A);text-shadow:0 4px 24px rgba(0,0,0,.6)">CAP {{capNumber}}</div>` +
    sponsorsOn(
      `<div style="position:absolute;bottom:52px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between"><div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div><div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6);text-shadow:0 2px 10px rgba(0,0,0,.8)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div></div>`,
    ) +
    sponsorsOff(
      `<div style="position:absolute;bottom:60px;left:70px;right:70px;text-align:center;font-weight:700;font-size:26px;line-height:1;letter-spacing:.13em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{hashtags}}</div>`,
    ),
  ";background:var(--ink,#0b0f14)",
);

const sharedHtml = formatRoot(
  photoOverlaysShared +
    `<div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:58px 66px 52px">` +
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:20px"><div style="width:100px;height:100px;flex:none">${CLUB_LOGO_SLOT}</div><div><div style="font-weight:800;font-size:34px;line-height:1;letter-spacing:.01em;text-shadow:0 2px 12px rgba(0,0,0,.7)">{{clubName}}</div><div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.6);margin-top:8px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{clubTagline}}</div></div></div>` +
    `<div style="text-align:right">${goldChip("NEW CAP", "shared")}<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.7);margin-top:11px;text-shadow:0 2px 10px rgba(0,0,0,.85)">{{season}}</div></div>` +
    `</div>` +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:calc(var(--k,1.4)*18px)">` +
    `<div><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:#37CFE6;text-shadow:0 2px 12px rgba(0,0,0,.8)">PRESENTED WITH CAP</div><div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*104px);line-height:.86;color:var(--gold,#FBAC27);margin-top:18px;text-shadow:0 4px 22px rgba(0,0,0,.7)">{{playerName}}</div></div>` +
    `<div style="font-weight:600;font-size:26px;line-height:1.4;color:rgba(255,255,255,.88);max-width:640px;text-shadow:0 2px 12px rgba(0,0,0,.8)">{{grade}}</div>` +
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

export const newCap: PackCardTemplate = {
  kind: "newCap",
  designKey: "new-cap",
  name: "New Cap",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("playerName", "Player name", "Dylan Hulse"),
    textField("grade", "Grade", "A Grade · Men's XI"),
    textField("capNumber", "Cap number", "247"),
    textField("season", "Season", "2025/26"),
    photoField("photo", "Player photo", "Player photo"),
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("hashtags", "Hashtag footer", "#HALLSHEAD · #PEELPREMIERLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "eSA Sport"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
