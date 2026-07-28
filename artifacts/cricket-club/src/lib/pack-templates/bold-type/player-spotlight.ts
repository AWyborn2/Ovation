import type { PackCardTemplate } from "../types";
import {
  clubHeaderFields,
  outlineText,
  photoField,
  sharedColumnRoot,
  sharedHeader,
  slot,
  sponsorsOn,
  storyColumnRoot,
  storyHeader,
  textField,
} from "./fragments";

// C3 — Player Spotlight. Poster name, gold-framed cutout, flat stat boxes,
// one-line story.
//
// Field keys are IDENTICAL to Broadcast Dark's player-spotlight: `bindInput`
// maps a ShareCardInput onto keys per card KIND, not per pack.
//
// Sponsors: like Pack A's A3 this card is ["on"]-only. The bundle carries both
// a three-logo strip (needing `sponsor1..3` keys the reference design for
// "player" does not declare) and a sponsors-off hashtag half in the gold bar —
// both replaced with Pack A's footer contract: the presented-by credit only
// when sponsors are on, {{clubHashtag}} in the shared footer.
//
// The bundle is a single reflow markup (`--k`/`--ch`, no isStoryFmt branch).
// Its default-token rendering is the story, transcribed here with the 1.4
// scale baked in and normalised onto the pack's story root/header
// (storyColumnRoot's 80/70 margins, no header logo — the club logo binds in
// the shared header; the club identity rides the gold bar). The bundle set the
// name as two lines, forename white and surname gold; a single {{playerName}}
// field can't split, so the whole name takes the pack's signature outline
// treatment instead — same collapse rationale as match-result's result line.
// The shared (portrait/square) layout is authored from Pack A's shared
// structure (content column left, photo right) in Bold Type's language.

/** Flat stat box: 2px rule, sharp corners, Anton value, mono label. */
function statBox(valueKey: string, labelKey: string, hero: boolean, valueSize: string): string {
  const shell = hero
    ? `border:2px solid var(--gold,#F5B21A)`
    : `border:2px solid rgba(255,255,255,.16)`;
  const colour = hero ? `color:var(--gold,#F5B21A)` : `color:#fff`;
  return (
    `<div style="flex:1;${shell};border-radius:2px;padding:16px 18px">` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:${valueSize};line-height:.9;${colour}">{{${valueKey}}}</div>` +
    `<div style="font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;color:rgba(255,255,255,.55);margin-top:8px">{{${labelKey}}}</div></div>`
  );
}

/** Bundle photo frame: 2px gold ring, sharp corners, bottom scrim. Drops when
 * no photo is bound — an empty gold-framed box otherwise dominates the card. */
const STORY_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:1;min-height:0">` +
  `<div style="position:relative;height:100%;overflow:hidden;border-radius:2px;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 90px -50px rgba(6,12,22,.9)"></div></div></div>`;

const SHARED_PHOTO =
  `<div data-drop-if-empty="photo" style="flex:none;width:340px;position:relative;border-radius:2px;overflow:hidden;box-shadow:0 0 0 2px var(--gold,#F5B21A)">` +
  slot("photo", "photo", "rect") +
  `<div style="position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 -80px 80px -46px rgba(6,12,22,.9)"></div></div>`;

/**
 * The pack's gold bar, ["on"]-variant flavour: the bar itself always anchors
 * the story (club name in the accent's ink), only the presented-by credit is
 * conditional — mirrors the fragments' PRESENTED_BY_STORY margins exactly.
 */
const GOLD_BAR_STORY =
  `<div style="flex:none;background:var(--gold,#F5B21A);margin:0 -80px -70px;padding:30px 80px;color:var(--accent-ink,#1c1405);display:flex;align-items:center;justify-content:space-between">` +
  `<span style="font-weight:800;font-size:25px;letter-spacing:.01em">{{clubName}}</span>` +
  sponsorsOn(
    `<span style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;opacity:.82">presented by {{sponsorPresentedBy}}</span>`,
  ) +
  `</div>`;

/** Shared footer: hashtag always visible, presented-by only when sponsors on. */
const SHARED_FOOTER =
  `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
  `<div style="font-weight:700;font-size:24px;line-height:1;letter-spacing:.1em;color:var(--gold,#FBAC27)">{{clubHashtag}}</div>` +
  sponsorsOn(
    `<div style="font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:rgba(255,255,255,.6)">presented by {{sponsorPresentedBy}}</div>`,
  ) +
  `</div>`;

// ---------------------------------------------------------------------------
// Story (1080×1920) — outlined name, framed cutout, stat boxes, gold bar
// ---------------------------------------------------------------------------

const storyHtml = storyColumnRoot(
  storyHeader("PLAYER SPOTLIGHT · {{season}}") +
    `<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:22px;margin-top:22px">` +
    `<div>` +
    outlineText("{{playerName}}", 140, ";line-height:.82") +
    `<div style="font-weight:600;font-size:22px;line-height:1.4;color:rgba(255,255,255,.7);margin-top:12px;max-width:760px">{{headline}}</div></div>` +
    STORY_PHOTO +
    `<div style="display:flex;gap:16px">` +
    statBox("stat1Value", "stat1Label", true, "67px") +
    statBox("stat2Value", "stat2Label", false, "67px") +
    statBox("stat3Value", "stat3Label", false, "67px") +
    `</div>` +
    `</div>` +
    GOLD_BAR_STORY,
);

// ---------------------------------------------------------------------------
// Shared (portrait/square) — authored: content column left, photo right
// ---------------------------------------------------------------------------

const sharedHtml = sharedColumnRoot(
  sharedHeader("SPOTLIGHT", "{{season}}") +
    `<div style="flex:1;min-height:0;display:flex;align-items:stretch;gap:36px;padding:calc(var(--k,1.4)*14px) 0">` +
    `<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--k,1.4)*18px)">` +
    `<div><div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:var(--gold,#FBAC27)">PLAYER SPOTLIGHT</div>` +
    `<div style="font-family:var(--disp,'Anton'),sans-serif;font-size:calc(var(--k,1.4)*88px);line-height:.9;margin-top:14px;text-transform:uppercase">{{playerName}}</div></div>` +
    `<div style="display:flex;gap:16px">` +
    statBox("stat1Value", "stat1Label", true, "calc(var(--k,1.4)*44px)") +
    statBox("stat2Value", "stat2Label", false, "calc(var(--k,1.4)*44px)") +
    statBox("stat3Value", "stat3Label", false, "calc(var(--k,1.4)*44px)") +
    `</div>` +
    `<div style="font-weight:500;font-size:25px;line-height:1.45;color:rgba(255,255,255,.8);max-width:560px">{{headline}}</div>` +
    `</div>` +
    SHARED_PHOTO +
    `</div>` +
    SHARED_FOOTER,
);

export const playerSpotlight: PackCardTemplate = {
  kind: "player",
  designKey: "player-spotlight",
  name: "Player Spotlight",
  sponsorVariants: ["on"],
  fields: [
    ...clubHeaderFields(),
    textField("season", "Season", "2025/26"),
    textField("playerName", "Player name", "JACK MANUEL"),
    textField("stat1Value", "Stat 1 value", "428"),
    textField("stat1Label", "Stat 1 label", "RUNS"),
    textField("stat2Value", "Stat 2 value", "12"),
    textField("stat2Label", "Stat 2 label", "WICKETS"),
    textField("stat3Value", "Stat 3 value", "89"),
    textField("stat3Label", "Stat 3 label", "GAMES"),
    textField(
      "headline",
      "Headline",
      "A mainstay of the top order — 428 runs across the 2025/26 season so far.",
    ),
    photoField("photo", "Player photo", "Player photo / cutout"),
    textField("clubHashtag", "Club hashtag", "#YOURCLUB"),
    textField("sponsorPresentedBy", "Presented-by sponsor", "Your Sponsor"),
  ],
  formats: {
    story: storyHtml,
    shared: sharedHtml,
  },
};
