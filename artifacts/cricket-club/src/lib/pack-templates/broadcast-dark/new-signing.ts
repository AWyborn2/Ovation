import type { PackCardTemplate } from "../types";
import {
  ACC,
  bdCard,
  bdChip,
  bdColumn,
  bdDisplay,
  bdEyebrow,
  bdFooterOn,
  bdFormats,
  bdSub,
  clubHeaderFields,
  photoField,
  textField,
} from "./fragments";

// A9 — New Signing. Two-line name in display type, role and former club as
// accent-bulleted lines, the welcome line; photo right. No sponsors-off
// branch in the bundle — honoured as designed.

function bullet(inner: string): string {
  return `<div style="display:flex;align-items:center;gap:1.8cqmin;font-size:3.4cqmin;line-height:1.3;font-weight:600;margin-top:1.4cqmin"><span style="width:1.4cqmin;height:1.4cqmin;flex:none;background:${ACC};transform:rotate(45deg)"></span><span>${inner}</span></div>`;
}

const html = bdCard({
  chip: bdChip("NEW SIGNING"),
  tag: "{{season}}",
  photo: "photo",
  body: bdColumn(
    bdEyebrow("WELCOME TO THE CLUB") +
      bdDisplay("{{playerFirstName}}<br>{{playerLastName}}", 15, ";max-width:80cqmin") +
      `<div style="margin-top:2.6cqmin">` +
      bullet("{{role}}") +
      bullet(`From <span style="color:${ACC}">{{formerClub}}</span>`) +
      `</div>` +
      bdSub("{{headline}}", ";margin-top:3.4cqmin;max-width:74cqmin"),
  ),
  footer: bdFooterOn("recruitment by"),
});

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
      "The club gets a serious top-order boost for 2025/26. Let's go, Sam!",
    ),
    photoField("photo", "Player photo", "New player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Recruitment sponsor", "Your Sponsor"),
  ],
  formats: bdFormats(() => html),
};
