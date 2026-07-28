import type { PackCardTemplate } from "../types";
import { columnRoot } from "../shared";
import {
  CLUB_LOGO_SLOT,
  HASHTAG_FOOTER_STORY,
  PRESENTED_BY_STORY,
  SHARED_BG,
  clubHeaderFields,
  photoField,
  sharedHeader,
  slot,
  sponsorsOff,
  sponsorsOn,
  storyColumnRoot,
  textField,
} from "./fragments";

// C12 — Record. Club record — title, holder, value & grade.
//
// The bundle ships ONE fluid layout (sized by `--ch`/`--k`) for this card —
// verified in the html: the only `<sc-if>` branches are sponsors on/off, the
// isStoryFmt/isNotStory flags exist only in the DC script. So the story format
// below is the transcription and the shared format is authored, following Pack
// A record's shared structure (left text column, right-half photo) in Bold
// Type's language.
//
// Field keys are IDENTICAL to Broadcast Dark's record: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack (a strict subset —
// `hashtags` is omitted because Bold Type's story sponsors-off footer is the
// gold bar's single {{clubHashtag}}, and Pack A's record shared has no
// sponsors-off right-hand content either, so nothing binds `hashtags`).
//
// The bundle's sponsors-on footer is the three-logo strip, but Pack A's record
// declares no sponsor1..3 keys — adding them here would fail field-key parity.
// The strip is dropped and the gold footer bar's "presented by
// {{sponsorPresentedBy}}" credit (already real tenant data) carries sponsors-on
// alone, exactly as Gold Foil resolved the same conflict.
//
// Bundle literals replaced with bindings:
//  - "HIGHEST SCORE · A GRADE" under the value → {{title}} here, {{grade}}
//    under the holder's name (the same title/grade split Gold Foil used —
//    binding "{{title}} · {{grade}}" would double-set grade);
//  - the holder sub-line ("THE STANDARD AT <club>") is tenant-branded copy
//    and becomes the {{grade}} line above.

// ---------------------------------------------------------------------------
// Story (1080×1920) — transcribed from the bundle
// ---------------------------------------------------------------------------

// This card family's story header differs from fragments' `storyHeader` (which
// has no logo slot): the bundle sets a small club logo beside a tracked mono
// gold label, tag right — transcribed inline here. The club NAME appears in
// the gold footer bar, so the header label stays the card's own caption.
function logoStoryHeader(label: string, tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:60px;height:60px;flex:none">${CLUB_LOGO_SLOT}</div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A)">${label}</div></div>` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.5);text-align:right">${tag}</div>` +
    `</div>`
  );
}

// Both variants are the full-bleed gold bar (the bundle swaps only the right
// span). The bars cancel storyColumnRoot's 80/80/70 padding — the bundle's own
// 60/70/54 margins were already normalised to the pack's canonical story
// margins when fragments.ts transcribed the bar, so this card follows suit.
const storyFooters =
  sponsorsOn(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${PRESENTED_BY_STORY}</div>`,
  ) +
  sponsorsOff(
    `<div style="flex:none;margin-top:calc(var(--k,1.4)*22px)">${HASHTAG_FOOTER_STORY}</div>`,
  );

const storyHtml = storyColumnRoot(
  logoStoryHeader("CLUB RECORD", "CLUB BEST") +
    // `justify-content:space-between` is a no-op while the flex:1 photo frame
    // is present; when no photo is bound and `data-drop-if-empty` removes the
    // frame, it spreads the value/name blocks instead of leaving a hole.
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;padding-top:calc(var(--k,1.4)*16px);gap:calc(var(--k,1.4)*14px)">` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*166px);line-height:.78;text-transform:uppercase;color:#fff">{{value}}</div>` +
    `<div style="margin-top:10px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">{{title}}</div></div></div>` +
    // Sharp 2px-cornered, gold-stroked photo frame (the bundle's wrapper +
    // full-height frame collapsed into one flex item so drop-if-empty removes
    // the whole flexible block).
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;position:relative;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
    slot("photo", "photo") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div>` +
    `<div><div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);color:var(--gold,#F5B21A);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="margin-top:8px"><div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5)">{{grade}}</div></div></div>` +
    `</div>` +
    storyFooters,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored; Pack A record's shared is the guide
// ---------------------------------------------------------------------------

// Pack A's shared footer contract: club hashtag left, presented-by right when
// sponsors are on (record has no sponsors-off right-hand content in shared —
// the hashtag line simply stands alone, as in Pack A).
const sharedFooterRow =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:800;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.55)">presented by <span style="color:var(--gold,#F5B21A)">{{sponsorPresentedBy}}</span></div>`,
  ) +
  `</div>`;

// Right-half photo with block-toned scrims (Pack A's structure, re-inked from
// `--ink` to Bold Type's `--block` stage). Type keeps the pack's story
// language: white display value, gold display holder name.
const sharedHtml = columnRoot(
  SHARED_BG +
    `<div style="position:absolute;top:0;right:0;width:52%;height:100%">${slot("photo", "photo")}</div>` +
    `<div style="position:absolute;top:0;right:0;width:56%;height:100%;pointer-events:none;background:linear-gradient(90deg, var(--block,#0E1C31) 0%, rgba(14,28,49,.35) 30%, transparent 60%)"></div>` +
    `<div style="position:absolute;bottom:0;right:0;width:52%;height:40%;pointer-events:none;background:linear-gradient(0deg, var(--block,#0E1C31), transparent)"></div>`,
  sharedHeader("RECORD", "CLUB BEST") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*8px);max-width:600px">` +
    `<div style="font:700 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#FBAC27)">CLUB RECORD</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*58px);line-height:.92;margin-top:8px;text-transform:uppercase">{{title}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*166px);line-height:.82;margin-top:calc(var(--k,1.4)*10px)">{{value}}</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*56px);line-height:1;color:var(--gold,#F5B21A);text-transform:uppercase;margin-top:calc(var(--k,1.4)*10px)">{{playerName}}</div>` +
    `<div style="font:500 19px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-top:12px">{{grade}}</div>` +
    `</div>` +
    sharedFooterRow,
  "58px 66px 52px",
);

export const record: PackCardTemplate = {
  kind: "record",
  designKey: "record",
  name: "Record",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("title", "Record title", "HIGHEST SCORE"),
    textField("value", "Record value", "156*"),
    textField("playerName", "Record holder", "Tim Miles"),
    textField("grade", "Grade", "A GRADE"),
    photoField("photo", "Record holder photo", "Record holder photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Records sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
