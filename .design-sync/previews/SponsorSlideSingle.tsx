import { SponsorSlideSingle } from "@workspace/cricket-club";

const sponsorLogo =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="180" viewBox="0 0 520 180">` +
      `<rect x="20" y="30" width="16" height="120" rx="5" fill="#1d6fa5"/>` +
      `<text x="56" y="90" font-family="Arial, sans-serif" font-size="52" font-weight="800" fill="#1f2430">MANDURAH</text>` +
      `<text x="56" y="140" font-family="Arial, sans-serif" font-size="38" font-weight="600" fill="#1d6fa5">MARINE</text>` +
      `</svg>`,
  );

const crest =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="140" viewBox="0 0 120 140">` +
      `<path d="M60 4 112 24 v52 c0 34 -26 52 -52 60 C34 128 8 110 8 76 V24 Z" fill="#1e3a5f" stroke="#c8a951" stroke-width="5"/>` +
      `<text x="60" y="86" font-family="Georgia, serif" font-size="44" font-weight="700" fill="#c8a951" text-anchor="middle">SC</text>` +
      `</svg>`,
  );

const brand = {
  name: "Seacrest Cricket Club",
  shortName: "Seacrest CC",
  monogram: "SC",
  logoUrl: crest,
  backgroundColour: "#1e3a5f",
  primaryColour: "#c8a951",
};

const sponsor = {
  id: 2,
  name: "Mandurah Marine",
  logoUrl: sponsorLogo,
  link: "",
  cardKinds: [],
  displayOrder: 1,
};

// "One sponsor per slide" rotation style — a single sponsor hero on the kiosk's
// dark backdrop (wrapper supplies the backdrop the kiosk normally provides).
export function SingleSponsorHero() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 900,
        height: 560,
        borderRadius: 12,
        overflow: "hidden",
        background: "linear-gradient(180deg, #101a2b 0%, #1c2a44 100%)",
      }}
    >
      <SponsorSlideSingle sponsor={sponsor as any} brand={brand as any} />
    </div>
  );
}
