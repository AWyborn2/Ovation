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
 *    bottom edge, melting up through its own dusk ramp to near-black, with a
 *    rotated warm beam falling across the frame,
 *  - a **cursive script headline** (Kaushan Script in the accent colour) as
 *    the signature display type (`scriptText`),
 *  - **glass panels** — translucent dark cards with `backdrop-filter:blur`
 *    floating over the sky / photo field,
 *  - a **photo-first story format**: full-bleed hero photo under a cinematic
 *    scrim plus an accent horizon glow, with a circular club logo up top.
 *
 * The whole dusk palette is DERIVED from `var(--gold)` — see the palette
 * derivation block below. "Golden hour" is the pack's light, not its hue: a
 * green club gets a green dusk and a navy club a navy one, at the same depths.
 * `var(--ink)` still anchors the deepest stop; genuinely neutral material (the
 * `glassPanel` fill, sponsor plates, drop shadows, semantic win/loss colour in
 * the card modules) stays fixed on purpose.
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
// Palette derivation
// ---------------------------------------------------------------------------

/**
 * The tenant's accent. Everything warm on a Sunset card is mixed FROM this.
 *
 * The pack used to burn its accent into a set of fixed burnt-umber literals
 * (`#33170a`, `#26120a`, `#2a160b`, `#1a0f08`, `#0a0503`, `rgba(24,11,5,…)`,
 * `rgba(24,14,9,…)`) plus a warm cream family (`#FFF3E2`,
 * `rgba(255,238,214,…)`, `rgba(255,243,226,…)`). Those literals ARE a colour —
 * a golden hour — so a green or navy club got an amber card with brown corners
 * and a brown panel fighting their branding, on the pack whose whole identity is
 * the light. Same defect, and the same fix, as Metallic Foil's `FOIL_RAMP`.
 *
 * Two of the old stops were worse than fixed: they were dressed as tokens
 * (`var(--block,#2a160b)`, `var(--surface-deep,#0a0503)`) but neither `--block`
 * nor `--surface-deep` is ever set by `pack-render.ts`'s `rootStyle`, so they
 * always resolved to their umber fallbacks while reading as tenant-driven.
 * They are now derived like the rest. `--ink` IS set, so it stays a token.
 */
const G = "var(--gold,#FBAC27)";

/**
 * The dusk ramp: the accent burnt down toward black.
 *
 * This is the deep end of the sunset — the sky falling away from the sun. The
 * percentages below were solved so that each stop reproduces the umber it
 * replaces almost exactly at Halls Head's `#FBAC27` (every one of those umbers
 * was, in effect, the HH accent already scaled toward black), so HH cards are
 * unchanged while another club's sky is burnt down from THEIR colour.
 */
const dusk = (pct: number) => `color-mix(in srgb, ${G} ${pct}%, #000)`;

/**
 * The light end: the accent lifted toward white. Sunset's warm creams — the
 * script club name, the tagline, the glass sheen on the frosted panel — were
 * `#FFF3E2` / `rgba(255,238,214,…)`, i.e. white with a squeeze of Halls Head's
 * amber in it. Mixing toward white keeps that lightness for ANY accent (a navy
 * club gets a cool white, a green club a pale green-white) rather than tinting
 * every club's highlights amber.
 */
const cream = (pct: number) => `color-mix(in srgb, ${G} ${pct}%, #fff)`;

/** `colour` carried at `a`% opacity — the translucent form of a derived tone. */
const fade = (colour: string, a: number) => `color-mix(in srgb, ${colour} ${a}%, transparent)`;

/** The pack's cream (was `#FFF3E2` / `rgba(255,243,226,…)`). */
const CREAM = cream(14);
/** The glass sheen on the frosted panel (was `rgba(255,238,214,…)`). */
const SHEEN = cream(19);

// ---------------------------------------------------------------------------
// Background layers
// ---------------------------------------------------------------------------

/**
 * Story background: the sunset wash — accent glowing at the bottom horizon,
 * rising through the dusk ramp to near-black — plus a rotated warm beam. Two
 * stacked layers in the bundle (E20 Club Wickets is the canonical story bg;
 * the Match Result story instead lays a full-bleed photo over this).
 *
 * Ramp stops, and the umber each replaces at `--gold: #FBAC27`:
 * `dusk(41)` ≈ the old `mix(gold 34%, #1a0f08)` horizon, `dusk(16)` ≈ `#2a160b`,
 * `dusk(4)` ≈ `#0a0503`. `--ink` is a real token, so it stays one.
 */
export const STORY_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(135% 108% at 50% 122%, ${dusk(41)} 0%, ${dusk(16)} 30%, var(--ink,#120a07) 64%, ${dusk(4)} 100%)"></div>` +
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
 * EVERY value here is derived from `var(--gold)` — the ramp stops as well as
 * the glow layers. A tenant's accent is not merely lit against a fixed golden
 * hour; it IS the golden hour. What stays fixed is the DIRECTION and the depth
 * of the ramp (bright at the sun, falling away, ember at the foot); only the
 * hue follows the club, so a green club gets a green dusk and a navy club a
 * navy one instead of amber corners over their branding.
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
  //
  // At `--gold: #FBAC27` these four dusk stops land within a couple of levels
  // of the umbers they replace: dusk(55) ≈ the old `mix(gold 44%, #33170a)`,
  // dusk(37) ≈ `mix(gold 26%, #26120a)`, dusk(16) ≈ `#2a160b`, dusk(33) ≈
  // `mix(gold 26%, #1a0f08)`.
  `<div style="position:absolute;inset:0;background:linear-gradient(168deg, ${dusk(55)} 0%, ${dusk(37)} 13%, ${dusk(16)} 27%, var(--ink,#120a07) 60%, ${dusk(33)} 100%)"></div>` +
  // The sun itself, low and soft behind the club signature at the top left.
  `<div style="position:absolute;top:-340px;left:-230px;width:1000px;height:820px;background:radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, var(--gold,#FBAC27) 58%, transparent), transparent 66%)"></div>` +
  // Deepen the top-right corner so the sun has somewhere to fall away to. A
  // veil of the club's own dusk, not the old fixed `rgba(24,11,5,.62)` umber —
  // that literal was what put a brown corner on a green club's card.
  `<div style="position:absolute;inset:0;background:radial-gradient(70% 46% at 108% -8%, ${fade(dusk(8), 62)}, transparent 62%)"></div>` +
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
 *
 * The panel covers four fifths of the card, so its fill is the single biggest
 * colour on it: the old `rgba(24,14,9,.74)` base and `rgba(255,238,214,…)`
 * sheen were what made a navy club's card read brown no matter what their
 * accent was. Both are now derived — the base is the club's dusk, the sheen
 * their cream — while the composition, the blur and the ember are untouched.
 */
const FROSTED_PANEL =
  `<div style="position:absolute;left:${PANEL_INSET}px;right:${PANEL_INSET}px;top:${PANEL_TOP}px;bottom:${PANEL_INSET}px;border-radius:46px;` +
  `background:linear-gradient(180deg, ${fade(SHEEN, 10)}, ${fade(SHEEN, 1.5)} 38%), ` +
  `radial-gradient(112% 58% at 50% 116%, color-mix(in srgb, var(--gold,#FBAC27) 34%, transparent), transparent 74%), ` +
  `color-mix(in srgb, var(--gold,#FBAC27) 9%, ${fade(dusk(9), 74)});` +
  `border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 34%, rgba(255,255,255,.14));backdrop-filter:blur(14px);` +
  `box-shadow:0 26px 70px rgba(0,0,0,.5), inset 0 1px 0 ${fade(SHEEN, 12)}"></div>`;

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
 *
 * Deliberately NOT derived from `--gold`, unlike {@link FROSTED_PANEL}. This is
 * the small panel the pack drops over PHOTOS, and it is already neutral — a
 * cool dark that matches `--ink`, not a warm umber. Tinting it with the accent
 * would put a colour cast over a player's photo for the sake of a scrim that
 * nobody reads as a colour; the accent it sits under is doing that job.
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
    `<div style="display:inline-block;background:${fade(dusk(8), 72)};color:var(--gold,#FBAC27);border:1px solid color-mix(in srgb, var(--gold,#FBAC27) 52%, transparent);` +
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
    `<div style="font-family:'Kaushan Script',cursive;font-size:42px;line-height:1.18;color:${CREAM};text-shadow:0 3px 16px rgba(0,0,0,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{clubName}}</div>` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:${fade(CREAM, 74)};margin-top:10px;text-shadow:0 2px 10px rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{clubTagline}}</div>` +
    `</div>` +
    `</div>` +
    `<div style="text-align:right;flex:none">${goldChip(chipLabel)}` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:${fade(CREAM, 74)};margin-top:13px;text-shadow:0 2px 10px rgba(0,0,0,.45)">${tag}</div></div>` +
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
