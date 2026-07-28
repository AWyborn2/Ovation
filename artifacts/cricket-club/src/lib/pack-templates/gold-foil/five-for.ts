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

// B17 — Five-for. Five-wicket haul — foil figures, overs, opponent & round.
//
// Field keys are IDENTICAL to Broadcast Dark's five-for: `bindInput` maps a
// ShareCardInput onto keys per card KIND, not per pack. The story follows the
// bundle's meta line ({{overs}} overs · vs {{opponent}} · RD {{round}});
// {{wickets}} composes the shared header tag ("{{wickets}} WICKETS") and
// {{grade}} the shared meta line, exactly as Pack A does, so every reference
// key stays bound.
//
// Sponsors: the bundle's three-logo strip needed `sponsor1..3` keys the
// reference design for "fiveFor" does not declare — replaced with the pack's
// presented-by line; the sponsors-off hashtag footers come from the pack
// fragments.
//
// The bundle is story-only; the shared layout is authored from the story's
// visual language plus Pack A's shared structure (figures block left, photo
// right).

/** Bundle story header carries the club logo above the wordmark. */
const storyLogo = `<div style="flex:none;width:76px;height:76px;margin:0 auto 16px">${CLUB_LOGO_SLOT}</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — foil figures, gold-ring photo, foil name + meta line
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyLogo +
    storyHeader("FIVE-WICKET HAUL") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:space-between;margin:30px 0 34px">` +
    `<div style="flex:none">` +
    foilText("{{figures}}", 266, ";line-height:.82") +
    `<div style="font:600 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:rgba(255,255,255,.62);margin-top:14px">FIVE-FOR</div>` +
    `</div>` +
    // Bowler photo drops when empty rather than framing a blank box.
    `<div data-drop-if-empty="photo" style="flex:1;min-height:0;width:100%;max-width:520px;margin:22px 0;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 26px 64px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>` +
    `<div style="flex:none">` +
    foilText("{{playerName}}", 92) +
    `<div style="font:600 16px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,255,255,.55);margin-top:13px">{{overs}} overs · vs {{opponent}} · RD {{round}}</div>` +
    `</div>` +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_STORY),
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: figures block left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("FIVE-FOR", "{{wickets}} WICKETS") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*10px)">` +
    `<div style="font:600 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:var(--gold,#F5B21A)">FIVE-WICKET HAUL</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*150px);line-height:.86;color:var(--gold,#F5B21A);margin-top:calc(var(--k,1.4)*8px)"><span>{{figures}}</span><span style="font-size:calc(var(--k,1.4)*44px);color:rgba(255,255,255,.6)"> ({{overs}})</span></div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*62px);line-height:.92;margin-top:calc(var(--k,1.4)*10px);text-transform:uppercase">{{playerName}}</div>` +
    `<div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6);margin-top:12px">{{grade}} · vs {{opponent}} · RD {{round}}</div>` +
    `</div>` +
    `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#F5B21A) 55%, transparent),0 24px 60px -30px rgba(0,0,0,.9)">` +
    slot("photo", "photo", "rect") +
    `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,7,9,.9)"></div></div>` +
    `</div>` +
    sponsorsOn(PRESENTED_BY_STORY) +
    sponsorsOff(HASHTAG_FOOTER_SHARED),
);

export const fiveFor: PackCardTemplate = {
  kind: "fiveFor",
  designKey: "five-for",
  name: "Five-for",
  sponsorVariants: ["on", "off"],
  fields: [
    ...clubHeaderFields(),
    textField("playerName", "Player name", "Alex Osborne"),
    textField("grade", "Grade", "A GRADE"),
    textField("wickets", "Wickets", "5"),
    textField("figures", "Figures", "5/23"),
    textField("overs", "Overs", "8.2"),
    textField("opponent", "Opponent", "MANDURAH"),
    textField("round", "Round", "5"),
    photoField("photo", "Bowler photo", "Bowler photo"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("hashtags", "Hashtag footer", "#YOURCLUB · #YOURLEAGUE"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
