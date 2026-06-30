import type { Sponsor, KioskAd } from "@workspace/api-client-react";
import type { HonourBrand } from "./types";

/**
 * Persistent "proudly supported by" sponsor-logo strip pinned to the bottom of
 * every honour-board screen in the kiosk. Rendered as a fixed overlay; the board
 * frame reserves space for it via the `--kiosk-strip-h` CSS variable so scrolled
 * content never slides underneath it.
 */
export function SponsorStrip({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null;
  return (
    <div className="hb-sponsor-strip" aria-hidden>
      <span className="hb-sponsor-strip-label">Proudly supported by</span>
      <div className="hb-sponsor-strip-logos">
        {sponsors.map((s) => (
          <img
            key={s.id}
            className="hb-sponsor-strip-logo"
            src={s.logoUrl}
            alt={s.name}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Full-screen sponsor slide rotated in between honour boards. Shows the club
 * crest, a thank-you heading and a grid of every active sponsor logo.
 */
export function SponsorSlide({
  sponsors,
  brand,
}: {
  sponsors: Sponsor[];
  brand: HonourBrand;
}) {
  return (
    <div className="hb-sponsor-slide">
      <div className="hb-sponsor-slide-head">
        {brand.logoUrl ? (
          <img className="hb-sponsor-slide-crest" src={brand.logoUrl} alt="" />
        ) : null}
        <div className="hb-sponsor-slide-title">Our Proud Sponsors</div>
        <div className="hb-sponsor-slide-sub">
          Thank you for supporting {brand.name}
        </div>
      </div>
      <div className="hb-sponsor-slide-grid">
        {sponsors.map((s) => (
          <div key={s.id} className="hb-sponsor-slide-cell">
            <img src={s.logoUrl} alt={s.name} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full-screen slide featuring a SINGLE sponsor large (used when the admin picks
 * the "one sponsor per slide" rotation style instead of the all-sponsors grid).
 */
export function SponsorSlideSingle({
  sponsor,
  brand,
}: {
  sponsor: Sponsor;
  brand: HonourBrand;
}) {
  return (
    <div className="hb-sponsor-slide">
      <div className="hb-sponsor-slide-head">
        {brand.logoUrl ? (
          <img className="hb-sponsor-slide-crest" src={brand.logoUrl} alt="" />
        ) : null}
        <div className="hb-sponsor-slide-title">Proudly Supported By</div>
      </div>
      <div className="hb-sponsor-solo">
        <div className="hb-sponsor-solo-cell">
          <img src={sponsor.logoUrl} alt={sponsor.name} />
        </div>
        <div className="hb-sponsor-slide-sub">{sponsor.name}</div>
      </div>
    </div>
  );
}

/**
 * Full-screen admin-uploaded ad creative, placed between boards in the kiosk
 * rotation (distinct from the club sponsor library).
 */
export function AdSlide({ ad }: { ad: KioskAd }) {
  return (
    <div className="hb-ad-slide">
      <img src={ad.imageUrl} alt={ad.name} />
    </div>
  );
}
