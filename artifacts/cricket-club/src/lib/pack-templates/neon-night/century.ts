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

// D16 — Century. Hundred — neon runs, balls, opponent & round.
//
// Field keys are IDENTICAL to Broadcast Dark's century: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The bundle's hero
// binds `data-field="value"` — that is {{runs}} in the reference contract
// ("112*", star included). The story follows the bundle's meta line
// ({{balls}} BALLS · vs {{opponent}} · RD {{round}}); {{grade}} appears in the
// shared meta line as Pack A composes it, so every declared key stays bound.
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "century" does not declare — replaced with the pack's
// presented-by line; the sponsors-off hashtag footers come from the pack
// fragments ({{hashtags}}, which this kind declares).
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch);
// its default-token rendering is the story, transcribed with the 1.4 scale
// baked in on the pack's storyColumnRoot/storyHeader. The shared layout is
// authored from Pack A's shared structure (figures block left, photo right)
// in Neon Night's language.

const STORY_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:540px;margin:20px 0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:22px;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(4,7,13,.9)"></div></div></div>`;

const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:22px;overflow:hidden;box-shadow:0 0 0 2px rgba(55,207,230,.5),0 0 44px -10px rgba(55,207,230,.5)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(4,7,13,.9)"></div></div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — neon runs, cyan-ring photo, neon name + meta line
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("RAISED THE BAT") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;margin:20px 0 22px">` +
    `<div style="flex:none">` +
    neonText("{{runs}}", 252, "cyan", ";line-height:.9") +
    `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7);margin-top:14px">CENTURY</div>` +
    `</div>` +
    // Batter photo drops when empty rather than framing a blank glowing box.
    STORY_PHOTO +
    `<div style="flex:none">` +
    neonText("{{playerName}}", 87, "gold", ";line-height:.9") +
    `<div style="font:600 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-top:12px">{{balls}} BALLS · vs {{opponent}} · RD {{round}}</div>` +
    `</div>` +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: figures block left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("CENTURY", "MILESTONE") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*10px)">` +
    `<div style="font:700 18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.7)">RAISED THE BAT</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*150px);line-height:.86;margin-top:calc(var(--k,1.4)*8px)"><span>{{runs}}</span><span style="font-size:calc(var(--k,1.4)*44px);color:rgba(255,255,255,.6)"> ({{balls}})</span></div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:.92;color:var(--gold,#FBAC27);text-transform:uppercase;margin-top:calc(var(--k,1.4)*8px)">{{playerName}}</div>` +
    `<div style="font:600 22px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:8px">{{grade}} · vs {{opponent}} · RD {{round}}</div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

export const century: PackCardTemplate = {
  kind: "century",
  designKey: "century",
  name: "Century",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("playerName", "Player name", "Jack Manuel"),
    textField("grade", "Grade", "A GRADE"),
    textField("runs", "Runs", "112*"),
    textField("balls", "Balls", "68"),
    textField("opponent", "Opponent", "BALDIVIS"),
    textField("round", "Round", "4"),
    photoField("photo", "Batter photo", "Batter photo"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
