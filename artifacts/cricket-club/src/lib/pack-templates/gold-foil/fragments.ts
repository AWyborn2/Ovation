import { columnRoot, slot } from "../shared";

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
 * The non-story (portrait/square) branch is deliberately much closer to
 * Broadcast Dark's shared layout — that is how the bundle authored it, so the
 * packs diverge mainly in the story format.
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
 * Non-story background: the same groove field composited into one layer, plus
 * the rotated gold beam and the bottom panel glow (shared with Broadcast Dark).
 */
export const SHARED_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 42%, transparent 40%, var(--surface-deep,#050403) 82%), repeating-radial-gradient(circle at 50% 40%, transparent 0 58px, color-mix(in srgb, var(--gold,#FBAC27) 9%, transparent) 58px 60px), var(--ink,#070603)"></div>` +
  `<div style="position:absolute;top:-180px;right:-160px;width:820px;height:1300px;background:linear-gradient(180deg,color-mix(in srgb, var(--gold,#FBAC27) 13%, transparent),transparent);transform:rotate(20deg)"></div>` +
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 66% at 50% 122%, color-mix(in srgb, var(--panel,#42342B) 40%, transparent), transparent 60%)"></div>`;

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

/** Non-story root: Gold Foil background + the standard padded flex column. */
export function sharedColumnRoot(columnInner: string, rootStyle = ""): string {
  return columnRoot(SHARED_BG, columnInner, "58px 66px 52px", rootStyle);
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
    `<div style="position:absolute;top:96px;left:0;right:0;text-align:center">` +
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

/** Non-story header: club logo + name/tagline on the left, chip + tag right. */
export function sharedHeader(chipLabel: string, tag: string): string {
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between">` +
    `<div style="display:flex;align-items:center;gap:20px">` +
    `<div style="width:100px;height:100px;flex:none">${slot("clubLogo", "logo", "rect")}</div>` +
    `<div><div style="font-weight:800;font-size:34px;line-height:1;letter-spacing:.01em">{{clubName}}</div>` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:rgba(255,255,255,.55);margin-top:8px">{{clubTagline}}</div></div>` +
    `</div>` +
    `<div style="text-align:right">${goldChip(chipLabel)}` +
    `<div style="font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.15em;color:rgba(255,255,255,.6);margin-top:11px">${tag}</div></div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

/** Story "presented by <sponsor>" line (absolute bottom). */
export const PRESENTED_BY_STORY = `<div style="position:absolute;bottom:66px;left:0;right:0;text-align:center;font-weight:500;font-size:20px;line-height:1;color:rgba(255,255,255,.5)">presented by <span style="color:var(--gold,#F5B21A);font-weight:700">{{sponsorPresentedBy}}</span></div>`;

/** Story sponsors-off hashtag line (same slot as the presented-by line). */
export const HASHTAG_FOOTER_STORY = `<div style="position:absolute;bottom:66px;left:0;right:0;text-align:center;font-weight:600;font-size:20px;line-height:1;letter-spacing:.14em;color:rgba(255,255,255,.4)">{{clubHashtag}}</div>`;

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
