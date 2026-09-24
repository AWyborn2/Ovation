import { slot } from "../shared";
import { treatedPhoto, type PackLook } from "../skeleton-kit";

/**
 * Metallic Foil (pack id `gold-foil-v1`) on the shared card skeleton (U13).
 *
 * Restyled to the Social Studio design handoff (`Pack Card.dc.html`, pack
 * `foil`): every card is the kind's skeleton body (`../skeleton-designs`) in
 * this look —
 *
 *  - a warm radial stage, lit from the top in the tenant's metal,
 *  - the design's photo full-bleed as a **sepia ghost at ~22%**
 *    (`grayscale → sepia → contrast`) — dropped outright when
 *    none is bound, so a photo-less card is the plain stage,
 *  - a diagonal **pinstripe** in the metal,
 *  - a thin **double foil frame** inset from the card edge,
 *  - **foil-gradient numerals** (the ramp clipped to the glyphs, shining on the
 *    app's `hhShine` keyframes), foil rules/pills/bars,
 *  - a **square outline foil chip**.
 *
 * Tenant colour: the whole metal is derived from the tenant accent. Every ramp
 * stop is `var(--gold)` mixed toward white (highlights) or black (shadows) —
 * the idea the previous Gold Foil pack introduced — so Halls Head's gold reads
 * as brass, a purple club gets purple foil and a navy club steel. The pack's
 * handoff gold (#E8B94A) appears only as a `var()` fallback.
 */

/** The tenant accent, with the handoff's foil gold as the fallback only. */
export const G = "var(--gold,#E8B94A)";

/**
 * Vertical metal ramp for numerals — pale highlight → metal → shadow band →
 * pale, every stop mixed from the tenant accent. At Halls Head's #FBAC27 it
 * reproduces the original brass ramp.
 */
export const FOIL_RAMP =
  `linear-gradient(180deg,` +
  `color-mix(in srgb, ${G} 22%, #fff) 4%,` +
  `color-mix(in srgb, ${G} 62%, #fff) 32%,` +
  `color-mix(in srgb, ${G} 78%, #000) 60%,` +
  `color-mix(in srgb, ${G} 54%, #000) 78%,` +
  `color-mix(in srgb, ${G} 38%, #fff) 100%)`;

/**
 * Horizontal milled bar for fills (chip-free pills, rules, bars): shadow →
 * highlight → sheen → metal, from the tenant accent. The sheen stops short of
 * white so `--accent-ink` type stays legible on it.
 */
export const FOIL_BAR =
  `linear-gradient(90deg,` +
  `color-mix(in srgb, ${G} 70%, #000) 0%,` +
  `color-mix(in srgb, ${G} 82%, #fff) 40%,` +
  `color-mix(in srgb, ${G} 66%, #fff) 55%,` +
  `color-mix(in srgb, ${G} 84%, #000) 100%)`;

/**
 * Metal-coloured type: the accent lifted toward white so it reads as polished
 * foil — and stays legible on the dark stage for a deep tenant accent (navy,
 * purple), where the raw accent would sink into it.
 */
export const FOIL_TEXT = `color-mix(in srgb, ${G} 72%, #fff)`;

/** The stage — tinted toward near-black by the manifest's `inkTint`. */
const STAGE = "var(--ink,#15100A)";

/** Warm cream type (the handoff's foil ink). Pack identity, not accent. */
const CREAM = "#F6EBD0";

const VARS = [
  `color:${CREAM}`,
  `--sk-text:${CREAM}`,
  "--sk-muted:rgba(245,234,207,.62)",
  "--sk-sub:rgba(245,234,207,.84)",
  `--sk-line:color-mix(in srgb, ${G} 35%, transparent)`,
  // Chip: square, outlined in the metal.
  "--sk-chip-bg:rgba(0,0,0,.25)",
  `--sk-chip-ink:${FOIL_TEXT}`,
  `--sk-chip-border:.2cqmin solid ${G}`,
  "--sk-chip-radius:0",
  `--sk-accent-text:${FOIL_TEXT}`,
  "--sk-sponsor-bg:rgba(255,255,255,.92)",
  // Kit: foil fills, metal text, foil numerals.
  `--sk-acc:${FOIL_BAR}`,
  `--sk-acc-solid:${G}`,
  `--sk-acc-text:${FOIL_TEXT}`,
  "--sk-acc-ink:var(--accent-ink,#1A1206)",
  `--sk-num-bg:${FOIL_RAMP}`,
  "--sk-num-color:transparent",
  "--sk-num-fx:drop-shadow(0 .3cqmin 1.2cqmin rgba(0,0,0,.6))",
  "--sk-num-anim:hhShine 5.5s ease-in-out infinite",
  "--sk-panel:rgba(20,15,8,.72)",
  `--sk-panel-border:color-mix(in srgb, ${G} 32%, transparent)`,
  "--sk-row-r:0",
  "--sk-pill-r:0",
].join(";");

/** Stage, sepia photo ghost, pinstripe and the double foil frame (card cqmin). */
function layers(photo: string | undefined): string {
  return (
    `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb, ${G} 24%, ${STAGE}) 0%,${STAGE} 60%,color-mix(in srgb, ${STAGE} 55%, #000) 100%)"></div>` +
    (photo
      ? treatedPhoto(
          photo,
          "inset:0;opacity:.22;filter:grayscale(1) sepia(.8) contrast(1.2)",
          slot(photo, "photo"),
        )
      : "") +
    `<div style="position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(135deg,color-mix(in srgb, ${G} 8%, transparent) 0 .25cqmin,transparent .25cqmin 1.6cqmin)"></div>` +
    `<div style="position:absolute;inset:2.6cqmin;pointer-events:none;border:.35cqmin solid color-mix(in srgb, ${G} 75%, transparent)"></div>` +
    `<div style="position:absolute;inset:3.6cqmin;pointer-events:none;border:.12cqmin solid color-mix(in srgb, ${G} 45%, transparent)"></div>`
  );
}

export const FOIL_LOOK: PackLook = {
  vars: VARS,
  layers,
  // The photo is a background ghost, so the column may always run wide.
  column: { photo: "124cqmin", wide: "124cqmin" },
};
