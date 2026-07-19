import { PhaseContent, PhaseTitle, StatTile } from "@workspace/cricket-club";

const panel: React.CSSProperties = {
  width: 384,
  background: "linear-gradient(160deg, #333F48 0%, #2a343c 100%)",
  borderRadius: 16,
  color: "#fff",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

/** The fixed-height swappable content region — here holding the bowling phase. */
export function BowlingPhaseRegion() {
  return (
    <div style={panel}>
      <PhaseContent>
        <PhaseTitle>Bowling</PhaseTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <StatTile label="Wickets" value={87} big />
          <StatTile label="Average" value={21.4} big />
          <StatTile label="Best Bowling" value="5/23" big />
          <StatTile label="5-Wicket Hauls" value={4} big />
        </div>
      </PhaseContent>
    </div>
  );
}
