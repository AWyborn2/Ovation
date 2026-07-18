import { SponsorSlide } from "@workspace/cricket-club";

const logo = (line1: string, line2: string, accent: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="140" viewBox="0 0 360 140">` +
      `<rect x="16" y="24" width="12" height="92" rx="4" fill="${accent}"/>` +
      `<text x="44" y="66" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#1f2430">${line1}</text>` +
      `<text x="44" y="102" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="${accent}">${line2}</text>` +
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

const sponsors = [
  { id: 1, name: "Peel Timber Co", logoUrl: logo("PEEL", "TIMBER CO", "#8a5a2b"), link: "", cardKinds: [], displayOrder: 1 },
  { id: 2, name: "Mandurah Marine", logoUrl: logo("MANDURAH", "MARINE", "#1d6fa5"), link: "", cardKinds: [], displayOrder: 2 },
  { id: 3, name: "Estuary Bakehouse", logoUrl: logo("ESTUARY", "BAKEHOUSE", "#b3452c"), link: "", cardKinds: [], displayOrder: 3 },
  { id: 4, name: "Baypoint Physio", logoUrl: logo("BAYPOINT", "PHYSIO", "#2a7d4f"), link: "", cardKinds: [], displayOrder: 4 },
  { id: 5, name: "Dunes Brewing Co", logoUrl: logo("DUNES", "BREWING CO", "#b98a1c"), link: "", cardKinds: [], displayOrder: 5 },
  { id: 6, name: "Foreshore Legal", logoUrl: logo("FORESHORE", "LEGAL", "#4b4f9e"), link: "", cardKinds: [], displayOrder: 6 },
];

// Full-screen "thank you" slide rotated between honour boards in the kiosk —
// white type on the kiosk's dark backdrop, so the wrapper supplies that backdrop.
export function AllSponsorsSlide() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 960,
        height: 600,
        borderRadius: 12,
        overflow: "hidden",
        background: "linear-gradient(180deg, #101a2b 0%, #1c2a44 100%)",
      }}
    >
      <SponsorSlide sponsors={sponsors as any} brand={brand as any} />
    </div>
  );
}
