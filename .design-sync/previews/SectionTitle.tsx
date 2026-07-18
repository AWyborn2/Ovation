import { SectionTitle, StatTile } from "@workspace/cricket-club";

const panel: React.CSSProperties = {
  width: 348,
  background: "linear-gradient(160deg, #333F48 0%, #2a343c 100%)",
  borderRadius: 16,
  padding: "20px 22px",
  color: "#fff",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

/** Gold-tabbed section headings as used on the card back, one shown in context. */
export function BackSections() {
  return (
    <div style={panel}>
      <SectionTitle>Career</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
        <StatTile label="Debut" value={2014} />
        <StatTile label="Seasons" value={12} />
        <StatTile label="Matches" value={142} />
      </div>
      <SectionTitle>Batting</SectionTitle>
      <SectionTitle>Premierships</SectionTitle>
    </div>
  );
}
