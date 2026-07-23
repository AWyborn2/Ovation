import type { PackCardTemplate } from "../types";
import {
  bgBase,
  bgLayers,
  clubHeaderFields,
  formatRoot,
  goldChip,
  headerTag,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// A9 — New Signing. Script flourish, name, role & former club. No sponsors-off
// branch in the bundle — honoured as designed.

const storyHtml = formatRoot(
  bgLayers() +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216) 0%, rgba(16,18,22,.35) 24%, transparent 52%)"></div>` +
    `<div style="position:absolute;top:200px;right:0;width:600px;bottom:0;pointer-events:none;background:linear-gradient(0deg, rgba(8,9,12,.92), transparent 32%)"></div>` +
    storyHeader(goldChip("NEW SIGNING", "story") + headerTag("{{season}}")) +
    `<div style="position:absolute;top:300px;left:70px;width:600px">` +
    `<div style="font-family:'Kaushan Script',cursive;font-size:72px;line-height:1;color:var(--gold,#F5B21A)">Welcome to the Club</div>` +
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:128px;line-height:.92;margin-top:14px;text-transform:uppercase">{{playerFirstName}}<br>{{playerLastName}}</div>` +
    `</div>` +
    `<div style="position:absolute;top:800px;left:70px;width:600px;display:flex;flex-direction:column;gap:14px">` +
    `<div style="display:flex;align-items:center;gap:14px"><span style="width:12px;height:12px;border-radius:50%;background:#37CFE6;flex:none"></span><span style="font-weight:700;font-size:28px">{{role}}</span></div>` +
    `<div style="display:flex;align-items:center;gap:14px"><span style="width:12px;height:12px;border-radius:50%;background:#37CFE6;flex:none"></span><span style="font-weight:700;font-size:28px">From <span style="color:var(--gold,#F5B21A)">{{formerClub}}</span></span></div>` +
    `</div>` +
    `<div style="position:absolute;top:960px;left:70px;width:560px;font-weight:500;font-size:27px;line-height:1.45;color:rgba(255,255,255,.8)">{{headline}}</div>` +
    `<div style="position:absolute;bottom:52px;left:70px;right:70px;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div>` +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6);text-shadow:0 2px 10px rgba(0,0,0,.8)">recruitment by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>`,
);

const sharedHtml = sharedColumnRoot(
  bgBase() +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--ink,#101216) 0%, rgba(16,18,22,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--ink,#101216), transparent)"></div>`,
  sharedHeader(goldChip("NEW SIGNING", "shared") + headerTag("{{season}}")) +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*20px);max-width:600px">` +
    `<div><div style="font-family:'Kaushan Script',cursive;font-size:calc(var(--k,1.4)*52px);line-height:1;color:var(--gold,#FBAC27)">Welcome to the Club</div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*92px);line-height:.92;margin-top:14px;text-transform:uppercase">{{playerFirstName}}<br>{{playerLastName}}</div></div>` +
    `<div style="display:flex;flex-direction:column;gap:14px"><div style="display:flex;align-items:center;gap:14px"><span style="width:12px;height:12px;border-radius:50%;background:#37CFE6;flex:none"></span><span style="font-weight:700;font-size:26px">{{role}}</span></div><div style="display:flex;align-items:center;gap:14px"><span style="width:12px;height:12px;border-radius:50%;background:#37CFE6;flex:none"></span><span style="font-weight:700;font-size:26px">From <span style="color:var(--gold,#FBAC27)">{{formerClub}}</span></span></div></div>` +
    `<div style="font-weight:500;font-size:26px;line-height:1.45;color:rgba(255,255,255,.82);max-width:540px">{{headline}}</div>` +
    `</div>` +
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between"><div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#FBAC27);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div>` +
    sponsorsOn(
      `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.6);text-shadow:0 2px 10px rgba(0,0,0,.8)">recruitment by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
    ) +
    `</div>`,
);

export const newSigning: PackCardTemplate = {
  kind: "newSigning",
  designKey: "new-signing",
  name: "New Signing",
  sponsorVariants: ["on"],
  fields: [
    ...clubHeaderFields(),
    textField("season", "Season", "2025/26"),
    textField("playerFirstName", "Player first name", "SAM"),
    textField("playerLastName", "Player last name", "WHITFIELD"),
    textField("role", "Role", "Top-order bat · right-arm medium"),
    textField("formerClub", "Former club", "Rockingham-Mandurah Mariners"),
    textField(
      "headline",
      "Headline",
      "The black & gold gets a serious top-order boost for 2025/26. Let's go, Sam!",
    ),
    photoField("photo", "Player photo", "New player photo"),
    textField("clubHashtag", "Club hashtag", "#HALLSHEAD"),
    textField("sponsorPresentedBy", "Recruitment sponsor", "eSA Sport"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
