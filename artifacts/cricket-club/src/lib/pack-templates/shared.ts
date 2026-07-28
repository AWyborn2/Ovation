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
