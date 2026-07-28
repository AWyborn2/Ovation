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
 * Non-story background: the night radial with static cyan / accent corner
 * washes composited into one layer, plus the rotated accent beam and the
 * bottom panel glow (the non-story chassis the bundles share across packs).
 */
export const SHARED_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(90% 62% at 16% 10%, color-mix(in srgb, #37CFE6 22%, transparent), transparent 60%), radial-gradient(90% 62% at 88% 96%, color-mix(in srgb, var(--gold,#FBAC27) 20%, transparent), transparent 60%), radial-gradient(120% 90% at 50% 28%, var(--surface-top,#0d2138) 0%, var(--ink,#081426) 45%, var(--surface-deep,#04070d) 100%)"></div>` +
  `<div style="position:absolute;top:-180px;right:-160px;width:820px;height:1300px;background:linear-gradient(180deg,color-mix(in srgb, var(--gold,#FBAC27) 13%, transparent),transparent);transform:rotate(20deg)"></div>` +
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 66% at 50% 122%, color-mix(in srgb, var(--panel,#42342B) 40%, transparent), transparent 60%)"></div>`;

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

/** Non-story root: Neon Night background + the standard padded flex column. */
export function sharedColumnRoot(columnInner: string, rootStyle = ""): string {
  return columnRoot(SHARED_BG, columnInner, "58px 66px 52px", rootStyle);
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

/** Non-story header: club logo + name/tagline on the left, chip + tag right. */
export function sharedHeader(chipLabel: string, tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:20px">` +
    `<div style="width:100px;height:100px;flex:none">${slot("clubLogo", "logo", "rect")}</div>` +
    `<div><div style="font-weight:800;font-size:34px;line-height:1;letter-spacing:.01em">{{clubName}}</div>` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.55);margin-top:8px">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="text-align:right">${accentChip(chipLabel)}` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.6);margin-top:11px">${tag}</div></div>` +
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
