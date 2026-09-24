import { slot } from "../shared";
import { treatedPhoto, type PackLook } from "../skeleton-kit";

/**
 * Neon Night (pack id `neon-night-v1`) on the shared card skeleton (U13).
 *
 * Restyled to the Social Studio design handoff (`Pack Card.dc.html`, pack
 * `neon`) — floodlit cricket after dark. Every card is the kind's skeleton
 * body (`../skeleton-designs`) in this look —
 *
 *  - a night stage with two radial glows: the tenant accent top-right, the
 *    pack's hot pink bottom-left,
 *  - the design's photo full-bleed in mono at ~28%, screen-blended — dropped
 *    outright when none is bound,
 *  - a 5% grid in the accent,
 *  - a glowing accent **horizon line** low across the card,
 *  - **neon glow type**: white numerals under layered accent glows, glowing
 *    titles, club name and hashtag,
 *  - a **pill outline chip** with its own glow, rounded glass rows.
 *
 * Tenant colour: every glow, line, grid and fill is `var(--gold)` (or a
 * colour-mix of it), so a purple club gets purple neon. The handoff cyan
 * (#22D3EE) appears only as a `var()` fallback. The pink glow (#EC4899) is the
 * pack's fixed second light — part of its identity, not the tenant's. The stage
 * is the tenant's tone pulled toward night navy by the manifest's `inkTint`.
 */

/** The tenant accent, with the handoff's cyan as the fallback only. */
const N = "var(--gold,#22D3EE)";
/** Accent lifted toward white — neon tube colour for small type. */
const TUBE = `color-mix(in srgb, ${N} 72%, #fff)`;
const STAGE = "var(--ink,#05070D)";
/** The pack's fixed second light. */
const PINK = "rgba(236,72,153,.28)";
const ICE = "#EAFBFF";

const glow = (pct: number) => `color-mix(in srgb, ${N} ${pct}%, transparent)`;

const VARS = [
  `color:${ICE}`,
  `--sk-text:${ICE}`,
  "--sk-muted:rgba(234,251,255,.62)",
  "--sk-sub:rgba(234,251,255,.84)",
  `--sk-line:${glow(35)}`,
  // Pill outline chip with a glow.
  "--sk-chip-bg:rgba(5,7,13,.55)",
  `--sk-chip-ink:${TUBE}`,
  `--sk-chip-border:.2cqmin solid ${N}`,
  "--sk-chip-radius:99cqmin",
  `--sk-chip-glow:0 0 2cqmin ${glow(60)}`,
  `--sk-glow:0 0 2cqmin ${glow(60)}`,
  `--sk-logo-fx:drop-shadow(0 0 1.4cqmin ${glow(70)})`,
  `--sk-accent-text:${TUBE}`,
  "--sk-sponsor-bg:rgba(255,255,255,.92)",
  // Kit: accent fills with glow, tube-coloured text, glowing white numerals.
  `--sk-acc:${N}`,
  `--sk-acc-solid:${N}`,
  "--sk-acc-ink:var(--accent-ink,#031018)",
  `--sk-acc-text:${TUBE}`,
  "--sk-num-color:#FFFFFF",
  `--sk-num-glow:0 0 1.2cqmin ${glow(95)},0 0 4cqmin ${glow(55)}`,
  `--sk-title-glow:0 0 2cqmin ${glow(60)}`,
  `--sk-pill-glow:0 0 2cqmin ${glow(60)}`,
  "--sk-panel:rgba(8,14,26,.72)",
  `--sk-panel-border:${glow(35)}`,
  "--sk-row-r:1.4cqmin",
  "--sk-pill-r:99cqmin",
].join(";");

function layers(photo: string | undefined): string {
  return (
    `<div style="position:absolute;inset:0;background:radial-gradient(circle at 85% 15%,${glow(35)} 0%,transparent 40%),radial-gradient(circle at 10% 95%,${PINK} 0%,transparent 45%),${STAGE}"></div>` +
    (photo
      ? treatedPhoto(
          photo,
          "inset:0;opacity:.28;filter:grayscale(1) contrast(1.3);mix-blend-mode:screen",
          slot(photo, "photo"),
        )
      : "") +
    `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(${glow(9)} 1px,transparent 1px) 0 0/5cqmin 5cqmin,linear-gradient(90deg,${glow(9)} 1px,transparent 1px) 0 0/5cqmin 5cqmin"></div>` +
    // The horizon: low across the card, in the gap between body and footer.
    `<div style="position:absolute;left:0;right:0;bottom:13.6cqmin;height:.3cqmin;pointer-events:none;background:${N};box-shadow:0 0 2cqmin ${N},0 0 6cqmin ${glow(60)}"></div>`
  );
}

export const NEON_LOOK: PackLook = {
  vars: VARS,
  layers,
  // The photo is a dim full-bleed backdrop, so the column may always run wide.
  column: { photo: "124cqmin", wide: "124cqmin" },
};
