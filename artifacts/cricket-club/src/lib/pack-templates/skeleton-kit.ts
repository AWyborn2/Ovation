import type { PackTemplateFormats } from "./types";
import {
  SK_COND,
  SK_MONO,
  skeletonCard,
  skeletonChip,
  skeletonFooter,
  skeletonFooterTag,
  skeletonHashtag,
  skeletonHeader,
  skeletonPresentedBy,
  skeletonSponsorLogos,
  sponsorsOff,
  sponsorsOn,
} from "./shared";

/**
 * Skeleton kit (U13) — the card BODY vocabulary every restyled pack shares.
 *
 * The design handoff (`Pack Card.dc.html`) builds one body per card kind and
 * lets each pack restyle it purely through CSS custom properties (`--numbg`,
 * `--glow`, `--acctext`, `--panel`, `--chipr` …) plus its own background
 * layers. This module is that idea in template form: body pieces read
 * `--sk-*` variables the pack sets on the skeleton root (`PackLook.vars`), so
 * Metallic Foil gets foil-gradient numerals, Neon Night glowing type and
 * Sunset a frosted panel from the SAME markup, and `skeleton-designs.ts`
 * holds one body builder per kind instead of four copies.
 *
 * Broadcast Dark predates the kit and keeps its own `bdX` helpers (U12);
 * they are the same shapes with the variables resolved to Broadcast Dark's
 * values.
 *
 * Tenant colour: every default below is a `var(--gold)` / `var(--accent-ink)`
 * reference, and packs only override them with further tenant-derived values
 * (colour-mixes of `--gold`) or pack-identity treatment colours — so a purple
 * tenant accent reaches chips, pills, rules, bars and numerals in every pack.
 *
 * Units: everything here is inside the skeleton BODY box and sizes in its
 * cqmin (see `skeletonCard`) — authored to fit a 100×100 box.
 */

/** Layout variant a builder is asked for (same contract as Broadcast Dark's). */
export type KitFormat = "full" | "landscape";

/** Tenant display face for hero numerals and titles. */
export const K_DISP = "var(--disp,'Anton'),'Barlow Condensed',sans-serif";

/** The kit's variable references (with neutral, tenant-driven fallbacks). */
export const K = {
  /** Accent fill — chips, pills, rules, bars. May be a gradient (foil). */
  acc: "var(--sk-acc,var(--gold,#FBAC27))",
  /** Solid accent — borders and hairlines, where a gradient cannot go. */
  accSolid: "var(--sk-acc-solid,var(--gold,#FBAC27))",
  /** Type set ON the accent fill. */
  accInk: "var(--sk-acc-ink,var(--accent-ink,#10151B))",
  /** Accent-coloured type (eyebrows, grade letters, highlights). */
  accText: "var(--sk-acc-text,var(--gold,#FBAC27))",
  /** Body type colour. */
  text: "var(--sk-text,#F2F5F8)",
  /** Muted secondary type. */
  muted: "var(--sk-muted,rgba(242,245,248,.64))",
  /** Supporting sentence colour. */
  sub: "var(--sk-sub,rgba(242,245,248,.82))",
  /** Hairline rules. */
  line: "var(--sk-line,rgba(255,255,255,.14))",
  /** Row / box fill, its border, and the type set on it. */
  panel: "var(--sk-panel,rgba(255,255,255,.05))",
  panelBorder: "var(--sk-panel-border,rgba(255,255,255,.1))",
  panelText: "var(--sk-panel-text,inherit)",
  panelMuted: "var(--sk-panel-muted,var(--sk-muted,rgba(242,245,248,.64)))",
  panelAcc: "var(--sk-panel-acc,var(--sk-acc-text,var(--gold,#FBAC27)))",
  /** Row, pill and small-box corner radii. */
  rowR: "var(--sk-row-r,1cqmin)",
  pillR: "var(--sk-pill-r,.9cqmin)",
  /** Glow on accent fills (Neon). */
  pillGlow: "var(--sk-pill-glow,none)",
  /** Glow / shadow on display titles. */
  titleGlow: "var(--sk-title-glow,none)",
} as const;

// ---------------------------------------------------------------------------
// Pack look
// ---------------------------------------------------------------------------

/** Per-card decoration words a pack may use (Bold's outline word, Sunset's script). */
export interface CardDeco {
  /** Giant background word (Bold Type). Short — it is set at ~48cqmin. */
  word: string;
  /** Script word above the body (Sunset). */
  script: string;
}

/** A pack's identity on the skeleton. */
export interface PackLook {
  /** `--sk-*` declarations (and `color`) for the skeleton root, no leading `;`. */
  vars: string;
  /** Background + signature layers (card cqmin). `photo` is the slot key, if any. */
  layers(photo: string | undefined, deco: CardDeco): string;
  /** Extra declarations for the body box (starting with `;`). */
  bodyStyle?(photo: string | undefined): string;
  /** Markup placed before the body content (e.g. Sunset's script word). */
  bodyPrefix?(deco: CardDeco): string;
  /** CSS `max-width` for the content column: beside a photo, and without one. */
  column: { photo: string; wide: string };
}

export interface KitCardParts {
  /** Chip html (usually `kitChip("RESULT")`). */
  chip: string;
  tag?: string;
  /** Image-slot key of the design's photo, when it has one. */
  photo?: string;
  body: string;
  footer: string;
  deco: CardDeco;
}

/** A card on the shared skeleton in the pack's look. */
export function kitCard(look: PackLook, parts: KitCardParts): string {
  return skeletonCard({
    vars: look.vars,
    layers: look.layers(parts.photo, parts.deco),
    header: skeletonHeader(parts.chip, parts.tag),
    body: (look.bodyPrefix?.(parts.deco) ?? "") + parts.body,
    footer: parts.footer,
    bodyStyle: look.bodyStyle?.(parts.photo) ?? "",
  });
}

export const kitChip = skeletonChip;

/** Same markup for story and shared, plus the landscape variant. */
export function kitFormats(build: (fmt: KitFormat) => string): PackTemplateFormats {
  const full = build("full");
  return { story: full, shared: full, landscape: build("landscape") };
}

// ---------------------------------------------------------------------------
// Body pieces (body-box cqmin)
// ---------------------------------------------------------------------------

/** Body content column; `wide` for cards whose design has no photo. */
export function kColumn(look: PackLook, inner: string, wide = false): string {
  return `<div style="display:flex;flex-direction:column;align-items:flex-start;width:100%;max-width:${wide ? look.column.wide : look.column.photo};min-width:0">${inner}</div>`;
}

/** Title beside the data in landscape, above it otherwise. */
export function kSplit(look: PackLook, fmt: KitFormat, head: string, data: string): string {
  if (fmt === "landscape") {
    return (
      `<div style="display:flex;align-items:center;gap:8cqmin;width:100%;min-width:0">` +
      `<div style="flex:none;width:78cqmin;display:flex;flex-direction:column;align-items:flex-start">${head}</div>` +
      `<div style="flex:1;min-width:0;max-width:150cqmin">${data}</div>` +
      `</div>`
    );
  }
  return kColumn(look, head + `<div style="width:100%;margin-top:3.4cqmin">${data}</div>`, true);
}

/** Mono eyebrow (accent text by default). */
export function kEyebrow(text: string, color: string = K.accText, extra = ""): string {
  return `<div style="font-family:${SK_MONO};font-weight:600;font-size:2.6cqmin;line-height:1.3;letter-spacing:.22em;text-transform:uppercase;color:${color}${extra}">${text}</div>`;
}

/**
 * Hero numerals / display type with the pack's numeral treatment: a clipped
 * gradient (`--sk-num-bg` + `--sk-num-color:transparent`, Metallic Foil), a
 * glow (`--sk-num-glow`, Neon Night) or plain type.
 */
export function kNum(text: string, size: number, extra = ""): string {
  return (
    `<div style="font-family:${K_DISP};font-size:${size}cqmin;line-height:.9;text-transform:uppercase;margin-top:1.4cqmin;` +
    `background:var(--sk-num-bg,none);background-size:100% 220%;-webkit-background-clip:text;background-clip:text;` +
    `color:var(--sk-num-color,inherit);text-shadow:var(--sk-num-glow,none);filter:var(--sk-num-fx,none);animation:var(--sk-num-anim,none)${extra}">${text}</div>`
  );
}

/** Display title in the tenant face with the pack's title glow (no gradient). */
export function kTitle(text: string, size: number, extra = ""): string {
  return `<div style="font-family:${K_DISP};font-size:${size}cqmin;line-height:.9;text-transform:uppercase;margin-top:1.4cqmin;text-shadow:${K.titleGlow}${extra}">${text}</div>`;
}

/** Condensed caps line (Barlow Condensed 800). */
export function kCond(text: string, size: number, extra = ""): string {
  return `<div style="font-family:${SK_COND};font-weight:800;font-size:${size}cqmin;line-height:1;letter-spacing:.02em;text-transform:uppercase${extra}">${text}</div>`;
}

/** Accent rule between the hero and the name. */
export const K_RULE = `<div style="width:16cqmin;height:.9cqmin;background:${K.acc};box-shadow:${K.pillGlow};margin:3.4cqmin 0"></div>`;

/** Supporting sentence. */
export function kSub(text: string, extra = ""): string {
  return `<div style="font-size:3.1cqmin;line-height:1.4;font-weight:500;color:${K.sub};max-width:84cqmin${extra}">${text}</div>`;
}

/** Accent pill (result banners, equations, cap numbers). */
export function kPill(text: string, size = 5, extra = ""): string {
  return `<div style="font-family:${SK_COND};font-weight:800;font-size:${size}cqmin;line-height:1.05;letter-spacing:.04em;text-transform:uppercase;padding:1.3cqmin 3.2cqmin;background:${K.acc};color:${K.accInk};border-radius:${K.pillR};box-shadow:${K.pillGlow};text-shadow:none${extra}">${text}</div>`;
}

/** Presented-by line set in the body, for cards whose footer carries the logos. */
export function kPresentedByBody(verb: string, extra = ""): string {
  return sponsorsOn(
    `<div style="font-family:${SK_MONO};font-weight:500;font-size:2.2cqmin;line-height:1.3;letter-spacing:.16em;text-transform:uppercase;color:${K.muted}${extra}">${verb} <span data-sponsor-name="1" style="color:${K.text};font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  );
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

/**
 * Which field keys a design's footer binds. Packs declare slightly different
 * hashtag fields per design (a transcription choice kept for the tenants'
 * stored field data), so each builder takes these instead of assuming
 * Broadcast Dark's set.
 */
export interface FooterKeys {
  /** Hashtag with sponsors on. */
  on: string;
  /** Hashtag with sponsors off. */
  off: string;
  /** Secondary tag on the left with sponsors off. */
  offLeft?: string;
}

export function kHashtags(on: string, off = on): string {
  return sponsorsOn(skeletonHashtag(on)) + sponsorsOff(skeletonHashtag(off));
}

/** Presented-by line left (sponsors-on only designs), hashtag right. */
export function kFooterOn(verb: string, hashtagKey = "clubHashtag"): string {
  return skeletonFooter(sponsorsOn(skeletonPresentedBy(verb)), skeletonHashtag(hashtagKey));
}

/** Presented-by line left (or a secondary tag with sponsors off), hashtags right. */
export function kFooterPresented(verb: string, keys: FooterKeys): string {
  const left =
    sponsorsOn(skeletonPresentedBy(verb)) +
    (keys.offLeft ? sponsorsOff(skeletonFooterTag(keys.offLeft)) : "");
  return skeletonFooter(left, kHashtags(keys.on, keys.off));
}

/** Sponsor logo strip left, hashtags right. */
export function kFooterLogos(keys: Pick<FooterKeys, "on" | "off">): string {
  return skeletonFooter(skeletonSponsorLogos(), kHashtags(keys.on, keys.off));
}

// ---------------------------------------------------------------------------
// Photo layer helper
// ---------------------------------------------------------------------------

/**
 * A photo layer with a treatment (opacity / filter / blend / clip) on an
 * OUTER box marked `data-drop-if-empty`, and the slot as the sole child of a
 * plain full-size inner wrapper. The treatment therefore survives full-bleed
 * placement (which rewrites only the slot's direct wrapper), and a card with
 * no photo loses the whole layer rather than showing an empty frame.
 */
export function treatedPhoto(key: string, outerStyle: string, slotHtml: string): string {
  return `<div data-drop-if-empty="${key}" style="position:absolute;pointer-events:none;${outerStyle}"><div style="position:absolute;inset:0">${slotHtml}</div></div>`;
}
