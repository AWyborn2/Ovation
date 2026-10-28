import type { CSSProperties } from "react";
import type { KioskSlideshowPhoto } from "@workspace/api-client-react";
import { focusFit, focusTransform, type FocusTransform } from "@workspace/scorecard/photo-focus";
import type { HonourBrand } from "../types";

/** The TV's shape (the photo slide fills the 16:9 stage). */
export const SLIDE_ASPECT = 16 / 9;

/**
 * Without a focus box, "auto" still crops a photo whose shape is this close to
 * the screen's: it loses at most this share of the photo, all of it at the
 * edges.
 */
export const AUTO_CROP_MAX_LOSS = 0.08;

export type SlideFrame = "auto" | "fill" | "whole";

/** How one photo is shown: cropped to fill (aimed at its focus) or whole. */
export type SlideFraming = { mode: "fill"; transform: FocusTransform } | { mode: "whole" };

const CENTRED: FocusTransform = { focalX: 0.5, focalY: 0.5, zoom: 1 };

/**
 * Whether a photo fills the screen or shows whole. "whole" never crops. A
 * photo whose wide crops the admin switched off always shows whole. "fill"
 * crops, aimed at the focus box when there is one. "auto" (the default) crops
 * only when nothing that matters is cut: the focus box fits whole, or with no
 * box the photo is already close to the screen's shape; otherwise it shows the
 * whole photo, so a tall or 3:2 shot keeps the batter's head and feet.
 */
export function slideFraming(
  photo: Pick<KioskSlideshowPhoto, "width" | "height" | "focusBox" | "noWideCrop">,
  frame: SlideFrame,
  screenAspect: number = SLIDE_ASPECT,
): SlideFraming {
  if (frame === "whole" || photo.noWideCrop) return { mode: "whole" };
  const photoAspect = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 0;
  const focus =
    photo.focusBox && photoAspect > 0
      ? { box: photo.focusBox, width: photo.width, height: photo.height }
      : null;
  if (frame === "fill") {
    return { mode: "fill", transform: focus ? focusTransform(focus, screenAspect) : CENTRED };
  }
  if (focus) {
    return focusFit(focus, screenAspect) === "good"
      ? { mode: "fill", transform: focusTransform(focus, screenAspect) }
      : { mode: "whole" };
  }
  // No box and no size: show it whole rather than guess.
  if (!(photoAspect > 0)) return { mode: "whole" };
  const loss = 1 - Math.min(photoAspect, screenAspect) / Math.max(photoAspect, screenAspect);
  return loss <= AUTO_CROP_MAX_LOSS ? { mode: "fill", transform: CENTRED } : { mode: "whole" };
}

/**
 * One photo of a kiosk slideshow (honours kiosk redesign D2): cropped to fill
 * the screen, or the whole photo over a blurred copy of itself, as
 * `slideFraming` decides, with the club crest in the corner and, when on, its
 * grade and season caption.
 */
export function PhotoSlide({
  photo,
  brand,
  captions,
  frame = "auto",
}: {
  photo: KioskSlideshowPhoto;
  brand: HonourBrand;
  captions: boolean;
  frame?: SlideFrame;
}) {
  const framing = slideFraming(photo, frame);
  const t = framing.mode === "fill" ? framing.transform : null;
  const imgStyle: CSSProperties | undefined = t
    ? {
        objectPosition: `${t.focalX * 100}% ${t.focalY * 100}%`,
        transformOrigin: `${t.focalX * 100}% ${t.focalY * 100}%`,
        transform: t.zoom !== 1 ? `scale(${t.zoom})` : undefined,
      }
    : undefined;
  return (
    <div className="hb-photo-slide" data-frame={framing.mode} data-testid="kiosk-photo">
      {framing.mode === "whole" ? (
        <img className="hb-photo-slide-fill" src={photo.url} alt="" aria-hidden="true" />
      ) : null}
      <img
        className="hb-photo-slide-img"
        src={photo.url}
        alt={photo.caption ?? ""}
        style={imgStyle}
      />
      {brand.logoUrl ? <img className="hb-photo-slide-crest" src={brand.logoUrl} alt="" /> : null}
      {captions && photo.caption ? (
        <div className="hb-photo-slide-caption">{photo.caption}</div>
      ) : null}
    </div>
  );
}
