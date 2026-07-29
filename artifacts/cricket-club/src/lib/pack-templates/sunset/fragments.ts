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
 * Non-story background: the same sunset wash with a larger beam (rotated 20°)
 * and the bottom panel glow, exactly as the bundle's `isNotStory` branch.
 */
export const SHARED_BG =
  `<div style="position:absolute;inset:0;background:radial-gradient(135% 108% at 50% 122%, color-mix(in srgb, var(--gold,#FBAC27) 34%, #1a0f08) 0%, var(--block,#2a160b) 30%, var(--ink,#120a07) 64%, var(--surface-deep,#0a0503) 100%)"></div>` +
  `<div style="position:absolute;top:-180px;right:-160px;width:820px;height:1300px;background:linear-gradient(180deg,color-mix(in srgb, var(--gold,#FBAC27) 13%, transparent),transparent);transform:rotate(20deg)"></div>` +
  `<div style="position:absolute;inset:0;background:radial-gradient(120% 66% at 50% 122%, color-mix(in srgb, var(--panel,#42342B) 40%, transparent), transparent 60%)"></div>`;

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

/** Non-story root: Sunset background + the standard padded flex column. */
export function sharedColumnRoot(columnInner: string, rootStyle = ""): string {
  return columnRoot(SHARED_BG, columnInner, "58px 66px 52px", rootStyle);
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

/** Solid accent pill chip (non-story header, right side). */
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
