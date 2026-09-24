import { slot } from "../shared";
import type { CardDeco, PackLook } from "../skeleton-kit";

/**
 * Bold Type (pack id `bold-type-v1`) on the shared card skeleton (U13).
 *
 * Restyled to the Social Studio design handoff (`Pack Card.dc.html`, pack
 * `bold`) — a solid club-colour POSTER: every card is the kind's skeleton body
 * (`../skeleton-designs`) in this look —
 *
 *  - the whole stage IS the tenant accent (`var(--gold)`),
 *  - type in the ink that reads on that accent (`var(--accent-ink)`: near-black
 *    on a light accent, white on a deep one),
 *  - a **slate wedge** bottom-right carrying the design's photo in mono,
 *    screen-blended — dropped outright (wedge and all) when no photo is bound,
 *  - a **giant outline word** behind everything, bottom-left,
 *  - **inverted chips, pills and rows**: stage-ink blocks with accent type,
 *    square corners, plain (untreated) display numerals.
 *
 * Tenant colour: the accent role is the stage itself, so the pack's gold
 * (#FBAC27) is only ever a `var()` fallback. Inverted blocks use
 * `var(--accent-ink)` as their fill — dark blocks with accent type on a gold
 * club, white blocks with purple type on a purple one — and the data panels
 * (rows, scorebug) sit on the tenant's stage tone `var(--ink)`.
 */

/** The stage: the tenant accent. */
const STAGE = "var(--gold,#FBAC27)";
/** Type on the stage (and the fill of inverted blocks). */
const INK = "var(--accent-ink,#10151B)";
/** The slate the wedge and data panels are cut from — the tenant's stage tone. */
const SLATE = "var(--ink,#10151B)";

const VARS = [
  `color:${INK}`,
  `--sk-text:${INK}`,
  `--sk-muted:color-mix(in srgb, ${INK} 70%, transparent)`,
  `--sk-sub:color-mix(in srgb, ${INK} 86%, transparent)`,
  `--sk-line:color-mix(in srgb, ${INK} 22%, transparent)`,
  // Inverted chip: an ink block with accent type, square.
  `--sk-chip-bg:${INK}`,
  `--sk-chip-ink:${STAGE}`,
  "--sk-chip-radius:0",
  `--sk-accent-text:${INK}`,
  "--sk-sponsor-bg:rgba(255,255,255,.94)",
  // Kit: inverted fills, ink "accent" text, slate data panels.
  `--sk-acc:${INK}`,
  `--sk-acc-solid:${INK}`,
  `--sk-acc-ink:${STAGE}`,
  `--sk-acc-text:${INK}`,
  `--sk-panel:${SLATE}`,
  `--sk-panel-border:${SLATE}`,
  "--sk-panel-text:#F2F5F8",
  "--sk-panel-muted:rgba(242,245,248,.66)",
  `--sk-panel-acc:color-mix(in srgb, ${STAGE} 70%, #fff)`,
  // The ladder's club row: a solid inverted block (a tint of the ink panel
  // cannot carry accent type legibly).
  `--sk-hi-row-bg:${INK}`,
  `--sk-hi-row-text:${STAGE}`,
  `--sk-hi-row-muted:color-mix(in srgb, ${STAGE} 80%, ${INK})`,
  "--sk-row-r:0",
  "--sk-pill-r:0",
].join(";");

/**
 * The slate wedge with the mono, screen-blended photo, bottom-right. The wedge
 * is a little shorter than the handoff's 62% (52%, capped at 56cqmin) so it
 * stays below hero numerals on square and below the body on story instead of
 * climbing into it. The slot is the sole child of a plain inner wrapper (the
 * shape full-bleed placement rewrites); the blend lives on the box above it.
 */
function wedge(key: string): string {
  const clip = "clip-path:polygon(18% 0,100% 0,100% 100%,0 100%)";
  return (
    `<div data-drop-if-empty="${key}" style="position:absolute;right:-6cqmin;bottom:-6cqmin;width:52%;height:min(52%,56cqmin);${clip};background:${SLATE};isolation:isolate;pointer-events:none">` +
    `<div style="position:absolute;inset:0;filter:grayscale(1) contrast(1.15);mix-blend-mode:screen;opacity:.85">` +
    `<div style="position:absolute;inset:0">${slot(key, "photo")}</div>` +
    `</div></div>`
  );
}

/** Giant outline word, bottom-left behind everything (card cqmin). */
function outlineWord(word: string): string {
  return `<div style="position:absolute;left:-3cqmin;bottom:-8cqmin;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:800;font-size:48cqmin;line-height:.8;text-transform:uppercase;white-space:nowrap;color:transparent;-webkit-text-stroke:.35cqmin color-mix(in srgb, ${INK} 22%, transparent);pointer-events:none">${word}</div>`;
}

function layers(photo: string | undefined, deco: CardDeco): string {
  return (
    `<div style="position:absolute;inset:0;background:${STAGE}"></div>` +
    outlineWord(deco.word) +
    (photo ? wedge(photo) : "")
  );
}

export const BOLD_LOOK: PackLook = {
  vars: VARS,
  layers,
  // Beside the wedge the column keeps to the left ~58% of the body.
  column: { photo: "58%", wide: "124cqmin" },
};
