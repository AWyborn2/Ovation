import type { KioskSlideshowPhoto } from "@workspace/api-client-react";
import type { HonourBrand } from "../types";

/**
 * One photo of a kiosk slideshow (honours kiosk redesign D2): cropped to fill
 * the screen, or ("whole") the whole photo over a blurred copy of itself, with
 * the club crest in the corner and, when on, its grade and season caption.
 */
export function PhotoSlide({
  photo,
  brand,
  captions,
  frame = "fill",
}: {
  photo: KioskSlideshowPhoto;
  brand: HonourBrand;
  captions: boolean;
  frame?: "fill" | "whole";
}) {
  return (
    <div className="hb-photo-slide" data-frame={frame} data-testid="kiosk-photo">
      {frame === "whole" ? (
        <img className="hb-photo-slide-fill" src={photo.url} alt="" aria-hidden="true" />
      ) : null}
      <img className="hb-photo-slide-img" src={photo.url} alt={photo.caption ?? ""} />
      {brand.logoUrl ? <img className="hb-photo-slide-crest" src={brand.logoUrl} alt="" /> : null}
      {captions && photo.caption ? (
        <div className="hb-photo-slide-caption">{photo.caption}</div>
      ) : null}
    </div>
  );
}
