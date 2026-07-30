import { CLUB_LOGO_SLOT, columnRoot, slot } from "../shared";

/**
 * Shared markup fragments for the Neon Night pack, transcribed verbatim from
 * the Pack D bundle (`d-result.html` / `d-clubwkts.html`). Same discipline as
 * Broadcast Dark's and Gold Foil's: the inline styles are copied rather than
 * rewritten, because fidelity comes from not re-authoring the CSS.
 *
 * Pack-agnostic mechanics (slots, sponsor wrappers, format roots, field
 * descriptors) come from `../shared` and are re-exported here so card modules
 * import from one place.
 *
 * Neon Night's identity ("Glassmorphism panels + neon glow — night-T20
 * energy"):
 *  - a **night-sky navy radial** background with two blurred neon orbs — a
 *    fixed cyan one and a tenant-accent one — breathing on the app-side
 *    `hhGlow` keyframes,
 *  - **glassmorphism panels**: translucent white fills, hairline borders and
 *    `backdrop-filter:blur(6px)`,
 *  - **neon glow display type** (`neonText`): white or accent type under
 *    layered floodlight text-shadows, where Gold Foil clips a metal gradient,
 *  - a **circular club logo in a cyan glow ring** as the story wordmark.
 *
 * Cyan `#37CFE6` / `rgba(55,207,230,…)` is the pack's fixed secondary accent —
 * the "stadium floodlight" colour — kept as a literal on purpose, the same way
 * Gold Foil keeps its metal ramp: it is part of the design's identity, not the
 * tenant's. Every other accent reads `var(--gold)` / `var(--panel)` /
 * `var(--ink)` so tenant theming still owns the card.
 *
 * Feed (portrait/square) composition — a DEPARTURE from the bundle.
 *
 * The bundle authored every pack's non-story branch as Broadcast Dark's layout
 * with a different background swapped in, so all five packs rendered
 * near-identically in the feed formats and in the Studio's pack picker — you
 * could not tell Neon Night from Gold Foil at thumbnail size, which defeats the
 * point of a catalogue.
 *
 * Neon Night's feed layout therefore stops being a header/body/footer stack
 * bled to the card edge and becomes a **lit glass slab hovering in the dark**:
 *
 *  - the orb field runs full-bleed ({@link SHARED_BG}, now a pure night/orb
 *    stage rather than Broadcast Dark's rotated accent beam),
 *  - every card's content sits on an inset, blurred, cyan-hairline-framed panel
 *    ({@link GLASS_SLAB}) with a visible dark margin on all four sides and a
 *    44px corner radius — that inset rounded rectangle is the silhouette that
 *    identifies the pack at thumbnail size, where Bold Type reads as a left
 *    spine and Broadcast Dark / Gold Foil read as full-bleed stacks,
 *  - a cyan floodlight cone falls on the slab's top edge from off-card, and
 *  - club identity is a **centred glowing circular badge** with the name and
 *    tagline stacked under it over a glowing cyan hairline ({@link sharedHeader})
 *    — a crest, not the logo-and-name row every other pack shares. The chip and
 *    the eyebrow tag are pinned out to the slab's top corners so the crest costs
 *    only the height it actually needs.
 *
 * The glass reads as glass without `backdrop-filter`: the translucent gradient
 * fill, the cyan hairline, the inset top highlight and the outer bloom carry it,
 * and the blur is additive on renderers that honour it.
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
 * Story background: the night-sky radial, then the two blurred neon orbs —
 * cyan top-left, tenant accent bottom-right — each pulsing on `hhGlow`
 * (defined app-side in `index.css`). Three stacked layers in the bundle.
 */
export const STORY_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 28%, var(--surface-top,#0d2138) 0%, var(--ink,#081426) 45%, var(--surface-deep,#04070d) 100%)"></div>` +
  `<div style="position:absolute;top:-120px;left:-120px;width:640px;height:640px;border-radius:50%;background:radial-gradient(circle,rgba(55,207,230,.34),transparent 62%);filter:blur(40px);animation:hhGlow 3.6s ease-in-out infinite"></div>` +
  `<div style="position:absolute;bottom:-160px;right:-140px;width:720px;height:720px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb, var(--gold,#FBAC27) 28%, transparent),transparent 62%);filter:blur(46px);animation:hhGlow 4.4s ease-in-out infinite"></div>`;

/**
 * Non-story background: the ORB FIELD, full-bleed.
 *
 * This used to be the chassis every pack's bundle shared — a night radial plus
 * Broadcast Dark's rotated accent beam and bottom panel glow — which is exactly
 * why the feed formats all looked alike. It is now the pack's own story stage
 * translated to the feed: the night radial with three blurred neon orbs — cyan
 * top-left, tenant accent well off the bottom-right corner, a smaller cyan orb
 * bottom-left. The accent orb is held back and pushed further out than the
 * story's: at feed proportions a strong accent wash over the cyan field mixes to
 * olive, which is why this reads cool with one warm corner rather than both.
 * The orbs are static rather than on `hhGlow` — the feed card is a still, and a
 * mid-pulse frame renders non-deterministically.
 *
 * Held deliberately brighter than the story's, because {@link GLASS_SLAB} sits
 * over most of it: the orbs have to read in the ~46px margin band and diffuse
 * through the panel.
 */
export const SHARED_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 92% at 50% 20%, var(--surface-top,#0d2138) 0%, var(--ink,#081426) 46%, var(--surface-deep,#04070d) 100%)"></div>` +
  `<div style="position:absolute;top:-190px;left:-170px;width:720px;height:720px;border-radius:50%;background:radial-gradient(circle,rgba(55,207,230,.46),transparent 62%);filter:blur(48px)"></div>` +
  `<div style="position:absolute;bottom:-260px;right:-240px;width:820px;height:820px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb, var(--gold,#FBAC27) 30%, transparent),transparent 60%);filter:blur(54px)"></div>` +
  `<div style="position:absolute;bottom:-190px;left:-150px;width:460px;height:460px;border-radius:50%;background:radial-gradient(circle,rgba(55,207,230,.30),transparent 60%);filter:blur(44px)"></div>`;

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

/** Margin between the card edge and the glass slab, on all four sides. */
const SLAB_INSET = 46;
/** The slab's corner radius — the pack's feed silhouette. */
const SLAB_RADIUS = 44;

/**
 * The inset glass slab, plus the floodlight cone that falls on its top edge.
 *
 * Two layers, painted in order under the content column:
 *  1. a cyan spotlight hanging off the top of the card, so the slab's top edge
 *     and the club crest sit in a pool of floodlight rather than flat dark;
 *  2. the slab itself — a translucent gradient fill, a cyan hairline frame, an
 *     inset top highlight (the lit rim of a glass sheet), an outer cyan bloom,
 *     and a tenant-accent wash pooling in the bottom edge.
 *
 * `backdrop-filter` is additive, not load-bearing: the fill, hairline, rim and
 * bloom already read as glass on a renderer that drops the blur.
 */
const GLASS_SLAB =
  `<div style="position:absolute;top:-70px;left:50%;transform:translateX(-50%);width:860px;height:600px;background:radial-gradient(56% 60% at 50% 0%, rgba(55,207,230,.30), transparent 72%);filter:blur(28px)"></div>` +
  `<div style="position:absolute;inset:${SLAB_INSET}px;border-radius:${SLAB_RADIUS}px;background:linear-gradient(162deg, rgba(255,255,255,.10), rgba(255,255,255,.03) 46%, rgba(4,9,18,.34));border:1px solid rgba(55,207,230,.42);backdrop-filter:blur(18px);box-shadow:0 0 70px -14px rgba(55,207,230,.6),inset 0 1px 0 rgba(255,255,255,.26),inset 0 0 90px -30px rgba(55,207,230,.55),inset 0 -110px 120px -110px color-mix(in srgb, var(--gold,#FBAC27) 30%, transparent)"></div>`;

/**
 * Non-story root: the orb field full-bleed, the glass slab inset over it, and
 * the content column clipped to the slab's bounds.
 *
 * The column is normally `inset:0`; the longhand override in `columnStyle`
 * re-seats it on the slab so every card's content lands inside the panel with
 * no per-card change. It stays a positioned ancestor, which is what lets
 * {@link sharedHeader} pin its chip and tag out to the slab's top corners.
 *
 * Note the three cards that build their own root (`record`,
 * `grade-leader-runs`, `grade-leader-wickets`) compose `SHARED_BG` directly and
 * so get the orb field but no slab — the same split Bold Type's spine leaves.
 */
export function sharedColumnRoot(columnInner: string, rootStyle = ""): string {
  return columnRoot(
    SHARED_BG + GLASS_SLAB,
    columnInner,
    "40px 48px 42px",
    rootStyle,
    `;top:${SLAB_INSET}px;left:${SLAB_INSET}px;right:${SLAB_INSET}px;bottom:${SLAB_INSET}px`,
  );
}

/**
 * Story root — a flex column, not the bundle's absolute positioning.
 *
 * Same reasoning as Gold Foil's: the bundle pins every block to a fixed `top`,
 * which is brittle the moment a block is conditional — removing the
 * Player-of-the-Match panel leaves dead space and an unset hero photo leaves
 * an empty framed box. A column reflows instead, so both collapse cleanly.
 */
export function storyColumnRoot(columnInner: string, columnStyle = ""): string {
  return columnRoot(STORY_BG, columnInner, "66px 70px 64px", "", columnStyle);
}

// ---------------------------------------------------------------------------
// Type treatments
// ---------------------------------------------------------------------------

/**
 * The pack's signature: display type under layered neon glow shadows.
 *
 * `"cyan"` is the fixed floodlight literal (white glyphs, cyan halo);
 * `"gold"` reads the tenant accent for both fill and halo, so a tenant's
 * colour still owns the emphasis while the cyan keeps the pack's identity.
 */
export function neonText(
  content: string,
  fontSize: number,
  glow: "cyan" | "gold" = "cyan",
  extraStyle = "",
): string {
  const colour =
    glow === "gold"
      ? `color:var(--gold,#F5B21A);text-shadow:0 0 30px color-mix(in srgb, var(--gold,#FBAC27) 85%, transparent),0 0 66px color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent)`
      : `color:#fff;text-shadow:0 0 30px rgba(55,207,230,.8),0 0 62px rgba(55,207,230,.5)`;
  return (
    `<div style="font-family:var(--disp,'Anton',sans-serif);font-size:${fontSize}px;line-height:.96;text-transform:uppercase;` +
    `${colour}${extraStyle}">${content}</div>`
  );
}

/** Accent-glow span for one word inside a `neonText` block (bundle's WIN/RESULT). */
export function neonGoldSpan(content: string): string {
  return `<span style="color:var(--gold,#F5B21A);text-shadow:0 0 30px color-mix(in srgb, var(--gold,#FBAC27) 85%, transparent),0 0 66px color-mix(in srgb, var(--gold,#FBAC27) 50%, transparent)">${content}</span>`;
}

/**
 * Glassmorphism panel — the pack's other signature surface. `extraStyle` must
 * start with `;` (padding / layout are per-call; the bundle varies them).
 */
export function glassPanel(inner: string, extraStyle = ""): string {
  return `<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:24px;backdrop-filter:blur(6px)${extraStyle}">${inner}</div>`;
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Story header: circular club logo in a cyan glow ring + name/tagline on the
 * left, a glowing cyan monospace eyebrow (`◍ <tag>`) on the right.
 */
export function storyHeader(tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:18px">` +
    `<div style="width:96px;height:96px;border-radius:50%;overflow:hidden;box-shadow:0 0 24px rgba(55,207,230,.6),0 0 0 2px rgba(55,207,230,.5)">${CLUB_LOGO_SLOT}</div>` +
    `<div><div style="font-weight:800;font-size:30px;line-height:1.05">{{clubName}}</div>` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.5);margin-top:6px">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.9)">◍ ${tag}</div>` +
    `</div>`
  );
}

/** Solid accent pill chip (non-story header, right side). */
export function accentChip(label: string): string {
  return `<div style="display:inline-block;background:var(--gold,#FBAC27);color:var(--accent-ink,#151515);font-weight:800;font-size:20px;line-height:1;letter-spacing:.03em;padding:11px 15px;border-radius:7px">${label}</div>`;
}

/**
 * The club crest: the logo inside a glowing cyan ring, on a dark lens.
 *
 * The bundle's story wordmark already IS a circular logo in a cyan glow ring —
 * this is that motif promoted to the feed formats' club identity, in place of
 * the square-logo-plus-name row the packs shared. The logo slot is the
 * `contain` variant so a wordmark-shaped file is letterboxed inside the ring
 * rather than cropped by it.
 */
const CLUB_BADGE =
  `<div style="width:92px;height:92px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
  `background:radial-gradient(circle at 50% 28%, rgba(55,207,230,.20), rgba(4,10,20,.92) 72%);` +
  `box-shadow:0 0 0 2px rgba(55,207,230,.72),0 0 30px rgba(55,207,230,.62),0 0 78px -12px rgba(55,207,230,.5)">` +
  `<div style="width:58px;height:58px">${CLUB_LOGO_SLOT}</div></div>`;

/**
 * Non-story header: the club crest centred on the slab, name and tagline
 * stacked under it over a glowing cyan hairline; the chip and the eyebrow tag
 * pinned out to the slab's top corners.
 *
 * Pinning the chip and tag absolutely (the column re-seated on the slab in
 * {@link sharedColumnRoot} is their positioning context) means the centred
 * crest costs only its own height — the header is barely taller than the
 * logo-and-name row it replaces, so the dense cards (ladder, team list,
 * leaderboards) keep their table area.
 */
export function sharedHeader(chipLabel: string, tag: string): string {
  return (
    `<div style="flex:none;position:relative;display:flex;flex-direction:column;align-items:center;text-align:center">` +
    `<div style="position:absolute;top:14px;left:0;font:700 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#37CFE6;text-shadow:0 0 16px rgba(55,207,230,.85)">◍ ${tag}</div>` +
    `<div style="position:absolute;top:0;right:0">${accentChip(chipLabel)}</div>` +
    CLUB_BADGE +
    `<div style="font-weight:800;font-size:28px;line-height:1;letter-spacing:.05em;text-transform:uppercase;margin-top:15px;text-shadow:0 0 26px rgba(55,207,230,.55)">{{clubName}}</div>` +
    `<div style="font:500 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.26em;color:rgba(255,255,255,.5);margin-top:9px">{{clubTagline}}</div>` +
    `<div style="width:210px;height:1px;margin-top:16px;background:linear-gradient(90deg,transparent,rgba(55,207,230,.9),transparent);box-shadow:0 0 14px rgba(55,207,230,.85)"></div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

/**
 * Story "presented by <sponsor>" line (column footer). In the bundle this sat
 * nested inside the Player-of-the-Match panel; the panel is gone (nothing
 * populates `potm.*`) but the presented-by line IS real tenant data, so it
 * survives as its own footer row, keeping the bundle's white sponsor name.
 */
export const PRESENTED_BY_STORY = `<div style="flex:none;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`;

/**
 * Story sponsors-off hashtag line (same slot as the presented-by line): the
 * bundle sets the full two-tag line in glowing cyan mono, so this binds
 * `hashtags` — not `clubHashtag` — deliberately. A card kind whose reference
 * design lacks `hashtags` needs its own footer or an allowlist entry.
 */
export const HASHTAG_FOOTER_STORY = `<div style="flex:none;text-align:center;font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#37CFE6;text-shadow:0 0 18px rgba(55,207,230,.8)">{{hashtags}}</div>`;

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
