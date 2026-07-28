import type { PackCardTemplate } from "../types";
import {
  HASHTAG_FOOTER_SHARED,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  clubHeaderFields,
  neonText,
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

// D15 — New Cap. Cap presentation — cyan-framed photo, gold-glow name, grade &
// the big white-neon cap number. "CAP " stays literal; {{capNumber}} binds the
// number only, same convention as Broadcast Dark's new-cap.
//
// Field keys are a SUBSET of Broadcast Dark's new-cap — `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The newCap kind has NO
// sponsor1–3 keys, so the bundle's three-logo strip is replaced by the
// presented-by line in both formats (the strip's slots would be new keys,
// which the parity test forbids). The sponsors-off hashtag line binds
// {{hashtags}} via the pack's story footer, exactly as the bundle draws it.
//
// The bundle ships ONE `--k`-scaled composition (no isTall/isSquare branches —
// verified in the markup). It is transcribed as the story with `--k` resolved
// at its 1.4 default into fixed px; the shared layout keeps the
// `calc(var(--k)*…)` sizes so portrait and square reflow, reusing the story's
// centred structure under `sharedHeader` (as Gold Foil's new-cap does).

/** `neonText` at a `--k`-scaled size for the shared layout (calc wins by order). */
function neonFlex(
  content: string,
  px: number,
  glow: "cyan" | "gold" = "cyan",
  extraStyle = "",
): string {
  return neonText(content, px, glow, `;font-size:calc(var(--k,1.4)*${px}px)${extraStyle}`);
}

/**
 * Cyan-ringed player photo. Wrapped with `data-drop-if-empty` inside the flex
 * column so an unbound photo collapses instead of leaving an empty frame.
 */
function photoFrame(marginBottom: string): string {
  return (
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:540px;margin-bottom:${marginBottom};position:relative;border-radius:22px;overflow:hidden;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(4,7,13,.9)"></div></div>`
  );
}

/** Gold-glow name + mono grade line. */
function nameBlock(nameHtml: string): string {
  return (
    `<div>${nameHtml}` +
    `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-top:10px">{{grade}}</div></div>`
  );
}

// ---------------------------------------------------------------------------
// Story (1080×1920)
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("NEW CAP") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding-top:20px;margin-bottom:22px">` +
    photoFrame("20px") +
    nameBlock(neonText("{{playerName}}", 87, "gold", ";line-height:.9")) +
    neonText("CAP {{capNumber}}", 129, "cyan", ";line-height:.9;margin-top:14px") +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait / square)
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("NEW CAP", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;padding:calc(var(--k,1.4)*14px) 0 calc(var(--k,1.4)*12px)">` +
    photoFrame("calc(var(--k,1.4)*14px)") +
    nameBlock(neonFlex("{{playerName}}", 62, "gold", ";line-height:.9")) +
    neonFlex("CAP {{capNumber}}", 92, "cyan", ";line-height:.9;margin-top:calc(var(--k,1.4)*10px)") +
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
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
