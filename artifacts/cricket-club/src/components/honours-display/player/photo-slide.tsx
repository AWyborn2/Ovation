import type { KioskSlideshowPhoto } from "@workspace/api-client-react";
import type { HonourBrand } from "../types";

/**
 * One photo of a kiosk slideshow (honours kiosk redesign D2): the photo whole,
 * over a blurred copy of itself that fills the screen, with the club crest in
 * the corner and, when on, its grade and season caption.
 */
export function PhotoSlide({
  photo,
  brand,
  captions,
}: {
  photo: KioskSlideshowPhoto;
  brand: HonourBrand;
  captions: boolean;
}) {
  return (
    <div className="hb-photo-slide" data-testid="kiosk-photo">
      <img className="hb-photo-slide-fill" src={photo.url} alt="" aria-hidden="true" />
      <img className="hb-photo-slide-img" src={photo.url} alt={photo.caption ?? ""} />
      {brand.logoUrl ? <img className="hb-photo-slide-crest" src={brand.logoUrl} alt="" /> : null}
      {captions && photo.caption ? (
        <div className="hb-photo-slide-caption">{photo.caption}</div>
      ) : null}
    </div>
  );
}
