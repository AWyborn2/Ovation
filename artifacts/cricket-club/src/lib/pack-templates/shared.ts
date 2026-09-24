/**
 * Pack-agnostic template mechanics.
 *
 * These are the *conventions* the renderer reads — image slots, sponsor-variant
 * wrappers, format roots, field descriptors — as opposed to any one pack's
 * visual language (gradients, chips, headers, sponsor strips), which stays in
 * that pack's own `fragments.ts`.
 *
 * Splitting them out means a new pack inherits the binding contract for free
 * and only authors its look. Before Pack B these lived in
 * `broadcast-dark/fragments.ts`, where a second pack would have had to
 * duplicate them — four copies of the same `data-slot` string is exactly how
 * the renderer contract drifts.
 */

import type { PackTemplateField } from "./types";

// ---------------------------------------------------------------------------
// Image slots
// ---------------------------------------------------------------------------

/** Generic image slot; fills its wrapper (the wrapper keeps size/radius). */
export function slot(
  key: string,
  type: "photo" | "logo" | "sponsor",
  shape: "rect" | "rounded" | "circle" = "rect",
  radius?: number,
): string {
  const r = radius != null ? ` data-radius="${radius}"` : "";
  return `<div data-slot="${key}" data-slot-type="${type}" data-shape="${shape}"${r} style="width:100%;height:100%"></div>`;
}

/** Tenant club logo slot (bundle: `fit="contain" shape="rect"`). */
export const CLUB_LOGO_SLOT = `<div data-slot="clubLogo" data-slot-type="logo" data-shape="rect" data-fit="contain" style="width:100%;height:100%"></div>`;

// ---------------------------------------------------------------------------
// Format roots
// ---------------------------------------------------------------------------

/**
 * Template root: the 1080-wide card inner content at native size. The bundle's
 * preview scaling wrappers (width:var(--pw), transform:scale(var(--cscale)))
 * are stripped — the renderer owns sizing via the format's canvas dimensions
 * and the `--ch` / `--k` tokens.
 */
export function formatRoot(inner: string, rootStyle = ""): string {
  return `<div style="position:absolute;inset:0${rootStyle}">${inner}</div>`;
}

/**
 * Shared (non-story) root: background layers + fluid flex column.
 * `padding` is a pack-level choice — Broadcast Dark uses `58px 66px 52px`.
 */
export function columnRoot(
  layers: string,
  columnInner: string,
  padding: string,
  rootStyle = "",
  /**
   * Extra declarations for the COLUMN element (not the root) — e.g.
   * `;justify-content:space-between`. Must start with `;`.
   */
  columnStyle = "",
): string {
  return formatRoot(
    `${layers}<div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:${padding}${columnStyle}">${columnInner}</div>`,
    rootStyle,
  );
}

// ---------------------------------------------------------------------------
// Card skeleton (U12) — one markup for every format
// ---------------------------------------------------------------------------
//
// The design handoff (Pack Card.dc.html) builds every card, in every pack, on
// the same skeleton:
//
//   ┌───────────────────────────────────────────┐
//   │ [crest] CLUB NAME              [KIND CHIP] │  header (flex:none)
//   │         TAGLINE (mono)              tag    │
//   │                                           │
//   │   body — flex:1, min-height:0, centred    │  auto-fit body
//   │                                           │
//   │───────────────────────────────────────────│  footer rule
//   │ SUPPORTED BY [logo][logo][logo]  #HASHTAG │  sponsor strip + hashtag
//   └───────────────────────────────────────────┘
//
// Sizing is in container-query units rather than px, so ONE markup serves
// square 1080×1080, portrait 1080×1350, story 1080×1920 and landscape
// 1200×630:
//
//  - The skeleton root is `container-type:size`, so the header, footer and the
//    pack's background layers size in `cqmin` of the whole card (1cqmin =
//    10.8px on the 1080-wide formats, 6.3px on landscape).
//  - The BODY box is its own `container-type:size`, so body content sizes in
//    `cqmin` of the space left between header and footer. Authoring body
//    content to fit a 100×100 cqmin box therefore auto-scales it to whatever
//    the format leaves: it grows on portrait/story (where the box is taller
//    than it is wide, cqmin = its width) and shrinks to the height on square
//    and landscape. That is the handoff's "body auto-scaled to fit the
//    available height", done in CSS with no measuring pass.
//
// The skeleton is pack-agnostic: every colour and face it uses is a `--sk-*`
// custom property the pack sets on the root (`vars`), defaulting to neutral
// values. Tenant colours flow through because a pack's vars are themselves
// `var(--gold)` / `var(--ink)` / `var(--accent-ink)` references — never a
// literal pack gold. U13's packs reuse this with their own vars and layers.

/** Condensed display face for skeleton labels (club name, chip, hashtag). */
export const SK_COND = "var(--sk-cond,'Barlow Condensed','Arial Narrow',sans-serif)";
/** Monospace face for skeleton eyebrows and taglines. */
export const SK_MONO = "var(--sk-mono,'IBM Plex Mono',ui-monospace,Menlo,monospace)";

export interface SkeletonParts {
  /** The pack's `--sk-*` declarations (no leading `;`), set on the root. */
  vars: string;
  /** Absolutely-positioned background / signature layers (root cqmin). */
  layers: string;
  /** Header row — usually {@link skeletonHeader}. */
  header: string;
  /** Body content, authored in body-box cqmin to fit 100×100. */
  body: string;
  /** Footer row — usually {@link skeletonFooter}. */
  footer: string;
  /** Extra declarations for the body box, starting with `;`. */
  bodyStyle?: string;
}

/**
 * The skeleton root. `data-pack-skeleton` marks it for tests; the renderer
 * wraps it in the native-size `.pack-card-root`, which it fills.
 */
export function skeletonCard(parts: SkeletonParts): string {
  return (
    `<div data-pack-skeleton="1" style="position:absolute;inset:0;container-type:size;overflow:hidden;font-family:var(--sk-sans,'IBM Plex Sans',system-ui,sans-serif);${parts.vars}">` +
    parts.layers +
    `<div style="position:relative;height:100%;box-sizing:border-box;padding:6cqmin;display:flex;flex-direction:column;gap:3cqmin">` +
    parts.header +
    `<div data-skeleton-body="1" style="flex:1 1 0;min-height:0;min-width:0;container-type:size;display:flex;flex-direction:column;justify-content:center${parts.bodyStyle ?? ""}">${parts.body}</div>` +
    parts.footer +
    `</div></div>`
  );
}

/** Kind chip (top-right). Colours come from `--sk-chip-*`. */
export function skeletonChip(label: string): string {
  return `<div style="font-family:${SK_COND};font-weight:800;font-size:2.4cqmin;line-height:1;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;padding:1cqmin 2cqmin;background:var(--sk-chip-bg,rgba(255,255,255,.14));color:var(--sk-chip-ink,inherit);border:var(--sk-chip-border,0);border-radius:var(--sk-chip-radius,.6cqmin);box-shadow:var(--sk-chip-glow,none)">${label}</div>`;
}

/**
 * Header: crest + club name (condensed) + tagline (mono) on the left, the kind
 * chip and an optional mono tag under it on the right.
 */
export function skeletonHeader(chipHtml: string, tag = ""): string {
  const tagHtml = tag
    ? `<div style="font-family:${SK_MONO};font-weight:500;font-size:1.4cqmin;line-height:1;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap;color:var(--sk-muted,rgba(255,255,255,.6));text-shadow:0 .2cqmin .8cqmin rgba(0,0,0,.85)">${tag}</div>`
    : "";
  return (
    `<div style="flex:none;display:flex;align-items:center;justify-content:space-between;gap:2cqmin">` +
    `<div style="display:flex;align-items:center;gap:2cqmin;min-width:0">` +
    `<div style="width:9.5cqmin;height:9.5cqmin;flex:none;filter:var(--sk-logo-fx,none)">${CLUB_LOGO_SLOT}</div>` +
    `<div style="min-width:0">` +
    `<div style="font-family:${SK_COND};font-weight:800;font-size:4.4cqmin;line-height:1;letter-spacing:.01em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:var(--sk-glow,none)">{{clubName}}</div>` +
    `<div style="font-family:${SK_MONO};font-weight:500;font-size:1.5cqmin;line-height:1.2;letter-spacing:.22em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--sk-muted,rgba(255,255,255,.6));margin-top:.8cqmin">{{clubTagline}}</div>` +
    `</div></div>` +
    `<div style="flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:1cqmin">${chipHtml}${tagHtml}</div>` +
    `</div>`
  );
}

/**
 * Footer: the rule, then `left` (sponsor strip / presented-by line) and
 * `right` (hashtag). Both sides may carry `sponsorsOn` / `sponsorsOff` blocks.
 */
export function skeletonFooter(left: string, right: string): string {
  return (
    `<div style="flex:none;min-height:3cqmin;display:flex;align-items:center;justify-content:space-between;gap:2cqmin;padding-top:2cqmin;border-top:.15cqmin solid var(--sk-line,rgba(255,255,255,.14))">` +
    `<div style="display:flex;align-items:center;gap:2.4cqmin;min-width:0">${left}</div>` +
    `<div style="flex:none;display:flex;align-items:center">${right}</div>` +
    `</div>`
  );
}

/** "SUPPORTED BY" + the three sponsor logo tiles (sponsors-on only). */
export function skeletonSponsorLogos(): string {
  const tiles = [1, 2, 3]
    .map(
      (n) =>
        `<div style="width:10cqmin;height:4.4cqmin;flex:none;border-radius:.6cqmin;overflow:hidden;background:var(--sk-sponsor-bg,rgba(255,255,255,.92))">${slot(`sponsor${n}`, "sponsor", "rounded", 6)}</div>`,
    )
    .join("");
  return sponsorsOn(
    `<div style="display:flex;align-items:center;gap:1.4cqmin;flex:none"><span style="font-family:${SK_MONO};font-weight:500;font-size:1.5cqmin;letter-spacing:.18em;white-space:nowrap;color:var(--sk-muted,rgba(255,255,255,.6))">SUPPORTED BY</span>${tiles}</div>`,
  );
}

/**
 * "<verb> <sponsor>" line. The sponsor span carries `data-sponsor-name`, which
 * `dropEmptyPresentedBy` keys on to remove the whole line when no presenting
 * sponsor resolved. Not wrapped in a sponsor variant — callers decide.
 */
export function skeletonPresentedBy(verb: string): string {
  return `<div style="font-family:${SK_MONO};font-weight:500;font-size:1.5cqmin;line-height:1.2;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;color:var(--sk-muted,rgba(255,255,255,.6))">${verb} <span data-sponsor-name="1" style="color:var(--sk-text,#fff);font-weight:700">{{sponsorPresentedBy}}</span></div>`;
}

/** Club hashtag in the footer (right). `key` is the field to bind. */
export function skeletonHashtag(key: string): string {
  return `<div style="font-family:${SK_COND};font-weight:800;font-size:2.8cqmin;line-height:1;letter-spacing:.04em;white-space:nowrap;color:var(--sk-accent-text,inherit);text-shadow:var(--sk-glow,none)">{{${key}}}</div>`;
}

/** Secondary footer tag (e.g. `{{hashtagsExtra}}`), mono, left side. */
export function skeletonFooterTag(key: string): string {
  return `<div style="font-family:${SK_MONO};font-weight:600;font-size:1.5cqmin;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;color:var(--sk-muted,rgba(255,255,255,.6))">{{${key}}}</div>`;
}

// ---------------------------------------------------------------------------
// Sponsor variant blocks
// ---------------------------------------------------------------------------

/** Sponsors-on wrapper (layout-neutral; renderer removes the losing variant). */
export function sponsorsOn(inner: string): string {
  return `<div data-sponsors="on" style="display:contents">${inner}</div>`;
}

/** Sponsors-off wrapper. */
export function sponsorsOff(inner: string): string {
  return `<div data-sponsors="off" style="display:contents">${inner}</div>`;
}

// ---------------------------------------------------------------------------
// Field descriptors
// ---------------------------------------------------------------------------

export function textField(key: string, label: string, sample: string): PackTemplateField {
  return { key, type: "text", label, sample };
}

export function photoField(key: string, label: string, sample: string): PackTemplateField {
  return { key, type: "photo", label, sample };
}

export function logoField(key: string, label: string, sample: string): PackTemplateField {
  return { key, type: "logo", label, sample };
}

export function repeatField(key: string, label: string, sample: string): PackTemplateField {
  return { key, type: "repeat", label, sample };
}

/**
 * Fields present on every card's header, in every pack.
 *
 * Samples are deliberately club-agnostic (R6): the packs are transcribed from
 * bundles authored with real Halls Head data, and a sample default renders
 * verbatim for any tenant whose brand has not resolved yet.
 */
export function clubHeaderFields(): PackTemplateField[] {
  return [
    textField("clubName", "Club name", "YOUR CLUB"),
    textField("clubTagline", "Club tagline", "CRICKET CLUB · EST. YYYY"),
    logoField("clubLogo", "Club logo", "Club logo"),
  ];
}
