import { AdSlide } from "@workspace/cricket-club";

// A full-frame admin-uploaded ad creative, rendered as an inline SVG data URI so
// the preview stays self-contained (no external image URLs).
const adCreative =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#0e2a1f"/><stop offset="1" stop-color="#1f5c3d"/>` +
      `</linearGradient></defs>` +
      `<rect width="1600" height="900" fill="url(#g)"/>` +
      `<circle cx="1320" cy="210" r="260" fill="#2a7d4f" opacity="0.35"/>` +
      `<circle cx="200" cy="760" r="200" fill="#2a7d4f" opacity="0.25"/>` +
      `<text x="120" y="330" font-family="Arial, sans-serif" font-size="110" font-weight="800" fill="#ffffff">PEEL TIMBER CO</text>` +
      `<text x="120" y="430" font-family="Arial, sans-serif" font-size="54" font-weight="600" fill="#c8e6c9">Decking · Fencing · Structural pine</text>` +
      `<rect x="120" y="520" width="560" height="96" rx="48" fill="#c8a951"/>` +
      `<text x="400" y="583" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#1f2430" text-anchor="middle">10% off for club members</text>` +
      `<text x="120" y="790" font-family="Arial, sans-serif" font-size="36" font-weight="500" fill="rgba(255,255,255,0.7)">Proud partner of Seacrest Cricket Club</text>` +
      `</svg>`,
  );

const ad = {
  id: "ad:7f6d2c9a-preview",
  name: "Peel Timber Co — member offer",
  imageUrl: adCreative,
};

// Full-screen kiosk ad slide (letterboxed on black, exactly as the kiosk shows
// it between honour boards). The wrapper supplies the screen frame.
export function KioskAdCreative() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 900,
        height: 506,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <AdSlide ad={ad as any} />
    </div>
  );
}
