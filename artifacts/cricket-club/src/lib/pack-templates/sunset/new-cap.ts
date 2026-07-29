import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  HASHTAG_FOOTER_SHARED,
  PRESENTED_BY_STORY,
  SHARED_BG,
  STORY_BG,
  clubHeaderFields,
  glassPanel,
  photoField,
  scriptText,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyHeader,
  textField,
} from "./fragments";

// E15 — New Cap. Cap presentation — full-bleed player photo, script flourish,
// name & the glass grade / cap-number panel. "CAP " stays literal;
// {{capNumber}} binds the number only, same convention as Broadcast Dark's
// new-cap.
//
// Field keys are a SUBSET of Broadcast Dark's new-cap — `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. Contract points, all
// following Pack D's calls on the same card:
//  - the newCap kind has NO sponsor1–3 keys, so the bundle's three-logo strip
//    is replaced by the presented-by line in both formats (the strip's slots
//    would be new keys, which the parity test forbids);
//  - clubHashtag is unused: the bundle's sponsors-off footer is the combined
//    hashtag line, so it binds {{hashtags}} — a local story footer stands in
//    for fragments' HASHTAG_FOOTER_STORY (whose {{clubHashtag}} would
//    otherwise force an extra declared key);
//  - {{season}} takes the shared header's tag (the story header keeps the
//    bundle's own "New Cap" tag).
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches).
// It is transcribed as the story with `--k` resolved at its 1.4 default into
// fixed px; the shared layout keeps the pack's photo-first identity — the same
// full-bleed photo + scrim stack under `sharedHeader`, content bottom-anchored
// with `justify-content:flex-end` so the column stays balanced when the photo
// drops and the wash shows through.

/** `scriptText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function scriptFlex(content: string, px: number, extraStyle = ""): string {
  return scriptText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

// Photo-first layer stack: hero photo over the sunset wash, under the bundle's
// cinematic scrim and accent horizon glow. `data-drop-if-empty` lets a cap
// presentation without a photo fall back to the pack's own sky.
function photoLayers(bg: string): string {
  return (
    bg +
    `<div data-drop-if-empty="photo" style="position:absolute;inset:0">${slot("photo", "photo", "rect")}</div>` +
    `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,rgba(8,10,14,.1) 44%,rgba(8,10,14,.74) 72%,rgba(6,8,11,.97) 100%)"></div>` +
    `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 66% at 50% 120%, color-mix(in srgb, var(--gold,#FBAC27) 22%, transparent), transparent 55%)"></div>`
  );
}

/** Frosted grade / cap-number panel (identical bindings in both formats). */
function capPanel(capFontSize: string): string {
  return glassPanel(
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px">` +
      `<div><div style="font:600 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:rgba(255,255,255,.6)">{{grade}}</div></div>` +
      `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${capFontSize};line-height:.9;color:var(--gold,#F5B21A)">CAP {{capNumber}}</div>` +
      `</div>`,
    ";margin-top:16px;padding:26px 28px",
  );
}

// Local sponsors-off footer binding {{hashtags}} — see the module note.
const hashtagFooterStory = `<div style="flex:none;text-align:center;font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.8)">{{hashtags}}</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — header up top, spacer sky, content hugging the foot
// ---------------------------------------------------------------------------

const storyHtml = columnRoot(
  photoLayers(STORY_BG),
  storyHeader("New Cap") +
    `<div style="flex:1;min-height:0"></div>` +
    `<div style="flex:none">` +
    scriptText("Presented with Cap", 87) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:118px;line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:6px">{{playerName}}</div>` +
    capPanel("56px") +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(hashtagFooterStory),
  "60px 70px 56px",
);

// ---------------------------------------------------------------------------
// Shared (portrait / square) — same photo-first stack, bottom-anchored
// ---------------------------------------------------------------------------

const sharedHtml = columnRoot(
  photoLayers(SHARED_BG),
  sharedHeader("NEW CAP", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end">` +
    scriptFlex("Presented with Cap", 46) +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*84px);line-height:.9;text-transform:uppercase;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.82);margin-top:6px">{{playerName}}</div>` +
    capPanel("calc(var(--k,1.4)*40px)") +
    `</div>` +
    `<div style="flex:none;height:20px"></div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
  "58px 66px 52px",
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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
