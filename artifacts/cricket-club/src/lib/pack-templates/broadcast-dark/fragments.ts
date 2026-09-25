import type { PackTemplateFormats } from "../types";
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
  slot,
  sponsorsOff,
  sponsorsOn,
} from "../shared";

/**
 * Broadcast Dark (U12) — the pack's own treatment on the shared card skeleton
 * (`../shared` → `skeletonCard`). Restyled to the Social Studio design handoff
 * (`Pack Card.dc.html`, pack `broadcast`):
 *
 *  - stage-colour background (`var(--ink)`),
 *  - the photo on the right 62% with a left and a bottom fade,
 *  - two accent slashes top-right (`skewX(-22deg)`),
 *  - an accent kind chip, condensed display numerals.
 *
 * Every card is ONE markup sized in container-query units, served for story,
 * portrait and square alike; data-heavy cards pass a `landscape` flag to their
 * builder for the summarised 1200×630 layout (top rows only, title beside the
 * table instead of above it).
 *
 * Units: skeleton pieces and the background layers size in the card's cqmin;
 * everything inside a card BODY sizes in the body box's cqmin and is authored
 * to fit a 100×100 box (see `skeletonCard`). Colours are tenant tokens —
 * `var(--gold)` (accent), `var(--ink)` (stage), `var(--accent-ink)` (type on
 * the accent) — with the pack's defaults only as `var()` fallbacks, so a
 * tenant's purple accent renders purple chips, rules and slashes.
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

/** Layout variant a builder is asked for. */
export type BdFormat = "full" | "landscape";

// ---------------------------------------------------------------------------
// Pack treatment
// ---------------------------------------------------------------------------

/** Accent (tenant `--gold`) with the pack's gold only as a fallback. */
export const ACC = "var(--gold,#FBAC27)";
/** Type set on the accent. */
export const ACC_INK = "var(--accent-ink,#10151B)";
/** Muted secondary type. */
export const MUTED = "rgba(242,245,248,.64)";
/** Hairline rules and row borders. */
export const LINE = "rgba(255,255,255,.14)";
/** Tenant display face for hero numerals and titles. */
export const DISP = "var(--disp,'Anton'),'Barlow Condensed',sans-serif";

const BD_VARS = [
  `--sk-muted:${MUTED}`,
  `--sk-line:${LINE}`,
  `--sk-chip-bg:${ACC}`,
  `--sk-chip-ink:${ACC_INK}`,
  "--sk-chip-radius:.6cqmin",
  `--sk-accent-text:${ACC}`,
  "--sk-sponsor-bg:rgba(255,255,255,.92)",
].join(";");

/** The two accent slashes, top-right (card cqmin). */
export const BD_SLASHES =
  `<div style="position:absolute;top:-4cqmin;right:14cqmin;width:3cqmin;height:18cqmin;background:${ACC};transform:skewX(-22deg);pointer-events:none"></div>` +
  `<div style="position:absolute;top:-4cqmin;right:9cqmin;width:1.4cqmin;height:13cqmin;background:${ACC};opacity:.55;transform:skewX(-22deg);pointer-events:none"></div>`;

/**
 * The right-hand photo with its left and bottom fades. Every piece is marked
 * `data-drop-if-empty`, so a card with no photo loses the whole treatment and
 * renders on the plain stage with its content column intact — never an empty
 * frame or an initials placeholder stretched over 62% of the card.
 *
 * The slot is the direct, sole child of one positioned wrapper, which is the
 * shape `makePhotoSlotFullBleed` needs to promote it to full bleed.
 */
export function bdPhoto(key: string): string {
  const ink = "var(--ink,#101216)";
  return (
    `<div style="position:absolute;top:0;right:0;bottom:0;width:62%" data-drop-if-empty="${key}">${slot(key, "photo")}</div>` +
    // Left fade: scoped to the photo box so it feathers the photo's edge into
    // the stage without darkening the content column twice.
    `<div data-drop-if-empty="${key}" style="position:absolute;top:0;right:0;bottom:0;width:62%;pointer-events:none;background:linear-gradient(90deg,${ink} 0%,color-mix(in srgb, ${ink} 62%, transparent) 28%,color-mix(in srgb, ${ink} 6%, transparent) 68%)"></div>` +
    // Bottom fade: full width, under the footer.
    `<div data-drop-if-empty="${key}" style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,color-mix(in srgb, ${ink} 95%, transparent) 0%,transparent 40%)"></div>`
  );
}

export interface BdCardParts {
  /** Chip html (usually `bdChip("RESULT")`). */
  chip: string;
  /** Optional mono tag under the chip. */
  tag?: string;
  /** Image-slot key for the right-hand photo, when the design has one. */
  photo?: string;
  body: string;
  footer: string;
}

/** A Broadcast Dark card on the shared skeleton. */
export function bdCard(parts: BdCardParts): string {
  return skeletonCard({
    vars: BD_VARS,
    layers: (parts.photo ? bdPhoto(parts.photo) : "") + BD_SLASHES,
    header: skeletonHeader(parts.chip, parts.tag),
    body: parts.body,
    footer: parts.footer,
    // Over a photo the body type gets a soft shadow for legibility.
    bodyStyle: parts.photo ? ";text-shadow:0 .3cqmin 1.6cqmin rgba(0,0,0,.45)" : "",
  });
}

export const bdChip = skeletonChip;

/**
 * Format map for a builder: the same markup for story and the shared
 * (portrait/square) layout — cqmin sizing makes it fit each — plus the
 * landscape variant.
 */
export function bdFormats(build: (fmt: BdFormat) => string): PackTemplateFormats {
  const full = build("full");
  return { story: full, shared: full, landscape: build("landscape") };
}

// ---------------------------------------------------------------------------
// Body pieces (body-box cqmin)
// ---------------------------------------------------------------------------

/** Body content column. `wide` is for cards with no photo. */
export function bdColumn(inner: string, wide = false): string {
  return `<div style="display:flex;flex-direction:column;align-items:flex-start;width:100%;max-width:${wide ? 124 : 100}cqmin;min-width:0">${inner}</div>`;
}

/**
 * Title beside the data in landscape, above it otherwise. Landscape has
 * ~2.6× the body's height in width, so stacking would leave the right half of
 * the card empty.
 */
export function bdSplit(fmt: BdFormat, head: string, data: string): string {
  if (fmt === "landscape") {
    return (
      `<div style="display:flex;align-items:center;gap:8cqmin;width:100%;min-width:0">` +
      `<div style="flex:none;width:78cqmin;display:flex;flex-direction:column;align-items:flex-start">${head}</div>` +
      `<div style="flex:1;min-width:0;max-width:150cqmin">${data}</div>` +
      `</div>`
    );
  }
  return bdColumn(head + `<div style="width:100%;margin-top:3.4cqmin">${data}</div>`, true);
}

/** Mono eyebrow (accent by default). */
export function bdEyebrow(text: string, color = ACC, extra = ""): string {
  return `<div style="font-family:${SK_MONO};font-weight:600;font-size:2.6cqmin;line-height:1.3;letter-spacing:.22em;text-transform:uppercase;color:${color}${extra}">${text}</div>`;
}

/** Display title / numerals in the tenant display face. */
export function bdDisplay(text: string, size: number, extra = ""): string {
  return `<div style="font-family:${DISP};font-size:${size}cqmin;line-height:.9;text-transform:uppercase;margin-top:1.4cqmin${extra}">${text}</div>`;
}

/** Condensed caps line (Barlow Condensed 800). */
export function bdCond(text: string, size: number, extra = ""): string {
  return `<div style="font-family:${SK_COND};font-weight:800;font-size:${size}cqmin;line-height:1;letter-spacing:.02em;text-transform:uppercase${extra}">${text}</div>`;
}

/** Accent rule between the hero and the name. */
export const BD_RULE = `<div style="width:16cqmin;height:.9cqmin;background:${ACC};margin:3.4cqmin 0"></div>`;

/** Supporting sentence. */
export function bdSub(text: string, extra = ""): string {
  return `<div style="font-size:3.1cqmin;line-height:1.4;font-weight:500;color:rgba(242,245,248,.8);max-width:84cqmin${extra}">${text}</div>`;
}

/** Accent pill (result banners, equations). */
export function bdAccentPill(text: string, size = 5, extra = ""): string {
  return `<div style="font-family:${SK_COND};font-weight:800;font-size:${size}cqmin;line-height:1.05;letter-spacing:.04em;text-transform:uppercase;padding:1.3cqmin 3.2cqmin;background:${ACC};color:${ACC_INK};border-radius:.9cqmin;text-shadow:none${extra}">${text}</div>`;
}

/**
 * A presented-by line set in the body (body cqmin), for cards whose footer is
 * already full with the sponsor logo strip. Same `data-sponsor-name` span the
 * renderer keys on to drop the line when no presenting sponsor resolved.
 */
export function bdPresentedByBody(verb: string, extra = ""): string {
  return sponsorsOn(
    `<div style="font-family:${SK_MONO};font-weight:500;font-size:2.2cqmin;line-height:1.3;letter-spacing:.16em;text-transform:uppercase;color:${MUTED}${extra}">${verb} <span data-sponsor-name="1" style="color:#fff;font-weight:700">{{sponsorPresentedBy}}</span></div>`,
  );
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

/**
 * Hashtag on the right in both sponsor states. Pack A's designs bind one key
 * with sponsors on and another with them off (`clubHashtag` / `hashtags`);
 * both are the tenant hashtag on a data-bearing render.
 */
export function bdHashtags(onKey: string, offKey = onKey): string {
  return sponsorsOn(skeletonHashtag(onKey)) + sponsorsOff(skeletonHashtag(offKey));
}

/** Presented-by line left, hashtag right (sponsors-on only designs). */
export function bdFooterOn(verb: string, hashtagKey = "clubHashtag"): string {
  return skeletonFooter(sponsorsOn(skeletonPresentedBy(verb)), skeletonHashtag(hashtagKey));
}

/**
 * Presented-by line left with sponsors on; with them off, an optional
 * secondary tag (e.g. `hashtagsExtra`) in its place. Hashtag right.
 */
export function bdFooterPresented(
  verb: string,
  opts: { onHashtag?: string; offHashtag?: string; offLeft?: string } = {},
): string {
  const left =
    sponsorsOn(skeletonPresentedBy(verb)) +
    (opts.offLeft ? sponsorsOff(skeletonFooterTag(opts.offLeft)) : "");
  return skeletonFooter(
    left,
    bdHashtags(opts.onHashtag ?? "clubHashtag", opts.offHashtag ?? "hashtags"),
  );
}

/** Sponsor logo strip (+ optional presented-by line) left, hashtag right. */
export function bdFooterLogos(presentedVerb?: string): string {
  const left =
    skeletonSponsorLogos() + (presentedVerb ? sponsorsOn(skeletonPresentedBy(presentedVerb)) : "");
  return skeletonFooter(left, bdHashtags("hashtags"));
}
