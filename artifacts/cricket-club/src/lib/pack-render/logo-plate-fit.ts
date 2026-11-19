/**
 * The plate hugs the logo (Ash's decision, retest 7). A single sponsor logo's
 * light plate (`sponsorLogoPlates`) is drawn as big as the design's plate; once
 * the card is mounted and its logo has loaded, the plate is sized to the logo
 * as drawn (`huggedPlateBox`), so a wide or tall logo has no light band beside
 * it.
 *
 * The renderer marks each such plate with its own box, its logo's box, the box
 * it is placed in and the artboard's size (`logoPlateAttrs`); `fitLogoPlates`
 * reads the logo's natural size from its loaded image and moves the plate.
 * Every surface mounts the same markup (the previews, the fit check, the
 * server's still harness after its image wait), so a post is drawn as the
 * preview shows it. A logo that hasn't loaded keeps the design's plate.
 */
import { huggedPlateBox, type NaturalSize } from "./layer-layout";

type Box = { x: number; y: number; w: number; h: number };

/** Marks a light sponsor plate; its value is the logo layer's id. */
export const LOGO_PLATE_ATTR = "data-logo-plate";
const PLATE_BOX_ATTR = "data-plate-box";
const SLOT_BOX_ATTR = "data-plate-slot";
const FRAME_ATTR = "data-plate-frame";
const ART_ATTR = "data-plate-art";
/** Set on a plate sized to its logo; absent while it keeps the design's box. */
export const LOGO_PLATE_FITTED_ATTR = "data-logo-plate-fitted";

const fmt = (v: number) => String(Number((Number.isFinite(v) ? v : 0).toFixed(4)));
const boxAttr = (b: Box) => [b.x, b.y, b.w, b.h].map(fmt).join(" ");

const escapeAttr = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A plate wrapper's markers (with a leading space): its box and its logo's
 * (percent of the artboard), the box it is placed in (the artboard, or its
 * group's box) and the artboard's size in pixels.
 */
export function logoPlateAttrs(
  plate: Box,
  slot: Box,
  frame: Box,
  art: NaturalSize,
  slotId: string,
): string {
  return (
    ` ${LOGO_PLATE_ATTR}="${escapeAttr(slotId)}"` +
    ` ${PLATE_BOX_ATTR}="${boxAttr(plate)}"` +
    ` ${SLOT_BOX_ATTR}="${boxAttr(slot)}"` +
    ` ${FRAME_ATTR}="${boxAttr(frame)}"` +
    ` ${ART_ATTR}="${fmt(art.w)} ${fmt(art.h)}"`
  );
}

function readBox(el: Element, attr: string): Box | null {
  const parts = (el.getAttribute(attr) ?? "").trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts as [number, number, number, number];
  return { x, y, w, h };
}

/** The logo's image: in its layer, a sibling of the plate. */
function logoImage(plate: HTMLElement, slotId: string): HTMLImageElement | null {
  const parent = plate.parentElement;
  if (!parent) return null;
  for (const el of Array.from(parent.children)) {
    if (el.getAttribute("data-layer-id") === slotId) return el.querySelector("img");
  }
  return null;
}

/** The logo's natural size once it has loaded and decoded; null before. */
function naturalSize(img: HTMLImageElement | null): NaturalSize | null {
  if (!img || !img.complete || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return null;
  return { w: img.naturalWidth, h: img.naturalHeight };
}

const pct = (v: number) => `${Number(v.toFixed(3))}%`;

/**
 * Size every marked plate under `root` to its logo as drawn. Safe to run again
 * (each run starts from the design's box): a plate whose logo isn't loaded
 * keeps that box. Returns how many plates were fitted.
 */
export function fitLogoPlates(root: ParentNode): number {
  let fitted = 0;
  for (const plate of Array.from(root.querySelectorAll<HTMLElement>(`[${LOGO_PLATE_ATTR}]`))) {
    const box = readBox(plate, PLATE_BOX_ATTR);
    const slot = readBox(plate, SLOT_BOX_ATTR);
    const frame = readBox(plate, FRAME_ATTR);
    const [aw, ah] = (plate.getAttribute(ART_ATTR) ?? "").trim().split(/\s+/).map(Number);
    if (!box || !slot || !frame || !(frame.w > 0) || !(frame.h > 0)) continue;
    const natural = naturalSize(logoImage(plate, plate.getAttribute(LOGO_PLATE_ATTR) ?? ""));
    const hug = huggedPlateBox(box, slot, { w: aw ?? 0, h: ah ?? 0 }, natural);
    plate.style.left = pct(((hug.x - frame.x) / frame.w) * 100);
    plate.style.top = pct(((hug.y - frame.y) / frame.h) * 100);
    plate.style.width = pct((hug.w / frame.w) * 100);
    plate.style.height = pct((hug.h / frame.h) * 100);
    if (natural) {
      plate.setAttribute(LOGO_PLATE_FITTED_ATTR, "1");
      fitted++;
    } else plate.removeAttribute(LOGO_PLATE_FITTED_ATTR);
  }
  return fitted;
}

/**
 * `fitLogoPlates` now and again as each plate's logo loads (a live preview
 * mounts before its images arrive). Returns a function that stops listening.
 */
export function watchLogoPlates(root: HTMLElement): () => void {
  fitLogoPlates(root);
  const imgs = Array.from(root.querySelectorAll<HTMLElement>(`[${LOGO_PLATE_ATTR}]`))
    .map((plate) => logoImage(plate, plate.getAttribute(LOGO_PLATE_ATTR) ?? ""))
    .filter((img): img is HTMLImageElement => !!img && !naturalSize(img));
  const refit = () => fitLogoPlates(root);
  for (const img of imgs) img.addEventListener("load", refit);
  return () => {
    for (const img of imgs) img.removeEventListener("load", refit);
  };
}
