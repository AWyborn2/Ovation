import { CLUB_LOGO_SLOT, columnRoot, slot } from "../shared";

/**
 * Shared markup fragments for the Sunset pack, transcribed verbatim from the
 * Pack E bundle. Same discipline as Broadcast Dark's and Gold Foil's: the
 * inline styles are copied rather than rewritten, because fidelity comes from
 * not re-authoring the CSS.
 *
 * Pack-agnostic mechanics (slots, sponsor wrappers, format roots, field
 * descriptors) come from `../shared` and are re-exported here so card modules
 * import from one place.
 *
 * Sunset's identity vs the other packs:
 *  - a **sunset-horizon radial wash** — the tenant accent burning at the
 *    bottom edge, melting up through burnt umber (`#1a0f08` / `#2a160b`) to
 *    near-black, with a rotated warm beam falling across the frame,
 *  - a **cursive script headline** (Kaushan Script in the accent colour) as
 *    the signature display type (`scriptText`),
 *  - **glass panels** — translucent dark cards with `backdrop-filter:blur`
 *    floating over the sky / photo field,
 *  - a **photo-first story format**: full-bleed hero photo under a cinematic
 *    scrim plus an accent horizon glow, with a circular club logo up top.
 *
 * Accents read `var(--gold)` / `var(--panel)` / `var(--ink)` so tenant theming
 * drives the palette; the burnt-umber ramp literals stay fixed because the
 * warm dusk material IS the pack, the way Gold Foil keeps its metal ramp.
 *
 * Feed (portrait/square) composition — a DEPARTURE from the bundle.
 *
 * The bundle authored every pack's non-story branch as Broadcast Dark's layout
 * with a different background swapped in, so all five packs rendered
 * near-identically in the feed formats and in the Studio's pack picker. Bold
 * Type answered that with a vertical type spine; Sunset answers it with a
 * POSTCARD.
 *
 * The feed card is a warm golden-hour sky held at full bleed, with the club's
 * signature — circular logo, name set in the pack's Kaushan script, tagline —
 * sitting directly on that sky in an open band across the top. Everything else
 * lives inside one big inset FROSTED PANEL ({@link sharedColumnRoot}) that
 * occupies the lower four-fifths of the card, rounded hard and floated off the
 * left/right/bottom edges so the sky reads as a warm border all the way round.
 *
 * That is Sunset's own thesis — glass over dusk, script over grotesk — applied
 * to the format, and it is what separates it at thumbnail size: a glowing
 * margin round a rounded slab, versus Broadcast Dark's edge-to-edge stage and
 * Bold Type's left-edge spine.
 *
 * Two properties the composition has to hold, and how it does:
 *  - **no photo is the normal case.** Most Sunset cards bind no photo in the
 *    feed formats, so the panel (not an image) is what makes the card feel
 *    full: it gives an under-filled card generous, deliberate interior space
 *    plus its own warm ember glow at the foot, rather than an empty frame.
 *  - **the six photo-hero cards bypass this root.** Debut, both grade leaders,
 *    New Cap, New Signing and Record build their own layer stacks on
 *    {@link SHARED_BG} (they need a photo under the scrims). They still take
 *    {@link sharedHeader}, so the club signature and the sunrise band carry the
 *    pack identity onto them; only the panel is absent, where the photo is
 *    doing that job instead.
 *
 * The header/panel geometry is a closed loop: {@link sharedHeader}'s fixed
 * height and bottom gap, the column padding and {@link PANEL_TOP} are solved
 * against each other so the first content row lands exactly inside the panel.
 * Change one constant and you must re-solve the rest — they are derived below
 * rather than written out for that reason.
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
 * Story background: the sunset wash — accent glowing at the bottom horizon,
 * rising through burnt umber to near-black — plus a rotated warm beam. Two
 * stacked layers in the bundle (E20 Club Wickets is the canonical story bg;
 * the Match Result story instead lays a full-bleed photo over this).
 */
export const STORY_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(135% 108% at 50% 122%, color-mix(in srgb, var(--gold,#FBAC27) 34%, #1a0f08) 0%, var(--block,#2a160b) 30%, var(--ink,#120a07) 64%, var(--surface-deep,#0a0503) 100%)"></div>` +
  `<div style="position:absolute;top:-160px;right:-150px;width:740px;height:900px;background:linear-gradient(180deg,color-mix(in srgb, var(--gold,#FBAC27) 12%, transparent),transparent);transform:rotate(18deg)"></div>`;

/**
 * Feed (non-story) background: the sunset SKY.
 *
 * The bundle's `isNotStory` branch was the shared dark stage every pack used,
 * which is exactly why the five packs looked alike in the feed formats. This is
 * re-lit for the postcard composition: the sun sits high, burning warm across
 * the top band where the club signature reads, falls away through burnt umber
 * through the middle (which the frosted panel covers anyway), and returns as an
 * ember along the bottom edge — so the strip of sky left visible around the
 * panel glows on all four sides.
 *
 * Every warm value mixes `var(--gold)`, so a tenant's accent IS its dusk; the
 * umber literals it mixes into stay fixed, like Gold Foil's metal ramp.
 *
 * The six photo-hero cards (Debut, both grade leaders, New Cap, New Signing,
 * Record) build their own layer stacks on this, so it has to survive having a
 * photo and a scrim laid over it — nothing here is positioned to a card's
 * content, only to the frame.
 */
export const SHARED_BG =
  // Diagonal so the light has a direction — brightest at the top left, falling
  // away across and down. A flat vertical ramp read as "a gold gradient"; the
  // 168° tilt is what makes it read as a sky with a sun in it.
  `<div style="position:absolute;inset:0;background:linear-gradient(168deg, color-mix(in srgb, var(--gold,#FBAC27) 44%, #33170a) 0%, color-mix(in srgb, var(--gold,#FBAC27) 26%, #26120a) 13%, var(--block,#2a160b) 27%, var(--ink,#120a07) 60%, color-mix(in srgb, var(--gold,#FBAC27) 26%, #1a0f08) 100%)"></div>` +
  // The sun itself, low and soft behind the club signature at the top left.
  `<div style="position:absolute;top:-340px;left:-230px;width:1000px;height:820px;background:radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, var(--gold,#FBAC27) 58%, transparent), transparent 66%)"></div>` +
  // Deepen the top-right corner so the sun has somewhere to fall away to.
  `<div style="position:absolute;inset:0;background:radial-gradient(70% 46% at 108% -8%, rgba(24,11,5,.62), transparent 62%)"></div>` +
  // The bundle's rotated warm beam, kept — it rakes down through the sky.
  `<div style="position:absolute;top:-180px;right:-160px;width:820px;height:1300px;background:linear-gradient(180deg,color-mix(in srgb, var(--gold,#FBAC27) 13%, transparent),transparent);transform:rotate(20deg)"></div>` +
  // Ember along the bottom edge, so the sky closes the postcard border.
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 40% at 50% 108%, color-mix(in srgb, var(--gold,#FBAC27) 36%, transparent), transparent 62%)"></div>`;

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

// --- Postcard geometry ------------------------------------------------------
//
// One closed loop of constants. The frosted panel is an absolute LAYER (behind
// the content, not wrapping it, because `columnInner` arrives as one opaque
// blob), so the column's padding has to be solved to land the content inside
// it. Header height + gap are owned by `sharedHeader`; everything else derives.

/** Sky left visible round the panel on the left/right/bottom edges. */
const PANEL_INSET = 38;
/** Interior padding of the frosted panel, per side. */
const PANEL_PAD_X = 42;
const PANEL_PAD_TOP = 46;
const PANEL_PAD_BOTTOM = 42;
/** Top of the open sky band, where the club signature sits. */
const HEADER_TOP = 56;
/** Fixed height of {@link sharedHeader}'s signature row, and the gap under it. */
const HEADER_H = 100;
const HEADER_GAP = 52;

/**
 * Where the panel's top edge cuts across the card — derived so the first
 * content row after {@link sharedHeader} sits exactly `PANEL_PAD_TOP` inside it.
 */
const PANEL_TOP = HEADER_TOP + HEADER_H + HEADER_GAP - PANEL_PAD_TOP;

/**
 * The inset frosted panel: Sunset's own `glassPanel` material blown up to hold
 * a whole card, floated off three edges so the sky borders it, with a warm
 * hairline and its own ember glow inside the foot — that glow is what keeps a
 * sparsely-filled card (most of them bind no feed photo) reading as deliberate
 * space rather than a blank frame.
 */
const FROSTED_PANEL =
  `<div style="position:absolute;left:${PANEL_INSET}px;right:${PANEL_INSET}px;top:${PANEL_TOP}px;bottom:${PANEL_INSET}px;border-radius:46px;` +
  `background:linear-gradient(180deg, rgba(255,238,214,.10), rgba(255,238,214,.015) 38%), ` +
  `radial-gradient(112% 58% at 50% 116%, color-mix(in srgb, var(--gold,#FBAC27) 34%, transparent), transparent 74%), ` +
  `color-mix(in srgb, var(--gold,#FBAC27) 9%, rgba(24,14,9,.74));` +
  `border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 34%, rgba(255,255,255,.14));backdrop-filter:blur(14px);` +
  `box-shadow:0 26px 70px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,240,220,.12)"></div>`;

/**
 * Feed root: the sunset sky, the inset frosted panel, and a column padded so
 * the signature row sits on the open sky and everything after it sits inside
 * the panel.
 *
 * `panel: false` is available for a card whose feed composition wants the bare
 * sky (a full-bleed photo, say) — none of the twenty need it today, because the
 * six photo-hero cards already build their own roots on {@link SHARED_BG}, but
 * the switch is here so such a card never has to fork the root.
 */
export function sharedColumnRoot(
  columnInner: string,
  rootStyle = "",
  { panel = true }: { panel?: boolean } = {},
): string {
  return columnRoot(
    SHARED_BG + (panel ? FROSTED_PANEL : ""),
    columnInner,
    `${HEADER_TOP}px ${PANEL_INSET + PANEL_PAD_X}px ${PANEL_INSET + PANEL_PAD_BOTTOM}px`,
    rootStyle,
  );
}

/**
 * Story root — the sunset wash plus a flex column at the bundle's story
 * padding. Cards that lay a photo (or extra scrims) under the column build on
 * `columnRoot` directly with their own layer stack, as Match Result does.
 */
export function storyColumnRoot(columnInner: string, columnStyle = ""): string {
  return columnRoot(STORY_BG, columnInner, "60px 70px 54px", "", columnStyle);
}

// ---------------------------------------------------------------------------
// Type treatments
// ---------------------------------------------------------------------------

/**
 * The pack's signature: a cursive script headline (Kaushan Script) set in the
 * tenant accent with a deep soft shadow — the handwritten "Match Result" /
 * "Club Wickets" flourish over every card. The family is already loaded
 * app-side by `card-fonts.ts` (it is one of the Social Studio card fonts).
 */
export function scriptText(content: string, fontSize: number, extraStyle = ""): string {
  return `<div style="font-family:'Kaushan Script',cursive;font-size:${fontSize}px;line-height:1;color:var(--gold,#F5B21A);text-shadow:0 3px 18px rgba(0,0,0,.75)${extraStyle}">${content}</div>`;
}

/**
 * Glass panel: the translucent dark card with a hairline border and backdrop
 * blur that Sunset floats over its photo / sky fields. Padding and layout are
 * the caller's via `extraStyle` (must start with `;`).
 */
export function glassPanel(inner: string, extraStyle = ""): string {
  return `<div style="background:rgba(10,12,16,.62);border:1px solid rgba(255,255,255,.14);border-radius:20px;backdrop-filter:blur(9px)${extraStyle}">${inner}</div>`;
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Story header: circular club logo + name/tagline on the left (text-shadowed
 * to sit over a photo or bright sky), a gold mono tag right. Sunset is the
 * only pack whose story format carries the logo — cropped to a circle, per
 * the bundle.
 */
export function storyHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:92px;height:92px;border-radius:50%;overflow:hidden;flex:none">${CLUB_LOGO_SLOT}</div>` +
    `<div><div style="font-weight:800;font-size:28px;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,.7)">{{clubName}}</div>` +
    `<div style="font:500 14px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.72);margin-top:6px;text-shadow:0 2px 10px rgba(0,0,0,.8)">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="font:700 17px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.14em;color:var(--gold,#F5B21A);text-align:right;text-shadow:0 2px 10px rgba(0,0,0,.85);max-width:300px">${tag}</div>` +
    `</div>`
  );
}

/**
 * Feed chip — INVERTED against every other pack's, and a full pill rather than
 * the 7px-radius tab the broadcast packs use (the softest pack in the catalogue
 * has no square corners on its feed furniture).
 *
 * A solid accent chip is invisible on Sunset's sky, which is itself made of the
 * accent; and the same header also has to survive sitting on a dark photo scrim
 * (New Cap, New Signing). A frosted dark pill with an accent label is legible
 * over both, and it says glass — the pack's own material — where the other
 * packs say broadcast lower-third.
 */
export function goldChip(label: string): string {
  return (
    `<div style="display:inline-block;background:rgba(20,11,6,.72);color:var(--gold,#FBAC27);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 52%, transparent);` +
    `backdrop-filter:blur(8px);font-weight:800;font-size:20px;line-height:1;letter-spacing:.09em;padding:13px 22px;border-radius:999px;box-shadow:0 8px 22px rgba(0,0,0,.4)">${label}</div>`
  );
}

/**
 * Feed header — the club signature, set on the open sky ABOVE the frosted
 * panel: a circular logo in a warm ring, the club name in the pack's Kaushan
 * script, the tagline tracked out underneath, and the chip + tag opposite.
 *
 * The script name is the whole point. Every other pack sets the club in a
 * heavy grotesk or a mono wordmark; Sunset writes it by hand, which is the one
 * mark that says club-social warmth rather than TV graphics — and it is legible
 * as such at thumbnail size, where the panel silhouette and the glowing border
 * do the rest.
 *
 * The circular crop matches the pack's story header (Sunset is the only pack
 * that puts the logo in the story at all) and the slot keeps `fit=contain`, so
 * a wide rectangular logo letterboxes inside the ring instead of being cropped.
 *
 * Height and bottom gap are FIXED and shared with {@link sharedColumnRoot}'s
 * geometry — the panel's top edge is derived from them. Do not make either
 * flex, or content will no longer land inside the panel. The name is allowed to
 * shrink (`min-width:0` + clip) rather than grow the row for a long club name.
 */
export function sharedHeader(chipLabel: string, tag: string): string {
  return (
    `<div style="flex:none;height:${HEADER_H}px;display:flex;align-items:center;justify-content:space-between;gap:26px;margin-bottom:${HEADER_GAP}px">` +
    `<div style="display:flex;align-items:center;gap:22px;min-width:0">` +
    `<div style="width:92px;height:92px;flex:none;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.10);box-shadow:0 0 0 2px color-mix(in srgb, var(--gold,#FBAC27) 55%, transparent), 0 10px 26px rgba(0,0,0,.45)">${CLUB_LOGO_SLOT}</div>` +
    `<div style="min-width:0">` +
    `<div style="font-family:'Kaushan Script',cursive;font-size:42px;line-height:1.18;color:#FFF3E2;text-shadow:0 3px 16px rgba(0,0,0,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{clubName}}</div>` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:rgba(255,243,226,.74);margin-top:10px;text-shadow:0 2px 10px rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{clubTagline}}</div>` +
    `</div>` +
    `</div>` +
    `<div style="text-align:right;flex:none">${goldChip(chipLabel)}` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:rgba(255,243,226,.74);margin-top:13px;text-shadow:0 2px 10px rgba(0,0,0,.45)">${tag}</div></div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

/**
 * Story "presented by <sponsor>" line (column footer). Sunset sets the sponsor
 * name in white, not the accent — over the warm wash a second accent hit read
 * as part of the sky.
 */
export const PRESENTED_BY_STORY = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.55);text-shadow:0 2px 10px rgba(0,0,0,.8)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;

/** Story sponsors-off hashtag line (same slot as the presented-by line). */
export const HASHTAG_FOOTER_STORY = `<div style="flex:none;text-align:center;font:700 19px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:var(--gold,#F5B21A);text-shadow:0 2px 10px rgba(0,0,0,.8)">{{clubHashtag}}</div>`;

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
