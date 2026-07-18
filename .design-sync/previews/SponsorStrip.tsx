import { SponsorStrip } from "@workspace/cricket-club";

// Simple SVG wordmark logos as data URIs — no external URLs in previews.
const logo = (line1: string, line2: string, accent: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="140" viewBox="0 0 360 140">` +
      `<rect x="16" y="24" width="12" height="92" rx="4" fill="${accent}"/>` +
      `<text x="44" y="66" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#1f2430">${line1}</text>` +
      `<text x="44" y="102" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="${accent}">${line2}</text>` +
      `</svg>`,
  );

// Three sponsors: the strip's logo row is overflow:hidden, so at review-cell
// width a fourth wordmark clips at the edge.
const sponsors = [
  { id: 1, name: "Peel Timber Co", logoUrl: logo("PEEL", "TIMBER CO", "#8a5a2b"), link: "", cardKinds: [], displayOrder: 1 },
  { id: 2, name: "Mandurah Marine", logoUrl: logo("MANDURAH", "MARINE", "#1d6fa5"), link: "", cardKinds: [], displayOrder: 2 },
  { id: 3, name: "Baypoint Physio", logoUrl: logo("BAYPOINT", "PHYSIO", "#2a7d4f"), link: "", cardKinds: [], displayOrder: 3 },
];

// The strip is position:fixed in the kiosk; the transformed wrapper makes this
// preview cell its containing block so it pins to the bottom of the frame the
// way it pins to the bottom of the kiosk screen.
export function KioskSponsorStrip() {
  return (
    <div
      style={{
        position: "relative",
        transform: "translateZ(0)",
        height: 300,
        borderRadius: 12,
        overflow: "hidden",
        background: "linear-gradient(180deg, #101a2b 0%, #1c2a44 100%)",
        color: "rgba(255,255,255,0.85)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingBottom: 96, // space the board frame reserves via --kiosk-strip-h
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.04em" }}>
        Club Champions
      </div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
        Honour-board content scrolls here — the strip stays pinned below it.
      </div>
      <SponsorStrip sponsors={sponsors as any} />
    </div>
  );
}
