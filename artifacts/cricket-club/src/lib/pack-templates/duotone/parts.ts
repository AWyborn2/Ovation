/**
 * Duotone (`duotone-v1`) — the third Social Studio pack (ADR-010 P8), from the
 * agreed brief `docs/plans/2026-10-20-new-social-pack-brief.md`.
 *
 * A full-bleed photo gradient-mapped to the club's colours (shadows → ink,
 * mid-tones → secondary, highlights → primary), a one-line headline ("ROUND 6",
 * the number in the primary), and a white rounded info sheet. With no photo
 * the card is the ink with a secondary glow, a zoomed and offset club logo at
 * 13%, a halftone dot screen and grain.
 *
 * One markup per format (story, portrait, square, landscape). Units are the
 * card's `cqmin`: the card root is `container-type:size`, so 1cqmin is 1% of
 * the card's shorter side (10.8px on the 1080-wide formats, 6.3px on
 * landscape). Colours are only the `--dt-*` tokens (`pack-render/duotone-vars.ts`)
 * with neutral fallbacks, plus white and greys on the sheet.
 */

import { CLUB_LOGO_SLOT, slot, sponsorsOn } from "../shared";
import type { PackTemplateFormats } from "../types";

export type DtFormat = "square" | "portrait" | "story" | "landscape";
export const DT_FORMATS: readonly DtFormat[] = ["square", "portrait", "story", "landscape"];

/** One family, Archivo (variable `wdth` 62–125), with the brief's fallbacks. */
export const DT_FONT = "'Archivo','Arial Black',system-ui,sans-serif";

/** Tenant colour tokens (with neutral fallbacks) and the sheet's greys. */
export const C = {
  ink: "var(--dt-ink,#10151B)",
  s: "var(--dt-s,#333F48)",
  p: "var(--dt-p,#FBAC27)",
  onP: "var(--dt-on-p,#10151B)",
  onS: "var(--dt-on-s,#FFFFFF)",
  pLight: "var(--dt-p-on-light,#B8740A)",
  pDark: "var(--dt-p-on-dark,#FBAC27)",
  label: "#5B656E",
  line: "#DADDE0",
  tint: "#F1F3F4",
} as const;

/**
 * Sheet type scale per format. Square, portrait and story are all 1080 wide
 * (same cqmin), so the taller cards set a little larger; landscape's cqmin is
 * 6.3px, so it sets larger in cqmin to stay readable.
 */
const SCALE: Record<DtFormat, number> = { square: 1, portrait: 1.06, story: 1.14, landscape: 1.3 };

/** A length in card cqmin, scaled for the format. */
export function u(f: DtFormat, v: number): string {
  return `${+(v * SCALE[f]).toFixed(2)}cqmin`;
}

/** Archivo at a width (`wdth` axis via font-stretch) and weight. */
export function face(stretch: number, weight: number): string {
  return `font-family:${DT_FONT};font-stretch:${stretch}%;font-weight:${weight}`;
}

/** Headline size (card cqmin) per format (brief §3). */
export const HEAD: Record<DtFormat, { size: number }> = {
  square: { size: 11 },
  portrait: { size: 11 },
  story: { size: 14 },
  landscape: { size: 14 },
};

/**
 * The width (card cqmin) a headline line has, per format, as measured in the
 * browser. Landscape's is the column left of a 43% sheet; a wider sheet
 * narrows it ({@link landHeadScale}).
 */
const HEAD_WIDTH: Record<DtFormat, number> = { square: 90, portrait: 90, story: 90, landscape: 97 };

/** Landscape's headline column beside a sheet of `width`% (px of the 1200×630 card, less padding and gap). */
const landColumn = (width: number) => 1137 * (1 - width / 100) - 31.5;

/** How much narrower a landscape headline line is beside a sheet wider than 43%. */
function landHeadScale(width: number): number {
  return landColumn(width) / landColumn(43);
}

/**
 * A headline line's width in tenths of an em at `size`, less a margin: the
 * finish pass sizes the text by its measured glyph widths against this.
 */
export function headLine(f: DtFormat, size = HEAD[f].size): number {
  return Math.floor((HEAD_WIDTH[f] / size) * 10) - 2;
}

// ---------------------------------------------------------------------------
// Background layers
// ---------------------------------------------------------------------------

/** Fractal-noise grain, as a data URI with no raw quotes or angle brackets. */
const GRAIN =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22220%22 height=%22220%22%3E%3Cfilter id=%22g%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%22.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23g)%22/%3E%3C/svg%3E";

/** Where the zoomed club logo sits: off the top-right, or the bottom-left on landscape. */
const LOGO_BOX: Record<DtFormat, string> = {
  square: "top:-52cqmin;right:-32cqmin",
  portrait: "top:-40cqmin;right:-32cqmin",
  story: "top:-14cqmin;right:-34cqmin",
  landscape: "left:-26cqmin;bottom:-44cqmin",
};

/**
 * The no-photo treatment (brief §2.4–2.5): ink, a secondary glow bottom-left
 * and a 22% primary glow top-right, the club logo as a zoomed greyscale
 * silhouette at 13%, then a halftone dot screen and grain. `gate` shows it
 * only while that photo slot is empty.
 */
export function noPhotoLayers(f: DtFormat, gate?: string): string {
  const attr = gate ? ` data-drop-if-image="${gate}"` : "";
  return (
    `<div data-dt-nophoto="1"${attr} style="position:absolute;inset:0;pointer-events:none">` +
    `<div style="position:absolute;inset:0;background:radial-gradient(120cqmin 100cqmin at 0% 100%,${C.s} 0%,transparent 72%),radial-gradient(90cqmin 80cqmin at 100% 0%,var(--dt-p-22,rgba(251,172,39,.22)) 0%,transparent 70%)"></div>` +
    `<div data-drop-if-empty="clubLogo" style="position:absolute;${LOGO_BOX[f]};width:110cqmin;height:110cqmin;opacity:.13;filter:grayscale(1) brightness(2.6)">${CLUB_LOGO_SLOT}</div>` +
    `<div style="position:absolute;inset:0;background-image:radial-gradient(circle,var(--dt-ink-55,rgba(16,21,27,.55)) 1.5px,transparent 1.9px);background-size:6px 6px"></div>` +
    `<div style="position:absolute;inset:0;opacity:.5;mix-blend-mode:soft-light;background-image:url('${GRAIN}');background-size:220px 220px"></div>` +
    `</div>`
  );
}

/** Height of the ink fade behind the headline (brief §2.4). */
const FADE: Record<DtFormat, string> = {
  square: "30%",
  portrait: "30%",
  story: "calc(13cqh + 24cqmin)",
  landscape: "35%",
};

/** Default photo anchor per format (brief §6.2); a moved focal point still wins. */
const FOCUS: Record<DtFormat, string> = {
  square: "50% 5%",
  portrait: "50% 5%",
  story: "50% 0%",
  landscape: "50% 5%",
};

/**
 * The full-bleed duotone photo (left 60% panel on landscape, faded into the
 * ink at its right edge) and the top-down ink fade behind the headline. Every
 * piece drops with the photo. `data-dt-photo` tells the pack's finish pass to
 * add the gradient map; `data-carousel-photo` marks it as the slide's photo.
 */
export function photoLayers(f: DtFormat, key: string): string {
  const land = f === "landscape";
  const box = land ? "top:0;left:0;bottom:0;width:60%" : "inset:0";
  return (
    `<div data-dt-photo="1" data-carousel-photo="1" data-drop-if-empty="${key}" style="position:absolute;${box};filter:var(--dt-filter,none)">${slot(key, "photo", "rect", undefined, FOCUS[f])}</div>` +
    (land
      ? `<div data-drop-if-empty="${key}" style="position:absolute;${box};background:linear-gradient(90deg,var(--dt-ink-0,rgba(16,21,27,0)) 55%,${C.ink} 100%)"></div>`
      : "") +
    `<div data-drop-if-empty="${key}" style="position:absolute;left:0;right:0;top:0;height:${FADE[f]};background:linear-gradient(180deg,var(--dt-ink-80,rgba(16,21,27,.8)) 0%,var(--dt-ink-0,rgba(16,21,27,0)) 100%)"></div>`
  );
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

/** Outer padding per format: story keeps its text out of the safe zones (top 13%, bottom 18%). */
const PAD: Record<Exclude<DtFormat, "landscape">, string> = {
  square: "5cqmin 4cqmin 4cqmin",
  portrait: "5cqmin 4cqmin 4cqmin",
  story: "calc(13cqh + 1cqmin) 4cqmin calc(17.7cqh + 1cqmin)",
};

export interface DtCardParts {
  f: DtFormat;
  /** Photo slot key; absent = the card always wears the no-photo treatment. */
  photo?: string;
  /** Headline html (see {@link headline}). */
  head: string;
  /** Sheet inner html. */
  sheet: string;
  /** The sheet takes all the height left (list cards), rather than its content's. */
  fill?: boolean;
  /** Lines under the sheet on the base (the sponsors page's next home game). */
  below?: string;
  /** The sheet's share of a landscape card's width (brief: 43% for a fixture). */
  landWidth?: number;
}

/**
 * A Duotone card: background layers, the headline top-left, and the sheet at
 * the bottom (the right column on landscape). The sheet grows upward, so the
 * photo window between headline and sheet shrinks with it.
 */
export function dtCard(parts: DtCardParts): string {
  const { f } = parts;
  const layers = parts.photo
    ? photoLayers(f, parts.photo) + noPhotoLayers(f, parts.photo)
    : noPhotoLayers(f);
  const open = `<div data-dt-card="1" style="position:absolute;inset:0;container-type:size;overflow:hidden;background:${C.ink};color:#fff;${face(100, 500)}">`;
  const sheet = sheetBox(f, parts.sheet, parts.fill);
  if (f === "landscape") {
    // A wider sheet leaves the headline a narrower line to fit.
    const k = landHeadScale(parts.landWidth ?? 43);
    const head = parts.head.replace(
      /data-dt-(line|wrap)="(\d+)"/g,
      (_m, kind: string, cap: string) => `data-dt-${kind}="${Math.floor(Number(cap) * k)}"`,
    );
    return (
      open +
      layers +
      `<div style="position:absolute;inset:0;box-sizing:border-box;padding:5cqmin;display:flex;gap:5cqmin">` +
      `<div style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:3cqmin">${head}${parts.below ?? ""}</div>` +
      `<div style="flex:none;width:${parts.landWidth ?? 43}%;min-height:0;display:flex;flex-direction:column">${sheet}</div>` +
      `</div></div>`
    );
  }
  return (
    open +
    layers +
    `<div style="position:absolute;inset:0;box-sizing:border-box;padding:${PAD[f]};display:flex;flex-direction:column;gap:3cqmin">` +
    `<div style="flex:none;min-width:0;padding:0 1cqmin">${parts.head}</div>` +
    `<div data-dt-window="1" style="flex:1 1 0;min-height:0"></div>` +
    sheet +
    (parts.below ?? "") +
    `</div></div>`
  );
}

function sheetBox(f: DtFormat, inner: string, fill = false): string {
  const land = f === "landscape";
  const grow = land || fill ? "flex:1 1 auto;min-height:0" : "flex:none";
  return (
    `<div data-dt-sheet="1" style="${grow};box-sizing:border-box;min-width:0;max-height:100%;overflow:hidden;background:#fff;color:${C.ink};border-radius:${land ? 5 : 5.5}cqmin;padding:${u(f, 3.6)} ${u(f, 4.2)};display:flex;flex-direction:column;box-shadow:0 1.2cqmin 4cqmin rgba(0,0,0,.28)">` +
    inner +
    `</div>`
  );
}

/** The four formats from one builder. */
export function dtFormats(build: (f: DtFormat) => string): PackTemplateFormats {
  return {
    story: build("story"),
    portrait: build("portrait"),
    square: build("square"),
    landscape: build("landscape"),
  };
}

// ---------------------------------------------------------------------------
// Headline
// ---------------------------------------------------------------------------

const HEAD_STYLE = (f: DtFormat, size = HEAD[f].size) =>
  `${face(125, 900)};font-size:calc(${size}cqmin * var(--fit,1));line-height:1.12;letter-spacing:-.01em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;overflow-wrap:anywhere;color:#fff;text-shadow:0 .4cqmin 2cqmin rgba(0,0,0,.35)`;

/**
 * The one-line headline ("ROUND 6"; the number turns primary in the finish
 * pass). It shrinks to fit its line rather than wrap (`data-dt-line`: the
 * line's width in tenths of an em). With
 * `dropIfEmpty`, the headline drops when its field is empty and the
 * `fallback` words take its place.
 */
export function headline(
  f: DtFormat,
  text: string,
  opts: { dropIfEmpty?: string; fallback?: string; attrs?: string; size?: number } = {},
): string {
  const cap = headLine(f, opts.size);
  const drop = opts.dropIfEmpty ? ` data-drop-if-field="${opts.dropIfEmpty}"` : "";
  const attrs = opts.attrs ? ` ${opts.attrs}` : "";
  return (
    `<div data-dt-head="1" data-dt-line="${cap}"${drop}${attrs} style="${HEAD_STYLE(f, opts.size)}">${text}</div>` +
    (opts.fallback
      ? `<div data-dt-fallback="1" data-dt-line="${cap}" style="${HEAD_STYLE(f, opts.size)}">${opts.fallback}</div>`
      : "")
  );
}

/**
 * A headline that may take two lines (a team list's grade, the sponsors
 * page's thank-you): shrinks, then wraps, never cut off (`data-dt-wrap`).
 */
export function wrapHeadline(f: DtFormat, text: string, size: number, attrs = ""): string {
  const cap = headLine(f, size);
  return `<div data-dt-wrap="${cap}"${attrs ? ` ${attrs}` : ""} style="${face(125, 900)};font-size:calc(${size}cqmin * var(--fit,1));line-height:1.06;letter-spacing:-.01em;text-transform:uppercase;max-width:100%;overflow-wrap:anywhere;color:#fff;text-shadow:0 .4cqmin 2cqmin rgba(0,0,0,.35)">${text}</div>`;
}

/** A small caps line on the base, above or below a headline. */
export function baseEyebrow(f: DtFormat, text: string, extra = ""): string {
  return `<div style="${face(100, 700)};font-size:${u(f, 2.4)};line-height:1.2;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82);text-shadow:0 .3cqmin 1.4cqmin rgba(0,0,0,.4)${extra}">${text}</div>`;
}

// ---------------------------------------------------------------------------
// Sheet pieces
// ---------------------------------------------------------------------------

/** A pill chip on the sheet: secondary (grade), primary (Home), or outline (Away). */
export function chip(
  f: DtFormat,
  text: string,
  tone: "s" | "p" | "outline" = "s",
  attrs = "",
  extra = "",
): string {
  const colours =
    tone === "p"
      ? `background:${C.p};color:${C.onP};border:${u(f, 0.25)} solid ${C.p}`
      : tone === "outline"
        ? `background:transparent;color:${C.ink};border:${u(f, 0.25)} solid ${C.ink}`
        : `background:${C.s};color:${C.onS};border:${u(f, 0.25)} solid ${C.s}`;
  return `<span${attrs ? ` ${attrs}` : ""} style="display:inline-block;box-sizing:border-box;max-width:100%;${face(100, 800)};font-size:${u(f, 2.3)};line-height:1.15;padding:${u(f, 0.55)} ${u(f, 1.8)};border-radius:99cqmin;overflow-wrap:anywhere;${colours}${extra}">${text}</span>`;
}

/** The Home/Away chip: Home in the primary; the finish pass outlines an Away one. */
export function homeAwayChip(f: DtFormat, key: string): string {
  return chip(f, `{{${key}}}`, "p", 'data-dt-ha="1"', ";flex:none;white-space:nowrap");
}

/** A muted label line on the sheet (labels 500, the brief's sheet grey). */
export function sheetMeta(f: DtFormat, text: string, extra = ""): string {
  return `<div style="${face(100, 500)};font-size:${u(f, 2.4)};line-height:1.3;color:${C.label}${extra}">${text}</div>`;
}

/** The sheet's divider. */
export function divider(f: DtFormat): string {
  return `<div style="height:${u(f, 0.2)};background:${C.line};margin:${u(f, 2)} 0"></div>`;
}

/** A crest box: the logo contained on white (never cropped). */
export function crestBox(f: DtFormat, size: number, inner: string, attrs = ""): string {
  return `<div${attrs ? ` ${attrs}` : ""} style="flex:none;width:${u(f, size)};height:${u(f, size)};display:flex;align-items:center;justify-content:center;overflow:hidden">${inner}</div>`;
}

/** An outline stand-in for a crest that is hidden or missing, so names stay aligned. */
export function crestStandIn(f: DtFormat, size: number, gate: string): string {
  return `<div data-drop-if-image="${gate}" style="flex:none;width:${u(f, size)};height:${u(f, size)};box-sizing:border-box;border:${u(f, 0.3)} solid ${C.line};border-radius:28% 28% 50% 50%"></div>`;
}

/**
 * A team name box under the shared name-fit rule (`data-fit`: shrink, then two
 * lines, then "…"). `data-dt-pair` boxes share the smaller of their scales in
 * the finish pass, so our name is never drawn bigger than theirs.
 */
export function nameBox(f: DtFormat, text: string, fit: number, size: number, extra = ""): string {
  return `<div data-fit="${fit}" data-dt-pair="names" style="flex:1 1 auto;min-width:0;${face(112, 900)};font-size:calc(${u(f, size)} * var(--fit,1));line-height:1.06;white-space:nowrap;overflow:hidden;text-overflow:ellipsis${extra}">${text}</div>`;
}

/** One optional data line (P5): a label or a primary dot, then the value on one line. */
export function dataLine(f: DtFormat, key: string, label: string, dot = false): string {
  return (
    `<div data-drop-if-field="${key}" data-content-line="${key}" style="display:flex;align-items:center;gap:${u(f, 1.4)};margin-top:${u(f, 1.1)};min-width:0;font-size:${u(f, 2.4)};line-height:1.25">` +
    (dot
      ? `<span style="flex:none;width:${u(f, 1.3)};height:${u(f, 1.3)};border-radius:50%;background:${C.p}"></span>`
      : `<span style="flex:none;${face(100, 500)};color:${C.label}">${label}</span>`) +
    `<span style="flex:1;min-width:0;${face(100, 700)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{${key}}}</span>` +
    `</div>`
  );
}

/** "Supported by" + one sponsor logo, at the sheet's foot (sponsors-on only). */
export function sponsorStrip(f: DtFormat, label = "Supported by", extra = ""): string {
  return sponsorsOn(
    `<div data-sponsor-strip="1" style="display:flex;align-items:center;gap:${u(f, 1.6)};min-width:0${extra}">` +
      `<span style="${face(100, 500)};font-size:${u(f, 2)};white-space:nowrap;color:${C.label}">${label}</span>` +
      `<div data-sponsor-tile="1" style="flex:none;width:${u(f, 13)};height:${u(f, 5.6)};display:flex;align-items:center;justify-content:center">${slot("sponsor1", "sponsor", "rect")}</div>` +
      `</div>`,
  );
}

/** The presenting sponsor's name, only when there is no logo to show (sponsors-on only). */
export function sponsorNameFallback(f: DtFormat, verb: string): string {
  return sponsorsOn(
    `<div data-sponsor-fallback="1"><div style="${face(100, 500)};font-size:${u(f, 2.1)};line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;color:${C.label}">${verb} <span data-sponsor-name="1" style="${face(100, 800)};color:${C.ink}">{{sponsorPresentedBy}}</span></div></div>`,
  );
}

/** The sheet's foot row: `left` and `right`, pushed to the bottom of a filled sheet. */
export function sheetFoot(f: DtFormat, left: string, right = ""): string {
  return (
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:${u(f, 2)};min-width:0;margin-top:${u(f, 2)}">` +
    `<div style="display:flex;align-items:center;gap:${u(f, 2)};min-width:0">${left}</div>` +
    (right ? `<div style="flex:none;display:flex;align-items:center">${right}</div>` : "") +
    `</div>`
  );
}

/** The club hashtag at the sheet's foot. */
export function hashtag(f: DtFormat, key: string): string {
  return `<div style="${face(112, 900)};font-size:${u(f, 2.3)};white-space:nowrap;color:${C.pLight}">{{${key}}}</div>`;
}

/** A flexible gap that pushes what follows to the bottom of a full-height sheet. */
export const PUSH = `<div style="flex:1 1 0;min-height:0"></div>`;
