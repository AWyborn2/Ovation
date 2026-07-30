import { CLUB_LOGO_SLOT, columnRoot, slot } from "../shared";

/**
 * Shared markup fragments for the Gold Foil pack, transcribed verbatim from
 * `Pack B - Gold Foil.dc.html`. Same discipline as Broadcast Dark's: the inline
 * styles are copied rather than rewritten, because fidelity comes from not
 * re-authoring the CSS.
 *
 * Pack-agnostic mechanics (slots, sponsor wrappers, format roots, field
 * descriptors) come from `../shared` and are re-exported here so card modules
 * import from one place.
 *
 * Gold Foil's identity vs Broadcast Dark:
 *  - a **radial "record groove"** field instead of the rotated beam,
 *  - **metallic foil gradient** display type (background-clip:text + `hhShine`),
 *  - a **gold ribbon** for the hero callout,
 *  - a centred story composition rather than left-aligned.
 *
 * Feed (portrait/square) composition — a DEPARTURE from the bundle.
 *
 * The bundle authored every pack's non-story branch as Broadcast Dark's layout
 * with a different background swapped in, so all five packs rendered
 * near-identically in the feed formats and in the Studio's pack picker — you
 * could not tell Gold Foil from Bold Type at a glance, which defeats the point
 * of a catalogue.
 *
 * Gold Foil's feed layout is therefore rebuilt around the pack's own
 * grand-final/awards language, as a **presentation certificate**:
 *
 *  - {@link sharedHeader} is no longer a header row but a full-bleed **gold
 *    foil RIBBON** across the top — a milled metal band (pale sheen → gold →
 *    bronze shadow) carrying a dark **seal medallion** with the club logo, the
 *    club name debossed in the accent's ink, and an inverted ink pill for the
 *    card's label. Two darker **folds hang below its ends**, so it reads as a
 *    ribbon pinned across the card rather than a broadcast band.
 *  - {@link sharedColumnRoot} sets the content in an **honour-board frame** —
 *    a double gold hairline with diamond corner marks, starting *below* the
 *    ribbon so the ribbon caps it.
 *  - {@link SHARED_BG} re-anchors the concentric grooves from the centre of the
 *    card (where they read as Broadcast Dark's stage glow) to a **bottom-right
 *    corner arc**, leaving the top clean for the ribbon.
 *
 * Bold Type answers the same problem with a vertical type spine at the left
 * edge; Gold Foil answers it with a horizontal ribbon and a framed board. The
 * two silhouettes are opposites, which is the point at thumbnail size.
 */

export {
  CLUB_LOGO_SLOT,
  clubHeaderFields,
  formatRoot,
  logoField,
  photoField,
  repeatField,
  slot,
  sponsorsOff,
  sponsorsOn,
  textField,
} from "../shared";

// ---------------------------------------------------------------------------
// Background layers
// ---------------------------------------------------------------------------

/**
 * Story background: flat ink, concentric gold grooves, then a vignette that
 * fades the grooves out toward the edges. Three stacked layers in the bundle.
 */
export const STORY_BG =
  `<div style="position:absolute;inset:0;background:var(--ink,#070603)"></div>` +
  `<div style="position:absolute;inset:0;background:repeating-radial-gradient(circle at 50% 40%, transparent 0 58px, color-mix(in srgb, var(--gold,#FBAC27) 9%, transparent) 58px 60px)"></div>` +
  `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 40%, transparent 38%, var(--surface-deep,#050403) 80%)"></div>`;

/**
 * Non-story background: the groove field re-anchored to the BOTTOM-RIGHT corner
 * as an arc ornament, under a warm gold wash from the top edge.
 *
 * The bundle centred the grooves at `50% 40%` and stacked Broadcast Dark's
 * rotated beam and panel glow on top — which is exactly why the two packs' feed
 * cards were indistinguishable. Anchoring the arcs in one corner turns them
 * into an ornament instead of a stage, and leaves the top of the card clear for
 * the ribbon ({@link sharedHeader}).
 *
 * Exported because record / grade-leader compose their own photo layers onto
 * this field directly rather than through {@link sharedColumnRoot}.
 */
export const SHARED_BG =
  `<div style="position:absolute;inset:0;background:var(--ink,#070603)"></div>` +
  `<div style="position:absolute;inset:0;background:repeating-radial-gradient(circle at 100% 100%, transparent 0 68px, color-mix(in srgb, var(--gold,#FBAC27) 20%, transparent) 68px 70px)"></div>` +
  `<div style="position:absolute;inset:0;background:radial-gradient(circle at 100% 100%, transparent 0 22%, var(--surface-deep,#050403) 72%)"></div>` +
  `<div style="position:absolute;inset:0;background:linear-gradient(180deg, color-mix(in srgb, var(--gold,#FBAC27) 16%, transparent), transparent 26%)"></div>`;

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

/** Column padding shared by every non-story root (record / grade-leader repeat
 * these literals because they call `columnRoot` directly). */
const PAD_T = 58;
const PAD_X = 66;
const PAD_B = 52;

/** Height of the folds hanging below the ribbon's two ends. */
const RIBBON_FOLD = 32;

/**
 * Where the honour-board frame starts: clear of the ribbon band and its folds
 * (see {@link sharedHeader} — band 142px, folds another {@link RIBBON_FOLD}).
 */
const FRAME_TOP = 184;

/**
 * The honour-board frame: a double gold hairline with diamond corner marks,
 * inset from the card edge and starting below the ribbon so the ribbon caps it.
 *
 * This is the certificate/awards device the pack's story format already implies
 * (foil type, gold ribbon callout, premiership honours) applied to the frame of
 * the card itself.
 */
function honourFrame(): string {
  const outer = `color-mix(in srgb, var(--gold,#FBAC27) 30%, transparent)`;
  const inner = `color-mix(in srgb, var(--gold,#FBAC27) 13%, transparent)`;
  const mark = (pos: string) =>
    `<div style="position:absolute;${pos};width:12px;height:12px;transform:rotate(45deg);background:var(--gold,#FBAC27);opacity:.62"></div>`;
  return (
    `<div style="position:absolute;top:${FRAME_TOP + 9}px;left:35px;right:35px;bottom:35px;border:1px solid ${inner}"></div>` +
    `<div style="position:absolute;top:${FRAME_TOP}px;left:26px;right:26px;bottom:26px;border:1px solid ${outer}">` +
    mark("left:-6px;top:-6px") +
    mark("right:-6px;top:-6px") +
    mark("left:-6px;bottom:-6px") +
    mark("right:-6px;bottom:-6px") +
    `</div>`
  );
}

/**
 * Non-story root: the corner-arc groove field, the honour-board frame, and the
 * standard padded flex column.
 *
 * The column's first child is normally {@link sharedHeader}'s ribbon, which
 * cancels this padding with negative margins to bleed to the card edge — change
 * one and you must change the other.
 */
export function sharedColumnRoot(columnInner: string, rootStyle = ""): string {
  return columnRoot(
    SHARED_BG + honourFrame(),
    columnInner,
    `${PAD_T}px ${PAD_X}px ${PAD_B}px`,
    rootStyle,
  );
}

/**
 * Story root — a flex column, not the bundle's absolute positioning.
 *
 * The bundle pins every block to a fixed `top`, which is fine for a fixed
 * composition but brittle the moment a block is conditional: removing the
 * Player-of-the-Match panel left ~300px of dead space, and an unset hero photo
 * left a large empty framed box. A column reflows instead, so both collapse
 * cleanly and future edits do not need coordinates re-tuned by hand.
 */
export function storyColumnRoot(columnInner: string, columnStyle = ""): string {
  return columnRoot(STORY_BG, columnInner, "96px 70px 66px", "", columnStyle);
}

// ---------------------------------------------------------------------------
// Type treatments
// ---------------------------------------------------------------------------

/**
 * The pack's signature: brushed-metal gradient clipped to the glyphs, animated
 * by the bundle's `hhShine` keyframes.
 *
 * The gradient is a fixed metal ramp, NOT `--gold`: it is a specular highlight
 * sequence (pale → gold → bronze → shadow → pale) that a single tenant colour
 * cannot express. A tenant's accent still drives every `var(--gold)` around it,
 * so the card reads as theirs while the foil keeps its material look.
 */
export function foilText(content: string, fontSize: number, extraStyle = ""): string {
  return (
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:${fontSize}px;line-height:.84;text-transform:uppercase;letter-spacing:.01em;` +
    `background:linear-gradient(180deg,#FFF3CC 4%,#F7CE6C 32%,#C8860A 60%,#8A5B06 78%,#FFE59C 100%);background-size:100% 220%;` +
    `-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;` +
    `animation:hhShine 5.5s ease-in-out infinite;filter:drop-shadow(0 3px 14px rgba(0,0,0,.6))${extraStyle}">${content}</div>`
  );
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Story header: centred club name over a gold-ruled tag line. Gold Foil has no
 * logo slot in the story format — the bundle sets the club name in tracked caps
 * as the wordmark.
 */
export function storyHeader(tag: string): string {
  return (
    `<div style="flex:none;text-align:center">` +
    `<div style="font:600 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.38em;color:rgba(255,255,255,.62)">{{clubName}}</div>` +
    `<div style="display:flex;align-items:center;justify-content:center;gap:18px;margin-top:24px">` +
    `<span style="width:118px;height:1px;background:linear-gradient(90deg,transparent,var(--gold,#F5B21A))"></span>` +
    `<span style="font:600 17px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;color:var(--gold,#F5B21A)">${tag}</span>` +
    `<span style="width:118px;height:1px;background:linear-gradient(90deg,var(--gold,#F5B21A),transparent)"></span>` +
    `</div></div>`
  );
}

/** Solid gold pill chip (non-story header, right side). */
export function goldChip(label: string): string {
  return `<div style="display:inline-block;background:var(--gold,#FBAC27);color:var(--accent-ink,#151515);font-weight:800;font-size:20px;line-height:1;letter-spacing:.03em;padding:11px 15px;border-radius:7px">${label}</div>`;
}

/**
 * The milled-foil face of the ribbon: pale sheen at the top edge, full accent
 * through the middle, bronze shadow at the fold.
 *
 * Unlike {@link foilText}'s fixed specular ramp, every stop is mixed FROM
 * `var(--gold)`, so a band this large stays the tenant's colour rather than
 * imposing one club's brass on everyone.
 */
const RIBBON_FACE =
  `linear-gradient(180deg,` +
  `color-mix(in srgb, var(--gold,#FBAC27) 44%, #FFFFFF) 0%,` +
  `color-mix(in srgb, var(--gold,#FBAC27) 88%, #FFFFFF) 15%,` +
  `var(--gold,#FBAC27) 46%,` +
  `color-mix(in srgb, var(--gold,#FBAC27) 72%, #000000) 82%,` +
  `color-mix(in srgb, var(--gold,#FBAC27) 88%, #000000) 100%)`;

/** One of the darker folds hanging below the ribbon's ends. */
function ribbonFold(side: "left" | "right"): string {
  const edge =
    side === "left"
      ? `left:0;border-right:48px solid transparent`
      : `right:0;border-left:48px solid transparent`;
  return (
    `<div style="position:absolute;top:100%;${edge};width:0;height:0;` +
    `border-top:${RIBBON_FOLD}px solid color-mix(in srgb, var(--gold,#FBAC27) 68%, #000000)"></div>`
  );
}

/** The seal: the club logo in a dark medallion ringed in gold, struck into the
 * ribbon. Uses the contain-fit slot so a wordmark logo is not cropped by the
 * circle. */
const RIBBON_SEAL =
  `<div style="position:relative;width:96px;height:96px;flex:none;border-radius:50%;background:var(--ink,#070603);` +
  `box-shadow:0 0 0 3px color-mix(in srgb, var(--gold,#FBAC27) 58%, #000000),inset 0 0 0 2px color-mix(in srgb, var(--gold,#FBAC27) 34%, transparent),0 6px 18px -8px rgba(0,0,0,.8)">` +
  `<div style="position:absolute;inset:16px">${CLUB_LOGO_SLOT}</div></div>`;

/** Ink at `pct` opacity — for type set ON the ribbon, where white would blow out. */
export function ribbonInk(pct: number): string {
  return `color-mix(in srgb, var(--accent-ink,#151515) ${pct}%, transparent)`;
}

/**
 * Inverted chip for the ribbon: a dark seal-pill with gold type. {@link goldChip}
 * is invisible on the band, so the label flips instead.
 */
export function ribbonChip(label: string): string {
  return (
    `<div style="display:inline-block;background:var(--ink,#070603);color:var(--gold,#FBAC27);font-weight:800;font-size:19px;` +
    `line-height:1;letter-spacing:.16em;padding:13px 21px;border-radius:999px;box-shadow:0 4px 12px -4px rgba(0,0,0,.7)">${label}</div>`
  );
}

/** Small tracked line under a ribbon chip (season / as-of / "CLUB BEST"). */
export function ribbonTag(tag: string): string {
  return `<div style="font:700 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;margin-top:13px;color:${ribbonInk(82)}">${tag}</div>`;
}

/**
 * The gold foil RIBBON — Gold Foil's feed signature.
 *
 * A full-bleed milled-metal band across the top of the card: the seal on the
 * left with `left` beside it, `right` set opposite. It cancels
 * {@link sharedColumnRoot}'s padding with negative margins so it bleeds to the
 * card edge, and hangs a fold below each end so the silhouette reads as a
 * ribbon pinned across the card rather than a header row above it. That
 * silhouette — a bright horizontal bar over a framed dark board — is what
 * separates Gold Foil from the other packs at thumbnail size.
 *
 * The negative margins assume the shared `58px 66px 52px` column padding, which
 * record / grade-leader also pass to `columnRoot` directly. Type set into
 * `left`/`right` sits on gold, so it must be inked ({@link ribbonInk}) rather
 * than white, and {@link FRAME_TOP} must clear the band plus its folds.
 *
 * Exported (rather than inlined into {@link sharedHeader}) for the one card
 * whose reference design declares no `clubName`: see debut.ts.
 */
export function ribbonBand(left: string, right: string): string {
  return (
    `<div style="flex:none;position:relative;margin:-${PAD_T}px -${PAD_X}px 56px;padding:25px ${PAD_X}px 24px;` +
    `background:${RIBBON_FACE};box-shadow:0 24px 50px -28px rgba(0,0,0,.95)">` +
    `<div style="position:absolute;left:0;right:0;top:0;height:2px;background:rgba(255,255,255,.55)"></div>` +
    `<div style="position:absolute;left:0;right:0;bottom:0;height:5px;background:color-mix(in srgb, var(--gold,#FBAC27) 44%, #000000)"></div>` +
    ribbonFold("left") +
    ribbonFold("right") +
    `<div style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px">` +
    `<div style="display:flex;align-items:center;gap:24px;min-width:0">${RIBBON_SEAL}${left}</div>` +
    `<div style="text-align:right;flex:none">${right}</div>` +
    `</div></div>`
  );
}

/**
 * Feed header: the ribbon carrying the club identity — name debossed in the
 * accent's ink over the tagline, with the card's label as an inverted chip.
 *
 * Every card that shows the club identity in its feed header routes through
 * here, so this one function is the pack's feed voice.
 */
export function sharedHeader(chipLabel: string, tag: string): string {
  return ribbonBand(
    `<div style="min-width:0">` +
      `<div style="font-weight:800;font-size:37px;line-height:1;letter-spacing:.02em;text-transform:uppercase;` +
      `color:var(--accent-ink,#151515);text-shadow:0 1px 0 rgba(255,255,255,.4)">{{clubName}}</div>` +
      `<div style="font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;text-transform:uppercase;margin-top:13px;color:${ribbonInk(72)}">{{clubTagline}}</div>` +
      `</div>`,
    ribbonChip(chipLabel) + ribbonTag(tag),
  );
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

/** Story "presented by <sponsor>" line (column footer). */
export const PRESENTED_BY_STORY = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:var(--gold,#F5B21A);font-weight:700">{{sponsorPresentedBy}}</span></div>`;

/** Story sponsors-off hashtag line (same slot as the presented-by line). */
export const HASHTAG_FOOTER_STORY = `<div style="flex:none;text-align:center;font-weight:600;font-size:20px;line-height:1;letter-spacing:.14em;color:rgba(255,255,255,.4)">{{clubHashtag}}</div>`;

function sponsorSlots(height: number): string {
  return [1, 2, 3]
    .map(
      (n) =>
        `<div style="flex:1;height:${height}px;border-radius:11px;overflow:hidden;background:rgba(255,255,255,.92)">${slot(`sponsor${n}`, "sponsor", "rounded", 11)}</div>`,
    )
    .join("");
}

/** Non-story three-logo sponsor strip (flex:none block at the column foot). */
export const SPONSOR_STRIP_SHARED =
  `<div style="flex:none"><div style="font:600 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;color:rgba(255,255,255,.4);margin-bottom:12px">PROUDLY SUPPORTED BY</div>` +
  `<div style="display:flex;gap:14px">${sponsorSlots(88)}</div></div>`;

/** Non-story sponsors-off hashtag footer. */
export const HASHTAG_FOOTER_SHARED = `<div style="flex:none;text-align:center;font-weight:700;font-size:24px;line-height:1;letter-spacing:.13em;color:var(--gold,#FBAC27)">{{hashtags}}</div>`;
