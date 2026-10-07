import type { PackTemplateFormats } from "../types";
import { CLUB_LOGO_SLOT, skeletonCard, slot, sponsorsOff, sponsorsOn } from "../shared";
import { treatedPhoto } from "../skeleton-kit";
import {
  C,
  CK_SANS,
  background,
  clubLockup,
  cq,
  hashtagBlock,
  kindChip,
  monogram,
  sideFrame,
  supportedBy,
  topFrame,
  tricolourRule,
  watermark,
} from "./parts";

/**
 * Club Kit card assembly (handoff §2–§4): the shared skeleton root with the
 * Club Kit background, watermark crest, jumper-trim photo frame, header and
 * footer, per format.
 *
 * Unlike the other skeleton packs, Club Kit is authored in CARD cqmin (the
 * handoff's unit) rather than auto-fitted body cqmin, so the body box opts out
 * of being a size container, and each format gets its own markup: the photo
 * frame sits beside the body on square / landscape and above it on portrait /
 * story.
 */

export type CkFormat = "square" | "portrait" | "story" | "landscape";
export const CK_FORMATS: readonly CkFormat[] = ["square", "portrait", "story", "landscape"];

export const isTall = (f: CkFormat): boolean => f === "portrait" || f === "story";

/** Kinds whose portrait layout is list-heavy (shorter photo frame). */
export type FrameDepth = "list" | "hero";

/**
 * The top frame's minimum height per tall format (handoff §3 table). The frame
 * grows past this down to the body copy, so a short body (a spotlight, a
 * milestone) gets a tall photo rather than an empty band above the copy.
 */
export function topFrameHeight(f: CkFormat, depth: FrameDepth): string {
  if (f === "story") return "46cqh";
  return depth === "list" ? "24cqh" : "31cqh";
}

/**
 * Card padding + header height + the header→body gap (`skeletonCard`), in
 * card cqmin: how far the body's top sits below the card's top edge.
 */
const BODY_TOP = 6 + 10 + 3;
/** Clear space between the frame's lowest (left) corner and the body copy. */
const FRAME_CLEAR = 5;
/** Rise of the frame's sloped edge, left to right. */
const FRAME_SLOPE = "11cqmin";

/**
 * The tall formats' top frame, laid out in the body's flow: a flexing spacer
 * above the copy holds the frame, which reaches up to the card's top edge
 * and out to its sides, and down to just above the copy (never shorter than
 * the format's minimum, which a long body overlaps, as before).
 */
function fluidTopFrame(f: CkFormat, depth: FrameDepth, photo: string): string {
  return (
    `<div data-ck-frame-space="1" style="flex:1 1 0;min-height:0;position:relative">` +
    `<div style="position:absolute;left:-6cqmin;width:100cqw;top:-${BODY_TOP}cqmin;bottom:${FRAME_CLEAR}cqmin;min-height:${topFrameHeight(f, depth)}">` +
    topFrame(cq, "100%", photo, FRAME_SLOPE) +
    `</div></div>`
  );
}

/** Crest in the header: the club logo, or the monogram disc when there is none. */
export function headerCrest(): string {
  return (
    `<div style="position:relative;width:10cqmin;height:10cqmin;flex:none">` +
    `<div data-drop-if-image="clubLogo" style="position:absolute;inset:0">${monogram(cq, "{{clubMonogram}}")}</div>` +
    `<div data-drop-if-empty="clubLogo" style="position:absolute;inset:0">${CLUB_LOGO_SLOT}</div>` +
    `</div>`
  );
}

function header(chip: string): string {
  return (
    // Above the tall formats' frame, which sits later in the flow.
    `<div style="flex:none;position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:2cqmin">` +
    `<div style="display:flex;align-items:center;gap:2cqmin;min-width:0">${headerCrest()}${clubLockup(cq, "{{clubName}}", "{{clubTagline}}")}</div>` +
    kindChip(cq, chip) +
    `</div>`
  );
}

/** How a design's footer binds sponsors and the hashtag. */
export interface CkFooter {
  /** Hashtag field key. */
  hashtag: string;
  /**
   * Sponsor source: `logos` binds `sponsor1..3` logo tiles, `name` binds the
   * presenting sponsor's name (`sponsorPresentedBy`).
   */
  sponsors: "logos" | "name";
  /** Label before the sponsors ("SUPPORTED BY"). */
  label?: string;
  /** Emit a sponsors-off branch (the strip simply disappears). */
  off?: boolean;
}

function sponsorLogos(): string {
  return [1, 2, 3]
    .map(
      (n) =>
        `<div data-sponsor-tile="${n}" style="width:9cqmin;height:4cqmin;flex:none;overflow:hidden;background:rgba(255,255,255,.92)">${slot(`sponsor${n}`, "sponsor", "rect")}</div>`,
    )
    .join("");
}

export function footer(f: CkFooter): string {
  // The presenting-sponsor name span must be the last child of its tightest
  // <div>, so `dropEmptyPresentedBy` removes the whole line when it is empty.
  const strip =
    f.sponsors === "logos"
      ? // Logos; the presenting sponsor's name only when the club has no logos.
        `<div data-sponsor-strip="1" style="display:flex;align-items:center;gap:1.2cqmin;min-width:0">${supportedBy(cq, f.label)}${sponsorLogos()}</div>` +
        `<div data-sponsor-fallback="1"><div style="display:flex;align-items:center;gap:1.4cqmin;min-width:0">${supportedBy(cq, f.label)} <span data-sponsor-name="1" style="font-family:${CK_SANS};font-weight:700;font-size:2cqmin;white-space:nowrap;color:${C.chalk}">{{sponsorPresentedBy}}</span></div></div>`
      : `<div style="display:flex;align-items:center;gap:1.4cqmin;min-width:0">${supportedBy(cq, f.label)} <span data-sponsor-name="1" style="font-family:${CK_SANS};font-weight:700;font-size:2cqmin;white-space:nowrap;color:${C.chalk}">{{sponsorPresentedBy}}</span></div>`;
  return (
    `<div data-ck-footer="1" style="flex:none;position:relative;display:flex;flex-direction:column;gap:1.8cqmin">` +
    tricolourRule(cq) +
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:2cqmin;min-height:4cqmin">` +
    `<div style="display:flex;align-items:center;min-width:0">${sponsorsOn(strip)}${f.off ? sponsorsOff("") : ""}</div>` +
    hashtagBlock(cq, `{{${f.hashtag}}}`) +
    `</div></div>`
  );
}

/**
 * The design's photo inside the frame (dropped when no photo is bound). Both
 * frames crop a player shot far wider than it was taken, so it favours the
 * top of the photo (heads, not torsos) until the user sets a focal point.
 */
function framePhoto(key: string): string {
  return treatedPhoto(key, "inset:0", slot(key, "photo", "rect", undefined, "50% 22%"));
}

export interface CkCardParts {
  format: CkFormat;
  chip: string;
  /** Photo slot key for the frame, or undefined for no frame. */
  photo?: string;
  depth?: FrameDepth;
  body: string;
  footer: CkFooter;
  /** Body spans the full width even beside the side frame (trading card). */
  wide?: boolean;
  /** Full-card photo with a contrast scrim; used by the weekend cover only. */
  backdropPhoto?: string;
}

/** One Club Kit card at one format. */
export function ckCard(parts: CkCardParts): string {
  const { format } = parts;
  const tall = isTall(format);
  const photo = parts.photo ? framePhoto(parts.photo) : "";
  const sideFrameHtml = parts.photo && !tall ? sideFrame(cq, photo) : "";
  const topFrameHtml =
    parts.photo && tall ? fluidTopFrame(format, parts.depth ?? "hero", photo) : "";
  const layers =
    background() +
    (parts.backdropPhoto
      ? `<div data-drop-if-empty="${parts.backdropPhoto}" style="position:absolute;inset:0">${slot(parts.backdropPhoto, "photo", "rect")}` +
        `<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.76),rgba(0,0,0,.60) 40%,rgba(0,0,0,.78))"></div></div>`
      : "") +
    `<div data-drop-if-empty="clubLogo" style="position:absolute;inset:0;pointer-events:none">${watermark(cq, CLUB_LOGO_SLOT)}</div>` +
    sideFrameHtml;
  const maxW = !tall && parts.photo && !parts.wide ? "52%" : "100%";
  const bodyStyle =
    `;container-type:normal;justify-content:${tall ? "flex-end" : "center"}` +
    `;position:relative;max-width:${maxW}`;
  return skeletonCard({
    vars: `color:${C.chalk}`,
    layers,
    header: header(parts.chip),
    // The copy stays above the frame where a long body overlaps it.
    body: topFrameHtml
      ? topFrameHtml +
        `<div style="position:relative;z-index:1;display:flex;flex-direction:column;min-height:0;min-width:0;width:100%">${parts.body}</div>`
      : parts.body,
    footer: footer(parts.footer),
    bodyStyle,
  });
}

/** All four formats from one per-format builder. */
export function ckFormats(build: (f: CkFormat) => string): PackTemplateFormats {
  return {
    story: build("story"),
    portrait: build("portrait"),
    square: build("square"),
    landscape: build("landscape"),
  };
}
