import { TeamLogo } from "@workspace/cricket-club";

// Base64 SVG data-URI (loads fine in headless capture): a simple fictional
// club roundel standing in for a stored PlayHQ logo image.
const STORED_LOGO =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="30" fill="#1c4587"/>' +
      '<circle cx="32" cy="32" r="30" fill="none" stroke="#f5c542" stroke-width="4"/>' +
      '<text x="32" y="40" text-anchor="middle" font-family="Arial" font-size="20" font-weight="800" fill="#f5c542">M</text>' +
      "</svg>",
  );

const label = (text: string) => (
  <span style={{ fontSize: 11, color: "var(--muted-foreground, #6b7280)", textAlign: "center" }}>{text}</span>
);

/**
 * Generated shield crests for clubs with no stored logo: initials derived from
 * 1-, 2- and 3-word club names, in each club's own colour pair, plus the
 * stored-image path at the same size for comparison.
 */
export function CrestFallbacksAndImage() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 28, padding: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <TeamLogo teamName="Seacrest CC" primaryColor="#123a5c" secondaryColor="#e8b93c" size={56} />
        {label("Seacrest CC")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <TeamLogo teamName="Mandurah" primaryColor="#2d5a3d" secondaryColor="#e8e8e8" size={56} />
        {label("Mandurah")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <TeamLogo teamName="Dunes Cricket Club" primaryColor="#5c1f2e" secondaryColor="#d9a441" size={56} />
        {label("Dunes Cricket Club")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <TeamLogo logoUrl={STORED_LOGO} teamName="Marlin Bay CC" primaryColor="#1c4587" secondaryColor="#f5c542" size={56} />
        {label("Stored logo image")}
      </div>
    </div>
  );
}

/** The generated crest across the sizes the cards actually use (32 / 52 / 72). */
export function CrestSizes() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 20, padding: 8 }}>
      <TeamLogo teamName="Seacrest CC" primaryColor="#123a5c" secondaryColor="#e8b93c" size={32} />
      <TeamLogo teamName="Seacrest CC" primaryColor="#123a5c" secondaryColor="#e8b93c" size={52} />
      <TeamLogo teamName="Seacrest CC" primaryColor="#123a5c" secondaryColor="#e8b93c" size={72} />
    </div>
  );
}
