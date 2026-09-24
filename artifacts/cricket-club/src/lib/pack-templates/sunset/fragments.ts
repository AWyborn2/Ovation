import { slot } from "../shared";
import { treatedPhoto, type CardDeco, type PackLook } from "../skeleton-kit";

/**
 * Sunset (pack id `sunset-v1`) on the shared card skeleton (U13).
 *
 * Restyled to the Social Studio design handoff (`Pack Card.dc.html`, pack
 * `sunset`) — golden-hour, club-social warmth. Every card is the kind's
 * skeleton body (`../skeleton-designs`) in this look —
 *
 *  - the design's photo full-bleed and in full colour, dropped when none is
 *    bound (the card then sits on the plum base under the same wash),
 *  - an **orange → magenta → plum** overlay washing down the card,
 *  - a **sun glow** rising off the top-right corner in the tenant accent,
 *  - the body on a **frosted glass panel** (translucent white, hairline,
 *    backdrop blur),
 *  - a **script word** in Kaushan Script above the body ("Full time",
 *    "Game day" …, per kind),
 *  - pill chips, pills and rows.
 *
 * Tenant colour: the sun, pills, bars, rules and highlights are `var(--gold)`
 * (the handoff's #FFB547 appears only as a `var()` fallback); the script word
 * and small accent type are the accent lifted toward white. The wash's
 * orange / magenta / plum stops are the pack's own golden-hour light — its
 * identity, fixed on purpose. The stage under it is the tenant tone pulled
 * toward dusk by the manifest's `inkTint`.
 */

const S = "var(--gold,#FFB547)";
/** Accent lifted toward white: script word and small accent type. */
const GLOW_TEXT = `color-mix(in srgb, ${S} 55%, #fff)`;
const CREAM = "#FFF4EA";
const SOFT_SHADOW = "0 .4cqmin 2cqmin rgba(0,0,0,.35)";

const VARS = [
  `color:${CREAM}`,
  `--sk-text:${CREAM}`,
  "--sk-muted:rgba(255,244,234,.78)",
  "--sk-sub:rgba(255,244,234,.9)",
  "--sk-line:rgba(255,255,255,.28)",
  // Frosted pill chip.
  "--sk-chip-bg:rgba(255,255,255,.18)",
  `--sk-chip-ink:${CREAM}`,
  "--sk-chip-border:.15cqmin solid rgba(255,255,255,.45)",
  "--sk-chip-radius:99cqmin",
  `--sk-glow:${SOFT_SHADOW}`,
  "--sk-logo-fx:drop-shadow(0 .4cqmin 1.2cqmin rgba(0,0,0,.4))",
  `--sk-accent-text:${GLOW_TEXT}`,
  "--sk-sponsor-bg:rgba(255,255,255,.92)",
  // Kit: accent fills, lifted accent text, soft-shadowed type, pill rows.
  `--sk-acc:${S}`,
  `--sk-acc-solid:${S}`,
  "--sk-acc-ink:var(--accent-ink,#2A1036)",
  `--sk-acc-text:${GLOW_TEXT}`,
  `--sk-num-glow:${SOFT_SHADOW}`,
  `--sk-title-glow:${SOFT_SHADOW}`,
  "--sk-panel:rgba(255,255,255,.12)",
  "--sk-panel-border:rgba(255,255,255,.22)",
  "--sk-row-r:99cqmin",
  "--sk-box-r:2.4cqmin",
  "--sk-pill-r:99cqmin",
].join(";");

function layers(photo: string | undefined): string {
  return (
    // Plum base (the handoff's #2A1036, carrying some of the tenant's stage).
    `<div style="position:absolute;inset:0;background:color-mix(in srgb, var(--ink,#2A1036) 40%, #2A1036)"></div>` +
    (photo ? treatedPhoto(photo, "inset:0", slot(photo, "photo")) : "") +
    `<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,122,69,.55) 0%,rgba(194,24,91,.5) 50%,rgba(42,16,54,.92) 100%)"></div>` +
    // The sun, in the tenant accent.
    `<div style="position:absolute;right:-12cqmin;top:-12cqmin;width:46cqmin;height:46cqmin;border-radius:50%;pointer-events:none;background:radial-gradient(circle,color-mix(in srgb, ${GLOW_TEXT} 85%, transparent) 0%,color-mix(in srgb, ${S} 25%, transparent) 45%,transparent 70%)"></div>`
  );
}

/**
 * The frosted glass panel IS the body box: the skeleton body is a size
 * container, and container units resolve against its content box, so the
 * panel's padding comes out of the space body content auto-fits to. The top
 * padding leaves room for the script word.
 */
const GLASS =
  ";position:relative;align-self:flex-start;width:82%;box-sizing:border-box;" +
  "padding:8.6cqmin 3.4cqmin 3.4cqmin;background:rgba(255,255,255,.12);" +
  "border:.15cqmin solid rgba(255,255,255,.3);border-radius:3cqmin;" +
  "backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)";

/** Kaushan Script word in the panel's top padding (body cqmin). */
function scriptWord(deco: CardDeco): string {
  return `<div style="position:absolute;left:4.4cqmin;top:1.6cqmin;font-family:'Kaushan Script',cursive;font-size:6.4cqmin;line-height:1;white-space:nowrap;color:${GLOW_TEXT};text-shadow:0 .4cqmin 1.6cqmin rgba(0,0,0,.35)">${deco.script}</div>`;
}

export const SUNSET_LOOK: PackLook = {
  vars: VARS,
  layers,
  bodyStyle: () => GLASS,
  bodyPrefix: scriptWord,
  // Content sits inside the glass panel, full photo behind: always wide.
  column: { photo: "124cqmin", wide: "124cqmin" },
};
