import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  SHARED_BG,
  STORY_BG,
  clubHeaderFields,
  glassPanel,
  photoField,
  scriptText,
  sharedHeader,
  slot,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// E9 — New Signing. Welcome / recruit — full-bleed player photo under the
// cinematic scrim, script flourish, name & the glass ROLE / FROM panel.
//
// Field keys match Broadcast Dark's new-signing (a subset) — `bindInput` maps
// a ShareCardInput onto keys per card KIND, not per pack. Contract points, all
// following Packs B/C/D's calls on the same card:
//  - the bundle's single name line ("SAM WHITFIELD", data-field="playerName")
//    binds as {{playerFirstName}} {{playerLastName}} — the kind has no single
//    playerName key;
//  - sponsorVariants is ["on"] only, per Pack A. The bundle drew a
//    sponsors-off hashtag branch AND a three-logo strip anyway, but the kind
//    declares no off variant and no sponsor1–3 keys, so the footer follows
//    Pack A's shape: an always-on {{clubHashtag}} with the recruitment sponsor
//    line appearing only when sponsors are on;
//  - {{headline}} has no home in the bundle's story; it joins the authored
//    shared layout's text column, as in Packs B and D.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches).
// It is transcribed as the story with `--k` resolved at its 1.4 default into
// fixed px; the shared layout is authored from Pack A's shared structure (text
// left, framed photo right, {{headline}} paragraph) in Sunset's language.

/** `scriptText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function scriptFlex(content: string, px: number, extraStyle = ""): string {
  return scriptText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

// The story is photo-first: the hero photo IS the background, under the
// bundle's cinematic scrim and the accent horizon glow. The photo layer
// carries `data-drop-if-empty` and the sunset wash sits beneath it, so a
// signing posted without a photo falls back to the pack's own sky — the
// scrims read correctly over either (match-result's story proved the stack).
const storyLayers =
  STORY_BG +
  `<div data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}</div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
  `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`;

function roleCell(label: string, value: string, gold: boolean): string {
  const colour = gold ? "var(--gold,#F5B21A)" : "#fff";
  return (
    `<div style="flex:1"><div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">${label}</div>` +
    `<div style="font-weight:800;font-size:22px;color:${colour};margin-top:6px">${value}</div></div>`
  );
}

/** Footer row: club hashtag always, recruitment sponsor only when sponsors on. */
const FOOTER_ROW =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;letter-spacing:.1em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.7)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font-weight:500;font-size:20px;color:rgba(255,255,255,.55);text-shadow:0 2px 10px rgba(0,0,0,.8)">recruitment by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — header up top, spacer sky, content hugging the foot
// ---------------------------------------------------------------------------

const storyHtml = columnRoot(
  storyLayers,
  storyHeader("New Signing · {{season}}") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Welcome to the Club", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:101px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:2px">{{playerFirstName}} {{playerLastName}}</div>` +
    glassPanel(
      `<div style="display:flex;gap:24px">` +
        roleCell("ROLE", "{{role}}", false) +
        roleCell("FROM", "{{formerClub}}", true) +
        `</div>`,
      ";margin-top:16px;padding:26px 28px",
    ) +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    FOOTER_ROW,
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait / square) — text column left, gold-ringed photo right
// ---------------------------------------------------------------------------

const PHOTO_FRAME_SHADOW =
  "box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 60%, transparent),0 8px 30px rgba(0,0,0,.6)";

const PHOTO_SCRIM = `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(10,6,3,.9)"></div>`;

const sharedHtml = columnRoot(
  SHARED_BG,
  sharedHeader("NEW SIGNING", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:32px;padding:calc(var(--k,1.4)*16px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*18px)">` +
    `<div>` +
    scriptFlex("Welcome to the Club", 46) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*64px);line-height:.92;text-transform:uppercase;color:#fff;margin-top:14px">{{playerFirstName}}<br>{{playerLastName}}</div>` +
    `</div>` +
    glassPanel(
      `<div style="display:flex;flex-direction:column;gap:18px">` +
        roleCell("ROLE", "{{role}}", false) +
        roleCell("FROM", "{{formerClub}}", true) +
        `</div>`,
      ";padding:24px 26px",
    ) +
    `<div style="font-weight:500;font-size:26px;line-height:1.45;color:rgba(255,255,255,.82);max-width:540px">{{headline}}</div>` +
    `</div>` +
    // Photo column: its own flex column so an unbound photo collapses the
    // whole right half and the text column takes the width.
    `<div data-drop-if-empty="photo" style="flex:1;min-width:0;display:flex;flex-direction:column">` +
    `<div style="flex:1;min-height:0;position:relative;border-radius:20px;overflow:hidden;${PHOTO_FRAME_SHADOW}">` +
    slot("photo", "photo", "rect") +
    PHOTO_SCRIM +
    `</div></div>` +
    `</div>` +
    FOOTER_ROW,
  "58px 66px 52px",
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
      "The club gets a serious top-order boost for 2025/26. Let's go, Sam!",
    ),
    photoField("photo", "Player photo", "New player photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Recruitment sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
