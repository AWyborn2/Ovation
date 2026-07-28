import type { PackCardTemplate } from "../types";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  foilText,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// B15 — New Cap. Cap presentation — framed photo, foil name, grade & the big
// foil cap number. "CAP " stays literal; {{capNumber}} binds the number only,
// same convention as Broadcast Dark's new-cap.
//
// Field keys match Broadcast Dark's new-cap — `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The newCap kind has NO
// sponsor1–3 keys, so the bundle's three-logo strip is replaced by the
// presented-by line in both formats (the strip's slots would be new keys,
// which the parity test forbids).
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches).
// It is transcribed as the story with `--k` resolved at its 1.4 default into
// fixed px; the shared layout keeps the `calc(var(--k)*…)` sizes so portrait
// and square reflow. (Pack A's new-cap is a full-bleed photo card; Gold Foil's
// framed centred composition is kept for both formats instead — the shared
// layout reuses the story's structure at `--k` scale under `sharedHeader`.)

/** `foilText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function foilFlex(content: string, px: number, extraStyle = ""): string {
  return foilText(content, px, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/** Small club mark the B-series story header carries above the wordmark. */
const STORY_LOGO = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

/**
 * Gold-ringed player photo. Wrapped with `data-drop-if-empty` inside the flex
 * column so an unbound photo collapses instead of leaving an empty frame.
 */
function photoFrame(maxWidth: number, margin: string): string {
  return (
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:${maxWidth}px;margin:${margin};position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  STORY_LOGO +
    storyHeader("NEW CAP") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:17px;margin-bottom:34px">` +
    photoFrame(520, "22px 0") +
    `<div>` +
    foilText("{{playerName}}", 101) +
    `<div style="font-weight:500;font-size:23px;line-height:1.3;color:rgba(255,255,255,.75);margin-top:12px">{{grade}}</div>` +
    `</div>` +
    foilText("CAP {{capNumber}}", 134) +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("NEW CAP", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding:calc(var(--k,1.4)*14px) 0">` +
    photoFrame(520, "calc(var(--k,1.4)*12px) 0") +
    `<div>` +
    foilFlex("{{playerName}}", 72) +
    `<div style="font-weight:500;font-size:23px;line-height:1.3;color:rgba(255,255,255,.75);margin-top:12px">{{grade}}</div>` +
    `</div>` +
    foilFlex("CAP {{capNumber}}", 96) +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
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
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
